import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// REASON CODES — Catálogo central e único
// Nenhum outro agente ou pacote pode inventar reason_code.
// Todas as categorias estão aqui: MCL, PM/Risk, EHM, Execution,
// Provider, Config/Audit.
// ─────────────────────────────────────────────────────────────

/**
 * Enum canônico de reason codes.
 * Cada código é prefixado pela categoria para evitar colisões.
 */
export enum ReasonCode {
  // ── MCL ──────────────────────────────────────────────────
  MCL_STRUCTURE_CHANGE = "MCL_STRUCTURE_CHANGE",
  MCL_VOLATILITY_SPIKE = "MCL_VOLATILITY_SPIKE",
  MCL_VOLATILITY_DROP = "MCL_VOLATILITY_DROP",
  MCL_SESSION_OPEN = "MCL_SESSION_OPEN",
  MCL_SESSION_CLOSE = "MCL_SESSION_CLOSE",
  MCL_LIQUIDITY_RAID = "MCL_LIQUIDITY_RAID",
  MCL_LIQUIDITY_BUILDUP = "MCL_LIQUIDITY_BUILDUP",
  MCL_LIQUIDITY_CLEAN = "MCL_LIQUIDITY_CLEAN",
  MCL_EVENT_PROXIMITY = "MCL_EVENT_PROXIMITY",
  MCL_CORRELATION_SHIFT = "MCL_CORRELATION_SHIFT",
  MCL_MODE_CHANGE = "MCL_MODE_CHANGE",
  MCL_DATA_STALE = "MCL_DATA_STALE",

  // ── PM / Risk ────────────────────────────────────────────
  PM_RISK_LIMIT_REACHED = "PM_RISK_LIMIT_REACHED",
  PM_RISK_ADJUSTED = "PM_RISK_ADJUSTED",
  PM_POSITION_DENIED = "PM_POSITION_DENIED",
  PM_POSITION_ALLOWED = "PM_POSITION_ALLOWED",
  PM_POSITION_QUEUED = "PM_POSITION_QUEUED",
  PM_POSITION_MODIFIED = "PM_POSITION_MODIFIED",
  PM_DRAWDOWN_LIMIT = "PM_DRAWDOWN_LIMIT",
  PM_EXPOSURE_LIMIT = "PM_EXPOSURE_LIMIT",
  PM_CORRELATION_BLOCK = "PM_CORRELATION_BLOCK",
  PM_DAILY_LOSS_LIMIT = "PM_DAILY_LOSS_LIMIT",
  PM_MAX_POSITIONS = "PM_MAX_POSITIONS",

  // ── EHM ──────────────────────────────────────────────────
  EHM_REDUCE_RISK = "EHM_REDUCE_RISK",
  EHM_EXIT_NOW = "EHM_EXIT_NOW",
  EHM_COOLDOWN_ACTIVATED = "EHM_COOLDOWN_ACTIVATED",
  EHM_COOLDOWN_EXPIRED = "EHM_COOLDOWN_EXPIRED",
  EHM_HEALTH_DEGRADED = "EHM_HEALTH_DEGRADED",
  EHM_HEALTH_BROKEN = "EHM_HEALTH_BROKEN",
  EHM_HEALTH_RECOVERED = "EHM_HEALTH_RECOVERED",
  EHM_EMERGENCY_STOP = "EHM_EMERGENCY_STOP",
  EHM_LOSS_STREAK = "EHM_LOSS_STREAK",

  // ── Execution ────────────────────────────────────────────
  EXEC_STATE_CHANGE = "EXEC_STATE_CHANGE",
  EXEC_DEGRADED = "EXEC_DEGRADED",
  EXEC_BROKEN = "EXEC_BROKEN",
  EXEC_RECOVERED = "EXEC_RECOVERED",
  EXEC_LATENCY_HIGH = "EXEC_LATENCY_HIGH",
  EXEC_ORDER_FAILED = "EXEC_ORDER_FAILED",
  EXEC_ORDER_TIMEOUT = "EXEC_ORDER_TIMEOUT",
  EXEC_RECONNECT = "EXEC_RECONNECT",

  // ── Provider ─────────────────────────────────────────────
  PROV_STATE_CHANGE = "PROV_STATE_CHANGE",
  PROV_DISCONNECTED = "PROV_DISCONNECTED",
  PROV_RECONNECTED = "PROV_RECONNECTED",
  PROV_RATE_LIMITED = "PROV_RATE_LIMITED",
  PROV_AUTH_FAILURE = "PROV_AUTH_FAILURE",
  PROV_DATA_ERROR = "PROV_DATA_ERROR",
  PROV_MAINTENANCE = "PROV_MAINTENANCE",

  // ── Config / Audit ───────────────────────────────────────
  AUDIT_CONFIG_CHANGED = "AUDIT_CONFIG_CHANGED",
  AUDIT_PARAM_UPDATED = "AUDIT_PARAM_UPDATED",
  AUDIT_BRAIN_TOGGLED = "AUDIT_BRAIN_TOGGLED",
  AUDIT_MODE_OVERRIDE = "AUDIT_MODE_OVERRIDE",
  AUDIT_MANUAL_ACTION = "AUDIT_MANUAL_ACTION",
  AUDIT_SYSTEM_RESTART = "AUDIT_SYSTEM_RESTART",
  AUDIT_PERMISSION_CHANGE = "AUDIT_PERMISSION_CHANGE",

  // ── Gate Promotion ────────────────────────────────────────
  GATE_PROMOTED = "GATE_PROMOTED",
  GATE_PREREQ_MISSING_MCL_SNAPSHOT = "GATE_PREREQ_MISSING_MCL_SNAPSHOT",
  GATE_PREREQ_MISSING_BRAIN_INTENT = "GATE_PREREQ_MISSING_BRAIN_INTENT",
  GATE_PREREQ_MISSING_PM_DECISION = "GATE_PREREQ_MISSING_PM_DECISION",
  GATE_PREREQ_MISSING_LEDGER = "GATE_PREREQ_MISSING_LEDGER",
  GATE_PREREQ_MISSING_EXECUTOR = "GATE_PREREQ_MISSING_EXECUTOR",
  GATE_PREREQ_MISSING_RBAC = "GATE_PREREQ_MISSING_RBAC",
  GATE_INVALID_TRANSITION = "GATE_INVALID_TRANSITION",

  // ── Mock ─────────────────────────────────────────────────
  MOCK_TICK = "MOCK_TICK",
  MOCK_MCL_SNAPSHOT = "MOCK_MCL_SNAPSHOT",
  MOCK_BRAIN_INTENT = "MOCK_BRAIN_INTENT",
  MOCK_BRAIN_SKIP = "MOCK_BRAIN_SKIP",
  MOCK_PM_DECISION = "MOCK_PM_DECISION",
  MOCK_EXECUTOR_COMMAND = "MOCK_EXECUTOR_COMMAND",

  // ── Executor Simulation ──────────────────────────────────
  EXEC_SIMULATED_COMMAND = "EXEC_SIMULATED_COMMAND",
  EXEC_SIMULATED_NOOP = "EXEC_SIMULATED_NOOP",
}

/**
 * Schema Zod para reason_code.
 */
export const ReasonCodeSchema = z
  .nativeEnum(ReasonCode)
  .describe("Código de razão canônico do catálogo central");

/**
 * Catálogo de descrições humanas para cada reason code.
 * Imutável — apenas este arquivo define descrições.
 */
export const REASON_CODE_CATALOG: Readonly<Record<ReasonCode, string>> = {
  // MCL
  [ReasonCode.MCL_STRUCTURE_CHANGE]: "Mudança na estrutura de mercado detectada",
  [ReasonCode.MCL_VOLATILITY_SPIKE]: "Pico de volatilidade detectado",
  [ReasonCode.MCL_VOLATILITY_DROP]: "Queda significativa de volatilidade",
  [ReasonCode.MCL_SESSION_OPEN]: "Abertura de sessão de mercado",
  [ReasonCode.MCL_SESSION_CLOSE]: "Fechamento de sessão de mercado",
  [ReasonCode.MCL_LIQUIDITY_RAID]: "Raid de liquidez detectado",
  [ReasonCode.MCL_LIQUIDITY_BUILDUP]: "Acúmulo de liquidez em formação",
  [ReasonCode.MCL_LIQUIDITY_CLEAN]: "Liquidez limpa — mercado fluindo",
  [ReasonCode.MCL_EVENT_PROXIMITY]: "Proximidade de evento macro relevante",
  [ReasonCode.MCL_CORRELATION_SHIFT]: "Mudança de correlação entre ativos",
  [ReasonCode.MCL_MODE_CHANGE]: "Mudança de modo operacional global",
  [ReasonCode.MCL_DATA_STALE]: "Dados de mercado obsoletos ou atrasados",

  // PM / Risk
  [ReasonCode.PM_RISK_LIMIT_REACHED]: "Limite de risco atingido",
  [ReasonCode.PM_RISK_ADJUSTED]: "Risco ajustado pelo Portfolio Manager",
  [ReasonCode.PM_POSITION_DENIED]: "Posição negada pelo Portfolio Manager",
  [ReasonCode.PM_POSITION_ALLOWED]: "Posição aprovada pelo Portfolio Manager",
  [ReasonCode.PM_POSITION_QUEUED]: "Posição colocada em fila de espera",
  [ReasonCode.PM_POSITION_MODIFIED]: "Posição modificada pelo Portfolio Manager",
  [ReasonCode.PM_DRAWDOWN_LIMIT]: "Limite de drawdown atingido",
  [ReasonCode.PM_EXPOSURE_LIMIT]: "Limite de exposição atingido",
  [ReasonCode.PM_CORRELATION_BLOCK]: "Bloqueio por correlação excessiva entre posições",
  [ReasonCode.PM_DAILY_LOSS_LIMIT]: "Limite de perda diária atingido",
  [ReasonCode.PM_MAX_POSITIONS]: "Número máximo de posições simultâneas atingido",

  // EHM
  [ReasonCode.EHM_REDUCE_RISK]: "Redução de risco ordenada pelo EHM",
  [ReasonCode.EHM_EXIT_NOW]: "Saída imediata ordenada pelo EHM",
  [ReasonCode.EHM_COOLDOWN_ACTIVATED]: "Cooldown ativado pelo EHM",
  [ReasonCode.EHM_COOLDOWN_EXPIRED]: "Período de cooldown expirado",
  [ReasonCode.EHM_HEALTH_DEGRADED]: "Saúde do sistema degradada",
  [ReasonCode.EHM_HEALTH_BROKEN]: "Saúde do sistema quebrada — ação urgente",
  [ReasonCode.EHM_HEALTH_RECOVERED]: "Saúde do sistema recuperada",
  [ReasonCode.EHM_EMERGENCY_STOP]: "Parada de emergência acionada",
  [ReasonCode.EHM_LOSS_STREAK]: "Sequência de perdas consecutivas detectada",

  // Execution
  [ReasonCode.EXEC_STATE_CHANGE]: "Mudança de estado na camada de execução",
  [ReasonCode.EXEC_DEGRADED]: "Execução em estado degradado",
  [ReasonCode.EXEC_BROKEN]: "Execução quebrada — sem capacidade operacional",
  [ReasonCode.EXEC_RECOVERED]: "Execução recuperada ao estado normal",
  [ReasonCode.EXEC_LATENCY_HIGH]: "Latência de execução acima do aceitável",
  [ReasonCode.EXEC_ORDER_FAILED]: "Falha no envio ou execução de ordem",
  [ReasonCode.EXEC_ORDER_TIMEOUT]: "Timeout na execução de ordem",
  [ReasonCode.EXEC_RECONNECT]: "Reconexão da camada de execução",

  // Provider
  [ReasonCode.PROV_STATE_CHANGE]: "Mudança de estado do provider",
  [ReasonCode.PROV_DISCONNECTED]: "Provider desconectado",
  [ReasonCode.PROV_RECONNECTED]: "Provider reconectado",
  [ReasonCode.PROV_RATE_LIMITED]: "Provider com rate limit atingido",
  [ReasonCode.PROV_AUTH_FAILURE]: "Falha de autenticação no provider",
  [ReasonCode.PROV_DATA_ERROR]: "Erro nos dados recebidos do provider",
  [ReasonCode.PROV_MAINTENANCE]: "Provider em manutenção programada",

  // Config / Audit
  [ReasonCode.AUDIT_CONFIG_CHANGED]: "Configuração do sistema alterada",
  [ReasonCode.AUDIT_PARAM_UPDATED]: "Parâmetro operacional atualizado",
  [ReasonCode.AUDIT_BRAIN_TOGGLED]: "Brain ativado ou desativado",
  [ReasonCode.AUDIT_MODE_OVERRIDE]: "Override manual de modo operacional",
  [ReasonCode.AUDIT_MANUAL_ACTION]: "Ação manual executada por operador",
  [ReasonCode.AUDIT_SYSTEM_RESTART]: "Reinício do sistema registrado",
  [ReasonCode.AUDIT_PERMISSION_CHANGE]: "Alteração de permissões registrada",

  // Gate Promotion
  [ReasonCode.GATE_PROMOTED]: "Gate promovido com sucesso",
  [ReasonCode.GATE_PREREQ_MISSING_MCL_SNAPSHOT]: "Pré-requisito ausente: MCL_SNAPSHOT não gerado pelo tick",
  [ReasonCode.GATE_PREREQ_MISSING_BRAIN_INTENT]: "Pré-requisito ausente: BRAIN_INTENT ou BRAIN_SKIP não gerado",
  [ReasonCode.GATE_PREREQ_MISSING_PM_DECISION]: "Pré-requisito ausente: PM_DECISION não gerado",
  [ReasonCode.GATE_PREREQ_MISSING_LEDGER]: "Pré-requisito ausente: Ledger/SSE não funcional",
  [ReasonCode.GATE_PREREQ_MISSING_EXECUTOR]: "Pré-requisito ausente: Executor não conectado",
  [ReasonCode.GATE_PREREQ_MISSING_RBAC]: "Pré-requisito ausente: RBAC não validado (requer Admin)",
  [ReasonCode.GATE_INVALID_TRANSITION]: "Transição de gate inválida",

  // Mock
  [ReasonCode.MOCK_TICK]: "Tick executado em modo mock",
  [ReasonCode.MOCK_MCL_SNAPSHOT]: "MCL Snapshot gerado em modo mock",
  [ReasonCode.MOCK_BRAIN_INTENT]: "Brain Intent gerado em modo mock",
  [ReasonCode.MOCK_BRAIN_SKIP]: "Brain Skip em modo mock",
  [ReasonCode.MOCK_PM_DECISION]: "PM Decision gerada em modo mock",
  [ReasonCode.MOCK_EXECUTOR_COMMAND]: "Comando de executor em modo mock",

  // Executor Simulation
  [ReasonCode.EXEC_SIMULATED_COMMAND]: "Comando simulado pelo executor (paper trading)",
  [ReasonCode.EXEC_SIMULATED_NOOP]: "Nenhuma ação de execução necessária (NOOP simulado)",
} as const;

// ─── Type inferido ───────────────────────────────────────────
export type ReasonCodeType = z.infer<typeof ReasonCodeSchema>;
