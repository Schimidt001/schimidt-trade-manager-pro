// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Executor Simulator
// ═══════════════════════════════════════════════════════════════
// Simulador do executor para testes e rollout gradual.
// Mantém estado interno (estratégia, símbolos, armed/disarmed).
// Permite testar Gate 0 e Gate 1 sem dinheiro real.
//
// CORREÇÃO CRÍTICA: Agora emite ciclo completo de eventos EXEC_*
// para cada comando de trade, fechando o ciclo de paper trading.
//
// Modos:
//   "normal"   — responde OK, latência baixa
//   "degraded" — responde OK mas com latência alta e error_rate elevada
//   "down"     — rejeita tudo (simula executor offline)
// ═══════════════════════════════════════════════════════════════

import type {
  IExecutorAdapter,
  ExecutorStatus,
  ExecutorCommand,
  ExecutorCommandResult,
  ExecutorRiskProfile,
  ExecutorEvent,
  SimulatorMode,
} from "./types";

// ─── Estado Interno do Simulador ───────────────────────────────

interface SimulatorState {
  armed: boolean;
  mode: string;
  active_strategy: string;
  active_symbols: string[];
  risk_profile: ExecutorRiskProfile;
  params: Record<string, unknown>;
  // Estado de posições simuladas
  open_positions: Map<string, SimulatedPosition>;
  daily_pnl: number;
  trade_count: number;
}

interface SimulatedPosition {
  symbol: string;
  direction: string;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  take_profit: number;
  opened_at: string;
  pnl: number;
}

// ─── Simulador ─────────────────────────────────────────────────

/**
 * Simulador do executor que implementa IExecutorAdapter.
 * Mantém estado em memória e responde de acordo com o modo configurado.
 * 
 * CORREÇÃO: Agora emite eventos de lifecycle completo para cada trade.
 */
export class ExecutorSimulator implements IExecutorAdapter {
  private _simulatorMode: SimulatorMode;
  private _state: SimulatorState;
  private _eventLog: ExecutorEvent[];
  private _lifecycleCallbacks: Array<(events: ExecutorEvent[]) => Promise<void>>;

  constructor(simulatorMode: SimulatorMode = "normal") {
    this._simulatorMode = simulatorMode;
    this._eventLog = [];
    this._lifecycleCallbacks = [];
    this._state = {
      armed: false,
      mode: "SIMULATOR",
      active_strategy: "NONE",
      active_symbols: [],
      risk_profile: {
        max_risk_per_trade_pct: 2,
        max_daily_loss_pct: 5,
        max_positions: 8,
      },
      params: {},
      open_positions: new Map(),
      daily_pnl: 0,
      trade_count: 0,
    };
  }

  // ─── Controle do Modo do Simulador ─────────────────────────────

  /**
   * Altera o modo do simulador em runtime.
   */
  setSimulatorMode(mode: SimulatorMode): void {
    this._simulatorMode = mode;
  }

  /**
   * Retorna o modo atual do simulador.
   */
  getSimulatorMode(): SimulatorMode {
    return this._simulatorMode;
  }

  /**
   * Retorna o log de eventos fake emitidos pelo simulador.
   */
  getEventLog(): ExecutorEvent[] {
    return [...this._eventLog];
  }

  /**
   * Limpa o log de eventos.
   */
  clearEventLog(): void {
    this._eventLog = [];
  }

  /**
   * Registra callback para receber eventos de lifecycle.
   * Usado pelo executorService para persistir eventos no ledger.
   */
  onLifecycleEvents(callback: (events: ExecutorEvent[]) => Promise<void>): void {
    this._lifecycleCallbacks.push(callback);
  }

  // ─── IExecutorAdapter ──────────────────────────────────────────

  /**
   * Retorna o status simulado do executor.
   * Comportamento varia conforme o modo:
   *   - normal:   connected=true, latência baixa, error_rate=0
   *   - degraded: connected=true, latência alta, error_rate elevada
   *   - down:     connected=false, lança erro
   */
  async getStatus(): Promise<ExecutorStatus> {
    // Simular latência
    await this._simulateLatency();

    if (this._simulatorMode === "down") {
      throw Object.assign(
        new Error("Executor simulado está DOWN — sem conectividade"),
        { reason_code: "EXEC_BROKEN" }
      );
    }

    const isNormal = this._simulatorMode === "normal";

    return {
      connected: true,
      timestamp: new Date().toISOString(),
      mode: this._state.mode,
      active_strategy: this._state.active_strategy,
      active_symbols: [...this._state.active_symbols],
      risk_profile: { ...this._state.risk_profile },
      health: {
        latency_ms: isNormal ? 25 : 800,
        error_rate: isNormal ? 0 : 0.35,
        execution_state: isNormal ? "OK" : "DEGRADED",
      },
    };
  }

  /**
   * Processa um comando simulado.
   * Comportamento varia conforme o modo:
   *   - normal:   aceita e altera estado
   *   - degraded: aceita com warning
   *   - down:     rejeita tudo
   * 
   * CORREÇÃO: Agora emite eventos de lifecycle completo para trades.
   */
  async sendCommand(cmd: ExecutorCommand): Promise<ExecutorCommandResult> {
    // Simular latência
    await this._simulateLatency();

    if (this._simulatorMode === "down") {
      return {
        ok: false,
        message: "Executor simulado está DOWN — comando rejeitado",
        reason_code: "EXEC_BROKEN",
      };
    }

    // Processar comando e alterar estado interno
    const result = this._processCommand(cmd);

    // Emitir evento fake para log
    if (result.ok) {
      this._emitFakeEvent(cmd);
      
      // CORREÇÃO CRÍTICA: Emitir eventos de lifecycle para trades
      await this._emitTradeLifecycleEvents(cmd);
    }

    // Em modo degradado, adicionar warning
    if (this._simulatorMode === "degraded" && result.ok) {
      result.message = `[DEGRADED] ${result.message ?? "Comando aceite com latência elevada"}`;
    }

    return result;
  }

  // ─── Processamento de Comandos ─────────────────────────────────

  private _processCommand(cmd: ExecutorCommand): ExecutorCommandResult {
    switch (cmd.type) {
      case "ARM":
        this._state.armed = true;
        return { ok: true, message: "Executor armado (simulado)" };

      case "DISARM":
        this._state.armed = false;
        return { ok: true, message: "Executor desarmado (simulado)" };

      case "SET_STRATEGY": {
        const strategy = cmd.payload.strategy;
        if (typeof strategy !== "string" || strategy.length === 0) {
          return {
            ok: false,
            message: "Payload inválido: strategy deve ser string não vazia",
            reason_code: "EXEC_ORDER_FAILED",
          };
        }
        this._state.active_strategy = strategy;
        return {
          ok: true,
          message: `Estratégia alterada para ${strategy} (simulado)`,
        };
      }

      case "SET_PARAMS": {
        const params = cmd.payload.params;
        if (typeof params !== "object" || params === null) {
          return {
            ok: false,
            message: "Payload inválido: params deve ser um objeto",
            reason_code: "EXEC_ORDER_FAILED",
          };
        }
        this._state.params = {
          ...this._state.params,
          ...(params as Record<string, unknown>),
        };
        return { ok: true, message: "Parâmetros atualizados (simulado)" };
      }

      case "SET_RISK": {
        const risk = cmd.payload.risk_profile;
        if (typeof risk !== "object" || risk === null) {
          return {
            ok: false,
            message: "Payload inválido: risk_profile deve ser um objeto",
            reason_code: "EXEC_ORDER_FAILED",
          };
        }
        this._state.risk_profile = {
          ...this._state.risk_profile,
          ...(risk as Partial<ExecutorRiskProfile>),
        };
        return { ok: true, message: "Perfil de risco atualizado (simulado)" };
      }

      case "CLOSE_DAY":
        this._state.armed = false;
        this._state.active_strategy = "NONE";
        // CORREÇÃO: Emitir resumo do dia
        this._emitDaySummaryEvent();
        return {
          ok: true,
          message: "Dia encerrado — executor desarmado e estratégia resetada (simulado)",
        };

      case "SET_SYMBOLS_ACTIVE": {
        const symbols = cmd.payload.symbols;
        if (!Array.isArray(symbols)) {
          return {
            ok: false,
            message: "Payload inválido: symbols deve ser um array",
            reason_code: "EXEC_ORDER_FAILED",
          };
        }
        this._state.active_symbols = symbols.filter(
          (s): s is string => typeof s === "string" && s.length > 0
        );
        return {
          ok: true,
          message: `Símbolos ativos: ${this._state.active_symbols.join(", ")} (simulado)`,
        };
      }

      default:
        return {
          ok: false,
          message: `Comando desconhecido: ${cmd.type}`,
          reason_code: "EXEC_ORDER_FAILED",
        };
    }
  }

  // ─── Emissão de Eventos Fake ───────────────────────────────────

  private _emitFakeEvent(cmd: ExecutorCommand): void {
    const event: ExecutorEvent = {
      type: "INFO",
      symbol: this._state.active_symbols[0] ?? "N/A",
      strategy: this._state.active_strategy,
      details: {
        command_type: cmd.type,
        payload: cmd.payload,
        simulator_mode: this._simulatorMode,
      },
      timestamp: new Date().toISOString(),
    };
    this._eventLog.push(event);
  }

  // ─── CORREÇÃO CRÍTICA: Lifecycle de Trade ──────────────────────

  /**
   * Emite eventos de lifecycle completo para comandos de trade.
   * Sequência: COMMAND → FILL → POSITION_OPENED → PNL_UPDATE
   * 
   * Isso fecha o ciclo de paper trading e permite que o Replay
   * identifique corretamente quando houve execução simulada.
   */
  private async _emitTradeLifecycleEvents(cmd: ExecutorCommand): Promise<void> {
    // Apenas emitir lifecycle para comandos SET_PARAMS que contêm dados de trade
    if (cmd.type !== "SET_PARAMS") {
      return;
    }

    const payload = cmd.payload as Record<string, unknown>;
    const params = payload.params as Record<string, unknown> | undefined;
    
    if (!params) {
      return;
    }

    // Se o comando tem symbol, direction, entry, stop_loss, take_profit
    // então é um comando de trade
    const isTradeCommand = 
      params.symbol && 
      params.direction && 
      params.entry !== undefined;

    if (!isTradeCommand) {
      return; // Não é um trade, não emitir lifecycle
    }

    const symbol = String(params.symbol);
    const direction = String(params.direction);
    const entry = Number(params.entry);
    const stopLoss = Number(params.stop_loss ?? entry * 0.99);
    const takeProfit = Number(params.take_profit ?? entry * 1.02);
    const quantity = Number(params.quantity ?? 1.0);

    const now = new Date().toISOString();
    const events: ExecutorEvent[] = [];

    // 1. EXEC_SIMULATED_COMMAND (já emitido via _emitFakeEvent)

    // 2. EXEC_SIMULATED_FILL
    events.push({
      type: "INFO",
      symbol,
      strategy: this._state.active_strategy,
      details: {
        event_type: "EXEC_SIMULATED_FILL",
        reason_code: "EXEC_SIMULATED_FILL",
        symbol,
        direction,
        fill_price: entry,
        quantity,
        fill_time: now,
        simulator_mode: this._simulatorMode,
      },
      timestamp: now,
    });

    // 3. EXEC_POSITION_OPENED
    const position: SimulatedPosition = {
      symbol,
      direction,
      entry_price: entry,
      quantity,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      opened_at: now,
      pnl: 0,
    };

    this._state.open_positions.set(symbol, position);
    this._state.trade_count++;

    events.push({
      type: "INFO",
      symbol,
      strategy: this._state.active_strategy,
      details: {
        event_type: "EXEC_POSITION_OPENED",
        reason_code: "EXEC_POSITION_OPENED",
        symbol,
        direction,
        entry_price: entry,
        quantity,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        opened_at: now,
        position_id: `SIM_${symbol}_${Date.now()}`,
        simulator_mode: this._simulatorMode,
      },
      timestamp: now,
    });

    // 4. EXEC_PNL_UPDATE (inicial, PnL = 0)
    events.push({
      type: "INFO",
      symbol,
      strategy: this._state.active_strategy,
      details: {
        event_type: "EXEC_PNL_UPDATE",
        reason_code: "EXEC_PNL_UPDATE",
        symbol,
        position_pnl: 0,
        daily_pnl: this._state.daily_pnl,
        trade_count: this._state.trade_count,
        open_positions: this._state.open_positions.size,
        simulator_mode: this._simulatorMode,
      },
      timestamp: now,
    });

    // Adicionar eventos ao log
    this._eventLog.push(...events);

    // Notificar callbacks (para persistir no ledger)
    await this._notifyLifecycleCallbacks(events);
  }

  /**
   * Emite evento de resumo do dia (EXEC_DAY_SUMMARY).
   */
  private _emitDaySummaryEvent(): void {
    const now = new Date().toISOString();
    const event: ExecutorEvent = {
      type: "INFO",
      symbol: "ALL",
      strategy: this._state.active_strategy,
      details: {
        event_type: "EXEC_DAY_SUMMARY",
        reason_code: "EXEC_DAY_SUMMARY",
        daily_pnl: this._state.daily_pnl,
        trade_count: this._state.trade_count,
        open_positions: this._state.open_positions.size,
        simulator_mode: this._simulatorMode,
      },
      timestamp: now,
    };

    this._eventLog.push(event);

    // Reset diário
    this._state.daily_pnl = 0;
    this._state.trade_count = 0;
    this._state.open_positions.clear();
  }

  /**
   * Notifica callbacks registrados sobre eventos de lifecycle.
   */
  private async _notifyLifecycleCallbacks(events: ExecutorEvent[]): Promise<void> {
    for (const callback of this._lifecycleCallbacks) {
      try {
        await callback(events);
      } catch (err) {
        console.error("Erro ao notificar lifecycle callback:", err);
      }
    }
  }

  // ─── Simulação de Latência ─────────────────────────────────────

  private async _simulateLatency(): Promise<void> {
    let delayMs: number;
    switch (this._simulatorMode) {
      case "normal":
        delayMs = 10 + Math.random() * 30; // 10–40ms
        break;
      case "degraded":
        delayMs = 500 + Math.random() * 500; // 500–1000ms
        break;
      case "down":
        delayMs = 2000 + Math.random() * 1000; // 2000–3000ms (antes de falhar)
        break;
      default:
        delayMs = 20;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
