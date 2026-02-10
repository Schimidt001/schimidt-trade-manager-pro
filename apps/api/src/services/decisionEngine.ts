// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Decision Engine
// ═══════════════════════════════════════════════════════════════
// Pipeline de decisão: MCL → Brains → Arbitration → PM → Executor → Ledger
// Usa packages/core para lógica pura.
// Persiste cada evento via ledgerService.
// Respeita Gate State (G0 shadow = não envia comandos).
//
// MARKET DATA: Alimentado por dados REAIS de FOREX via
// @schimidt-brain/adapters (Market Data Provider).
// O buildMockMclInput() foi substituído por buildRealMclInput().
//
// NEWS PROVIDER: Integrado via calendarService (FMP — Financial Modeling Prep).
// EventProximity é resolvido em tempo real a partir do calendário econômico.
// Se FMP falhar → provider_states.news = DOWN + DATA_DEGRADED.
// Nunca voltar para mock. Sem dados = comportamento conservador.
//
// REGRAS DE SEGURANÇA (ZERO FALLBACK SILENCIOSO):
// - Se dados reais falharem completamente → RISK_OFF, tick abortado
// - Se símbolo individual não tiver dados → excluído do tick (não mockado)
// - DATA_DEGRADED propagado como executionHealth ao MCL
// - Se calendar provider DOWN durante janela crítica → RISK_OFF ou NO_TRADE
// ═══════════════════════════════════════════════════════════════

import {
  computeMarketContext,
  BRAIN_REGISTRY,
  evaluateIntent,
} from "@schimidt-brain/core";
import type {
  MclInput,
  BrainInput,
  PmInput,
  RiskLimits,
  PortfolioState,
} from "@schimidt-brain/core";
import type { MclSnapshot, BrainIntent, PmDecision } from "@schimidt-brain/core";
import {
  MarketSession,
  EventProximity,
  ExecutionHealth,
  GlobalMode,
  Severity,
  ReasonCode,
} from "@schimidt-brain/contracts";
import {
  mapDecisionToExecutorCommands,
  fetchMultipleMarketData,
  buildRealMclInput,
  evaluateDataQuality,
  getDayCalendar,
  computeEventWindows,
} from "@schimidt-brain/adapters";
import type {
  MappingDecision,
  MappingIntent,
  MappingConfig,
  MarketDataSnapshot,
  EventWindow,
  CalendarServiceResponse,
} from "@schimidt-brain/adapters";
import type { LedgerEventInput } from "@schimidt-brain/db";
import type { Component } from "@schimidt-brain/db";
import { persistEvent } from "./ledgerService";
import { applyCommands } from "./executorService";
import { newEventId, newCorrelationId, nowISO } from "../utils/correlation";
import {
  getOperationalState,
  canSendCommands,
  setGlobalMode,
  setMockMode,
  setRiskOff,
  setProviderState,
} from "../config/gates";
import {
  getScenarioOverrides,
  isScenarioAllowed,
} from "../config/scenarioProfiles";
import type { TestScenario, ScenarioOverrides } from "../config/scenarioProfiles";

// ─── Tipos ──────────────────────────────────────────────────────

export interface TickInput {
  symbols: string[];
  /** Cenário de teste (G0/G1 only). AUTO = comportamento actual. */
  scenario?: TestScenario;
}

export interface TickResult {
  correlation_id: string;
  timestamp: string;
  gate: string;
  commands_sent: boolean;
  events_persisted: number;
  snapshots: MclSnapshot[];
  intents: BrainIntent[];
  decisions: PmDecision[];
  /** Cenário de teste utilizado neste tick (null se AUTO ou G2+). */
  scenario: TestScenario | null;
}

// ─── Default Risk Limits & Portfolio State (mock para Shadow) ───

const DEFAULT_RISK_LIMITS: RiskLimits = {
  max_drawdown_pct: 10,
  max_exposure_pct: 30,
  max_daily_loss_pct: 5,
  max_positions: 8,
  max_exposure_per_symbol_pct: 10,
  max_exposure_per_currency_pct: 20,
  max_correlated_exposure_pct: 25,
};

function resolveGlobalMode(): GlobalMode {
  const mode = getOperationalState().global_mode;
  if (Object.values(GlobalMode).includes(mode as GlobalMode)) {
    return mode as GlobalMode;
  }
  return GlobalMode.NORMAL;
}

function getDefaultPortfolioState(): PortfolioState {
  return {
    risk_state: {
      current_drawdown_pct: 0,
      current_exposure_pct: 0,
      open_positions: 0,
      daily_loss_pct: 0,
      available_risk_pct: DEFAULT_RISK_LIMITS.max_exposure_pct,
    },
    positions: [],
    risk_limits: DEFAULT_RISK_LIMITS,
    global_mode: resolveGlobalMode(),
    cooldowns: [],
  };
}

// ─── Mock MCL Input Builder (LEGACY — mantido para cenários de teste) ───
// Usado APENAS quando scenarioOverrides está ativo (G0/G1 test scenarios).
// Em produção (AUTO), buildRealMclInput() é usado.

interface SymbolProfile {
  session: typeof MarketSession[keyof typeof MarketSession];
  event_state: typeof EventProximity[keyof typeof EventProximity];
  m15Override: "buildup" | "raid" | "clean";
  h1Override: "trending" | "ranging";
  volume_ratio: number;
  correlation_index: number;
  session_overlap: number;
  range_expansion: number;
}

const SYMBOL_PROFILES: Record<string, SymbolProfile> = {
  EURUSD: {
    session: MarketSession.LONDON,
    event_state: EventProximity.NONE,
    m15Override: "buildup",
    h1Override: "ranging",
    volume_ratio: 0.7,
    correlation_index: 0.5,
    session_overlap: 0.5,
    range_expansion: 1.0,
  },
  GBPUSD: {
    session: MarketSession.LONDON,
    event_state: EventProximity.NONE,
    m15Override: "clean",
    h1Override: "trending",
    volume_ratio: 1.5,
    correlation_index: 0.5,
    session_overlap: 0.4,
    range_expansion: 1.0,
  },
  USDJPY: {
    session: MarketSession.ASIA,
    event_state: EventProximity.NONE,
    m15Override: "clean",
    h1Override: "ranging",
    volume_ratio: 1.1,
    correlation_index: 0.1,
    session_overlap: 0.4,
    range_expansion: 1.0,
  },
};

const DEFAULT_PROFILE: SymbolProfile = {
  session: MarketSession.LONDON,
  event_state: EventProximity.NONE,
  m15Override: "buildup",
  h1Override: "ranging",
  volume_ratio: 0.7,
  correlation_index: 0.5,
  session_overlap: 0.5,
  range_expansion: 1.0,
};

function buildMockMclInput(
  symbol: string,
  eventId: string,
  correlationId: string,
  timestamp: string,
  scenarioOverrides?: ScenarioOverrides | null
): MclInput {
  const basePrice = 1.08; // Base price para pares Forex
  const symbolProfile = SYMBOL_PROFILES[symbol] ?? DEFAULT_PROFILE;
  const profile = scenarioOverrides
    ? {
        session: scenarioOverrides.session,
        event_state: scenarioOverrides.event_state,
        m15Override: scenarioOverrides.m15Override,
        h1Override: scenarioOverrides.h1Override,
        volume_ratio: scenarioOverrides.volume_ratio,
        correlation_index: scenarioOverrides.correlation_index,
        session_overlap: scenarioOverrides.session_overlap,
        range_expansion: scenarioOverrides.range_expansion,
      }
    : symbolProfile;

  let h1Bars;
  if (profile.h1Override === "trending") {
    h1Bars = [
      { open: basePrice * 0.990, high: basePrice * 0.995, low: basePrice * 0.988, close: basePrice * 0.994, volume: 2000, timestamp },
      { open: basePrice * 0.994, high: basePrice * 1.000, low: basePrice * 0.992, close: basePrice * 0.999, volume: 2200, timestamp },
      { open: basePrice * 0.999, high: basePrice * 1.006, low: basePrice * 0.997, close: basePrice * 1.005, volume: 2500, timestamp },
    ];
  } else {
    h1Bars = [
      { open: basePrice * 0.998, high: basePrice * 1.002, low: basePrice * 0.997, close: basePrice * 0.999, volume: 2000, timestamp },
      { open: basePrice * 0.999, high: basePrice * 1.004, low: basePrice * 0.998, close: basePrice * 1.001, volume: 2200, timestamp },
      { open: basePrice * 1.001, high: basePrice * 1.003, low: basePrice * 0.999, close: basePrice * 1.000, volume: 2500, timestamp },
    ];
  }

  let m15Bars;
  if (profile.m15Override === "buildup") {
    m15Bars = [
      { open: basePrice * 1.000, high: basePrice * 1.010, low: basePrice * 1.000, close: basePrice * 1.005, volume: 800, timestamp },
      { open: basePrice * 1.003, high: basePrice * 1.005, low: basePrice * 1.001, close: basePrice * 1.004, volume: 400, timestamp },
    ];
  } else if (profile.m15Override === "raid") {
    m15Bars = [
      { open: basePrice * 1.000, high: basePrice * 1.006, low: basePrice * 0.998, close: basePrice * 1.003, volume: 800, timestamp },
      { open: basePrice * 1.004, high: basePrice * 1.008, low: basePrice * 1.000, close: basePrice * 1.0041, volume: 2000, timestamp },
    ];
  } else {
    m15Bars = [
      { open: basePrice * 1.003, high: basePrice * 1.006, low: basePrice * 1.002, close: basePrice * 1.004, volume: 800, timestamp },
      { open: basePrice * 1.004, high: basePrice * 1.007, low: basePrice * 1.003, close: basePrice * 1.005, volume: 900, timestamp },
    ];
  }

  return {
    symbol,
    timestamp,
    ohlc: {
      D1: [
        { open: basePrice, high: basePrice * 1.01, low: basePrice * 0.99, close: basePrice * 1.005, volume: 10000, timestamp },
      ],
      H4: [
        { open: basePrice, high: basePrice * 1.008, low: basePrice * 0.995, close: basePrice * 1.003, volume: 5000, timestamp },
      ],
      H1: h1Bars,
      M15: m15Bars,
    },
    metrics: {
      atr: basePrice * 0.008 * (scenarioOverrides?.atr_multiplier ?? 1.0),
      spread_bps: scenarioOverrides?.spread_bps ?? 5,
      volume_ratio: profile.volume_ratio,
      correlation_index: profile.correlation_index,
      session_overlap: profile.session_overlap,
      range_expansion: profile.range_expansion,
    },
    session: profile.session,
    event_state: profile.event_state,
    execution: {
      health: scenarioOverrides?.execution_health ?? ExecutionHealth.OK,
      latency_ms: 50,
      last_spread_bps: scenarioOverrides?.spread_bps ?? 5,
      last_slippage_bps: 1,
    },
    global_mode: resolveGlobalMode(),
    event_id: eventId,
    correlation_id: correlationId,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

const BRAIN_COMPONENT_MAP: Record<string, Component> = {
  A2: "A2",
  B3: "B3",
  C3: "C3",
  D2: "D2",
};

function brainToComponent(brainId: string): Component {
  return BRAIN_COMPONENT_MAP[brainId] ?? "SYSTEM";
}

// ─── News / Event Proximity Resolution ─────────────────────────

/**
 * Resolve o EventProximity para um símbolo com base nas janelas de evento.
 *
 * Lógica:
 * - Extrai a moeda base e a moeda cotada do símbolo (ex: EURUSD → EUR, USD)
 * - Verifica se o timestamp atual cai dentro de alguma janela de evento
 *   para qualquer uma das moedas do par
 * - NO_TRADE_SENSITIVE → PRE_EVENT (bloqueia a maioria dos cérebros)
 * - CONDITIONAL_ONLY → POST_EVENT (permite operações condicionais)
 * - Fora de janela → NONE
 *
 * @param symbol - Símbolo FOREX (ex: "EURUSD")
 * @param windows - Janelas de evento computadas
 * @param nowISO - Timestamp atual ISO 8601
 * @returns EventProximity resolvido
 */
function resolveEventProximity(
  symbol: string,
  windows: EventWindow[],
  nowISO: string
): typeof EventProximity[keyof typeof EventProximity] {
  if (windows.length === 0) return EventProximity.NONE;

  const nowMs = new Date(nowISO).getTime();

  // Extrair moedas do par (ex: EURUSD → EUR, USD)
  const baseCurrency = symbol.slice(0, 3);
  const quoteCurrency = symbol.slice(3, 6);

  for (const window of windows) {
    const startMs = new Date(window.start).getTime();
    const endMs = new Date(window.end).getTime();

    // Verificar se o timestamp atual está dentro da janela
    if (nowMs >= startMs && nowMs < endMs) {
      // Verificar se a moeda do evento afeta este par
      if (window.currency === baseCurrency || window.currency === quoteCurrency) {
        if (window.policy === "NO_TRADE_SENSITIVE") {
          return EventProximity.PRE_EVENT;
        }
        if (window.policy === "CONDITIONAL_ONLY") {
          return EventProximity.POST_EVENT;
        }
      }
    }
  }

  return EventProximity.NONE;
}

/**
 * Resolve o executionHealth para um símbolo com base no Data Quality Gate.
 *
 * @param snapshot - Dados de mercado do símbolo
 * @returns ExecutionHealth baseado na qualidade dos dados
 */
function resolveDataQualityHealth(
  snapshot: MarketDataSnapshot
): typeof ExecutionHealth[keyof typeof ExecutionHealth] {
  const m15Quality = evaluateDataQuality(snapshot.M15, "M15", snapshot.symbol);
  const h1Quality = evaluateDataQuality(snapshot.H1, "H1", snapshot.symbol);

  // Se M15 ou H1 estão DEGRADED → executionHealth = DEGRADED
  if (m15Quality.status === "DEGRADED" || h1Quality.status === "DEGRADED") {
    return ExecutionHealth.DEGRADED;
  }

  return ExecutionHealth.OK;
}

// ─── Pipeline Principal ─────────────────────────────────────────

/**
 * Executa um ciclo completo de decisão (tick).
 *
 * Pipeline:
 * 1. Buscar calendário econômico via FMP e computar janelas de evento
 * 2. Para cada símbolo: buscar dados REAIS de mercado e gerar MCL snapshot
 *    - EventProximity resolvido em tempo real via calendarService (FMP)
 *    - DATA_DEGRADED propagado como executionHealth
 * 3. Para cada snapshot: rodar todos os brains
 *    → Se brain retorna null (sem edge), registrar evento BRAIN_INTENT skip
 *    → Se brain retorna intent, registrar evento BRAIN_INTENT
 * 4. Intent Arbitration: coletar todos os intents não-null
 * 5. Para cada intent: PM decide (evaluateIntent)
 * 6. Persistir TODOS os eventos no ledger (com correlation_id)
 * 7. Se gate permite e ARMED: enviar comandos ao executor
 *
 * SEGURANÇA:
 * - Se dados reais falharem completamente → RISK_OFF, tick abortado
 * - Se símbolo individual não tiver dados → excluído (não mockado)
 * - Mock APENAS em cenários de teste (G0/G1 com scenario != AUTO)
 * - Se calendar provider DOWN → DATA_DEGRADED, comportamento conservador
 *
 * @param input - Lista de símbolos para processar
 */
export async function runTick(input: TickInput): Promise<TickResult> {
  const correlationId = newCorrelationId();
  const timestamp = nowISO();
  const opsState = getOperationalState();

  // ─── Scenario Controller (G0/G1 only) ─────────────────────────
  const requestedScenario = input.scenario ?? "AUTO";
  const scenarioActive =
    requestedScenario !== "AUTO" && isScenarioAllowed(opsState.gate)
      ? requestedScenario
      : null;
  const scenarioOverrides = scenarioActive
    ? getScenarioOverrides(scenarioActive)
    : null;

  // ─── Determinar se usamos dados reais ou mock ─────────────────
  // Se há scenarioOverrides ativo → usar mock (cenário de teste forçado)
  // Se não há scenario → usar dados REAIS de mercado
  const useRealData = !scenarioOverrides;

  // Atualizar mock_mode no estado operacional
  if (useRealData) {
    setMockMode(false);
  } else {
    setMockMode(true);
  }

  const isMock = !useRealData;

  const snapshots: MclSnapshot[] = [];
  const intents: BrainIntent[] = [];
  const decisions: PmDecision[] = [];
  const eventsToStore: LedgerEventInput[] = [];

  // ─── 0. Buscar calendário econômico (FMP Provider) ──────────
  // Integração real: resolve EventProximity para cada símbolo.
  // Se FMP falhar → provider_states.news = DOWN + DATA_DEGRADED.
  // Nunca voltar para mock. Sem dados = comportamento conservador.
  let eventWindows: EventWindow[] = [];
  let calendarResponse: CalendarServiceResponse | null = null;
  let newsProviderDown = false;

  if (useRealData) {
    try {
      calendarResponse = await getDayCalendar(new Date());
      if (calendarResponse.events.length > 0) {
        eventWindows = computeEventWindows(calendarResponse.events);
      }

      // Registrar estado do provider de notícias
      setProviderState("NEWS", calendarResponse.provider_state);
      newsProviderDown = calendarResponse.provider_state === "DOWN";

      console.log(
        `[DecisionEngine] Calendar: ${calendarResponse.events.length} eventos, ` +
        `${eventWindows.length} janelas, provider=${calendarResponse.provider_used} ` +
        `(${calendarResponse.provider_state})`
      );

      // Se provider DOWN ou DEGRADED, registrar no ledger
      if (calendarResponse.provider_state !== "OK") {
        eventsToStore.push({
          event_id: newEventId(),
          correlation_id: correlationId,
          timestamp,
          severity: calendarResponse.provider_state === "DOWN" ? "WARN" : "INFO",
          event_type: "PROVIDER_STATE_CHANGE",
          component: "SYSTEM",
          symbol: null,
          brain_id: null,
          reason_code: calendarResponse.reason_code ?? ReasonCode.PROV_DISCONNECTED,
          payload: {
            provider: "NEWS",
            provider_used: calendarResponse.provider_used,
            state: calendarResponse.provider_state,
            reason: calendarResponse.reason ?? "FMP provider com problema",
            event_windows: [],
            impact: newsProviderDown
              ? "EventProximity será NONE para todos os símbolos — DATA_DEGRADED ativo"
              : "Provider degradado — dados parciais",
          },
        });
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`[DecisionEngine] Falha ao buscar calendário FMP: ${err.message}`);
      // Calendário falhou → EventProximity.NONE para todos
      // NÃO aborta o tick — dados de mercado são mais críticos
      // Mas marca provider como DOWN e ativa DATA_DEGRADED
      setProviderState("NEWS", "DOWN");
      newsProviderDown = true;

      eventsToStore.push({
        event_id: newEventId(),
        correlation_id: correlationId,
        timestamp,
        severity: "WARN",
        event_type: "PROVIDER_STATE_CHANGE",
        component: "SYSTEM",
        symbol: null,
        brain_id: null,
        reason_code: ReasonCode.PROV_DISCONNECTED,
        payload: {
          provider: "NEWS",
          provider_used: "FMP",
          state: "DOWN",
          reason: `FMP provider falhou: ${err.message}`,
          event_windows: [],
          impact: "EventProximity será NONE para todos os símbolos — DATA_DEGRADED ativo",
        },
      });
    }
  }

  // ─── 1. Buscar dados reais de mercado (se necessário) ────────
  let marketDataMap: Map<string, MarketDataSnapshot> | null = null;
  if (useRealData) {
    try {
      marketDataMap = await fetchMultipleMarketData(input.symbols);
      console.log(
        `[DecisionEngine] Dados reais obtidos para ${marketDataMap.size}/${input.symbols.length} símbolos`
      );

      // ─── ZERO FALLBACK SILENCIOSO ─────────────────────────────
      // Se NENHUM símbolo retornou dados → RISK_OFF, abortar tick
      if (marketDataMap.size === 0) {
        console.error("[DecisionEngine] NENHUM símbolo retornou dados reais — RISK_OFF");
        setRiskOff(true);
        setMockMode(false); // NÃO cair para mock

        // Registrar evento de RISK_OFF no ledger
        const riskOffEvent: LedgerEventInput = {
          event_id: newEventId(),
          correlation_id: correlationId,
          timestamp,
          severity: "ERROR",
          event_type: "RISK_OFF_ACTIVATED",
          component: "SYSTEM",
          symbol: null,
          brain_id: null,
          reason_code: ReasonCode.MCL_DATA_STALE,
          payload: {
            reason: "Nenhum símbolo retornou dados reais de mercado",
            symbols_requested: input.symbols,
            symbols_received: 0,
            action: "RISK_OFF — tick abortado, ZERO fallback para mock",
          },
        };

        try {
          await persistEvent(riskOffEvent);
        } catch (persistErr) {
          console.error("Erro ao persistir evento RISK_OFF:", persistErr);
        }

        return {
          correlation_id: correlationId,
          timestamp,
          gate: opsState.gate,
          commands_sent: false,
          events_persisted: 1,
          snapshots: [],
          intents: [],
          decisions: [],
          scenario: null,
        };
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[DecisionEngine] Falha ao buscar dados reais: ${err.message}`);

      // ─── ZERO FALLBACK SILENCIOSO ─────────────────────────────
      // Falha total no fetch → RISK_OFF, NÃO cair para mock
      setRiskOff(true);
      setMockMode(false);

      const riskOffEvent: LedgerEventInput = {
        event_id: newEventId(),
        correlation_id: correlationId,
        timestamp,
        severity: "ERROR",
        event_type: "RISK_OFF_ACTIVATED",
        component: "SYSTEM",
        symbol: null,
        brain_id: null,
        reason_code: ReasonCode.MCL_DATA_STALE,
        payload: {
          reason: `Falha total ao buscar dados de mercado: ${err.message}`,
          symbols_requested: input.symbols,
          action: "RISK_OFF — tick abortado, ZERO fallback para mock",
        },
      };

      try {
        await persistEvent(riskOffEvent);
      } catch (persistErr) {
        console.error("Erro ao persistir evento RISK_OFF:", persistErr);
      }

      return {
        correlation_id: correlationId,
        timestamp,
        gate: opsState.gate,
        commands_sent: false,
        events_persisted: 1,
        snapshots: [],
        intents: [],
        decisions: [],
        scenario: null,
      };
    }
  }

  // ─── 2. MCL Snapshots ───────────────────────────────────────
  for (const symbol of input.symbols) {
    const mclEventId = newEventId();

    let mclInput: MclInput;
    let isSymbolMock = isMock;

    if (useRealData && marketDataMap?.has(symbol)) {
      // ─── DADOS REAIS ─────────────────────────────────────────
      const marketData = marketDataMap.get(symbol)!;

      // Resolver EventProximity real via calendarService (FMP)
      const eventProximity = resolveEventProximity(symbol, eventWindows, timestamp);

      // Resolver executionHealth via Data Quality Gate
      let dataQualityHealth = resolveDataQualityHealth(marketData);

      // Se news provider DOWN → propagar DATA_DEGRADED no executionHealth
      if (newsProviderDown && dataQualityHealth === ExecutionHealth.OK) {
        dataQualityHealth = ExecutionHealth.DEGRADED;
      }

      const realInput = buildRealMclInput(
        marketData,
        mclEventId,
        correlationId,
        timestamp,
        eventProximity,
        resolveGlobalMode(),
        dataQualityHealth
      );
      // Cast para MclInput (tipos são compatíveis)
      mclInput = realInput as unknown as MclInput;
      isSymbolMock = false;
    } else if (useRealData && !marketDataMap?.has(symbol)) {
      // ─── SÍMBOLO SEM DADOS REAIS → EXCLUIR (NÃO MOCKAR) ─────
      console.warn(
        `[DecisionEngine] Símbolo ${symbol} sem dados reais — EXCLUÍDO do tick (ZERO fallback mock)`
      );

      // Registrar exclusão no ledger para rastreabilidade
      eventsToStore.push({
        event_id: mclEventId,
        correlation_id: correlationId,
        timestamp,
        severity: "WARN",
        event_type: "MCL_SNAPSHOT",
        component: "MCL",
        symbol,
        brain_id: null,
        reason_code: ReasonCode.MCL_DATA_STALE,
        payload: {
          symbol,
          status: "EXCLUDED",
          reason: `Símbolo ${symbol} excluído: sem dados reais disponíveis. ZERO fallback para mock.`,
          data_source: "NONE",
        },
      });

      continue; // Pular para o próximo símbolo
    } else {
      // ─── MOCK (cenário de teste G0/G1 APENAS) ─────────────────
      mclInput = buildMockMclInput(symbol, mclEventId, correlationId, timestamp, scenarioOverrides);
      isSymbolMock = true;
    }

    const snapshot = computeMarketContext(mclInput);
    snapshots.push(snapshot);

    // Atualizar global_mode no estado operacional
    setGlobalMode(snapshot.global_mode);

    eventsToStore.push({
      event_id: snapshot.event_id,
      correlation_id: snapshot.correlation_id,
      timestamp: snapshot.timestamp,
      severity: snapshot.severity,
      event_type: "MCL_SNAPSHOT",
      component: "MCL",
      symbol: snapshot.symbol,
      brain_id: null,
      reason_code: snapshot.why.reason_code,
      payload: {
        ...(snapshot as unknown as Record<string, unknown>),
        data_source: useRealData ? "CTRADER" : "MOCK",
        news_provider: useRealData ? (calendarResponse?.provider_used ?? "UNKNOWN") : "MOCK",
        news_provider_state: newsProviderDown ? "DOWN" : (calendarResponse?.provider_state ?? "UNKNOWN"),
        event_windows_count: eventWindows.length,
        ...(scenarioActive ? { scenario: scenarioActive } : {}),
      },
    });

    // ─── 3. Brains ──────────────────────────────────────────────
    for (const [brainId, generateIntent] of BRAIN_REGISTRY) {
      const brainEventId = newEventId();
      const brainInput: BrainInput = {
        mcl: snapshot,
        symbol,
        timestamp,
        event_id: brainEventId,
        correlation_id: correlationId,
      };

      const intent = generateIntent(brainInput);

      if (intent === null) {
        eventsToStore.push({
          event_id: brainEventId,
          correlation_id: correlationId,
          timestamp,
          severity: "INFO",
          event_type: "BRAIN_SKIP",
          component: brainToComponent(brainId),
          symbol,
          brain_id: brainId,
          reason_code: ReasonCode.MCL_STRUCTURE_CHANGE,
          payload: {
            event_id: brainEventId,
            correlation_id: correlationId,
            timestamp,
            severity: Severity.INFO,
            brain_id: brainId,
            symbol,
            skip_reason: `${brainId} não encontrou edge no contexto atual`,
            market_states: snapshot.market_states,
            metrics: snapshot.metrics,
            mock: isSymbolMock,
            data_source: isSymbolMock ? "MOCK" : "CTRADER",
            ...(scenarioActive ? { scenario: scenarioActive } : {}),
          },
        });
        continue;
      }

      intents.push(intent);

      eventsToStore.push({
        event_id: intent.event_id,
        correlation_id: intent.correlation_id,
        timestamp: intent.timestamp,
        severity: intent.severity,
        event_type: "BRAIN_INTENT",
        component: brainToComponent(brainId),
        symbol: intent.symbol,
        brain_id: intent.brain_id,
        reason_code: intent.why.reason_code,
        payload: {
          ...(intent as unknown as Record<string, unknown>),
          data_source: useRealData ? "CTRADER" : "MOCK",
          ...(scenarioActive ? { scenario: scenarioActive } : {}),
        },
      });
    }
  }

  // ─── 4. Intent Arbitration ──────────────────────────────────
  const arbitratedIntents = [...intents];

  // ─── 5. PM Decision (para cada intent arbitrado) ────────────
  for (const intent of arbitratedIntents) {
    const pmInput: PmInput = {
      intent,
      portfolio: getDefaultPortfolioState(),
      timestamp,
      event_id: newEventId(),
      correlation_id: correlationId,
    };

    const decision = evaluateIntent(pmInput);
    decisions.push(decision);

    eventsToStore.push({
      event_id: decision.event_id,
      correlation_id: decision.correlation_id,
      timestamp: decision.timestamp,
      severity: decision.severity,
      event_type: "PM_DECISION",
      component: "PM",
      symbol: intent.symbol,
      brain_id: intent.brain_id,
      reason_code: decision.why.reason_code,
      payload: {
        ...(decision as unknown as Record<string, unknown>),
        data_source: useRealData ? "CTRADER" : "MOCK",
        ...(scenarioActive ? { scenario: scenarioActive } : {}),
      },
    });
  }

  // ─── 6. Persistir todos os eventos ──────────────────────────
  let eventsPersisted = 0;
  for (const event of eventsToStore) {
    try {
      const inserted = await persistEvent(event);
      if (inserted) eventsPersisted++;
    } catch (err) {
      console.error(`Erro ao persistir evento ${event.event_id}:`, err);
    }
  }

  // ─── 7. Comandos ao executor ──────────────────────────────────
  const commandsSent = canSendCommands();
  if (commandsSent) {
    const mappingConfig: MappingConfig = {
      gate: opsState.gate,
      armed: opsState.arm_state === "ARMED",
    };

    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      const intent = arbitratedIntents[i];
      if (!decision || !intent) continue;

      const mappingDecision: MappingDecision = {
        decision: decision.decision,
        intent_event_id: decision.intent_event_id,
        risk_adjustments: decision.risk_adjustments,
      };

      const mappingIntent: MappingIntent = {
        intent_type: intent.intent_type,
        symbol: intent.symbol,
        brain_id: intent.brain_id,
        proposed_risk_pct: intent.proposed_risk_pct,
        trade_plan: intent.trade_plan,
      };

      const executorCommands = mapDecisionToExecutorCommands(
        mappingDecision,
        mappingIntent,
        mappingConfig
      );

      if (executorCommands.length > 0) {
        try {
          await applyCommands(executorCommands, correlationId);
        } catch (err) {
          console.error("Erro ao enviar comandos ao executor:", err);
        }
      }
    }
  }

  // ─── 8. Entrega C: Execução simulada evidenciada ────────────
  for (let i = 0; i < decisions.length; i++) {
    const decision = decisions[i];
    const intent = arbitratedIntents[i];
    if (!decision || !intent) continue;

    const isAllowed = decision.decision === "ALLOW";
    const simEventId = newEventId();

    const simEvent: LedgerEventInput = {
      event_id: simEventId,
      correlation_id: correlationId,
      timestamp: nowISO(),
      severity: "INFO",
      event_type: isAllowed ? "EXEC_SIMULATED_COMMAND" : "EXEC_SIMULATED_NOOP",
      component: "SYSTEM",
      symbol: intent.symbol,
      brain_id: intent.brain_id,
      reason_code: isAllowed ? ReasonCode.EXEC_SIMULATED_COMMAND : ReasonCode.EXEC_SIMULATED_NOOP,
      payload: {
        event_id: simEventId,
        correlation_id: correlationId,
        timestamp: nowISO(),
        severity: "INFO",
        mock: isMock,
        data_source: isMock ? "MOCK" : "CTRADER",
        gate: opsState.gate,
        armed: opsState.arm_state === "ARMED",
        commands_sent: commandsSent,
        decision: decision.decision,
        intent_type: intent.intent_type,
        symbol: intent.symbol,
        brain_id: intent.brain_id,
        proposed_risk_pct: intent.proposed_risk_pct,
        trade_plan: intent.trade_plan,
        risk_adjustments: decision.risk_adjustments,
        simulation_label: isAllowed
          ? `SIMULATOR: ${intent.intent_type} ${intent.symbol} (${intent.brain_id})`
          : `NOOP: ${decision.decision} ${intent.symbol} (${intent.brain_id})`,
        ...(scenarioActive ? { scenario: scenarioActive } : {}),
      },
    };

    try {
      const inserted = await persistEvent(simEvent);
      if (inserted) eventsPersisted++;
    } catch (err) {
      console.error(`Erro ao persistir evento simulado ${simEventId}:`, err);
    }
  }

  return {
    correlation_id: correlationId,
    timestamp,
    gate: opsState.gate,
    commands_sent: commandsSent,
    events_persisted: eventsPersisted,
    snapshots,
    intents,
    decisions,
    scenario: scenarioActive,
  };
}
