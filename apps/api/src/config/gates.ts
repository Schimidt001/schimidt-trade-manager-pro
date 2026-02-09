// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Gate State (G0/G1/G2/G3) + Shadow Mode
// ═══════════════════════════════════════════════════════════════
// G0 = Shadow Mode (gera tudo, grava eventos, NÃO envia comandos)
// G1 = Paper Trading (simula execução)
// G2 = Live Restricted (execução com limites reduzidos)
// G3 = Live Full (execução plena)
// ═══════════════════════════════════════════════════════════════

export type GateLevel = "G0" | "G1" | "G2" | "G3";

export type ArmState = "DISARMED" | "ARMED";

export interface OperationalState {
  gate: GateLevel;
  arm_state: ArmState;
  /** Último global_mode conhecido (do MCL) */
  global_mode: string;
  /** Último execution_state conhecido */
  execution_state: string;
  /** Provider states (placeholder até Agente 5) */
  provider_states: Record<string, string>;
  /** Executor connectivity (placeholder até Agente 6) */
  executor_connectivity: string;
  /** Mock mode: true quando tick usa dados simulados (sem provider de mercado real) */
  mock_mode: boolean;
  /** Risk off: true quando kill switch foi ativado */
  risk_off: boolean;
  /** Resultado do último tick (para validação de gate promotion) */
  last_tick_result: {
    has_mcl_snapshot: boolean;
    has_brain_intent_or_skip: boolean;
    has_pm_decision: boolean;
    events_persisted: number;
  } | null;
}

/** Estado operacional singleton (em memória) */
let _state: OperationalState = {
  gate: "G0",
  arm_state: "DISARMED",
  global_mode: "NORMAL",
  execution_state: "OK",
  provider_states: {},
  executor_connectivity: "unknown",
  mock_mode: false,
  risk_off: false,
  last_tick_result: null,
};

export function getOperationalState(): OperationalState {
  return { ..._state };
}

export function setGate(gate: GateLevel): void {
  _state.gate = gate;
}

export function setArmState(arm: ArmState): void {
  _state.arm_state = arm;
}

export function setGlobalMode(mode: string): void {
  _state.global_mode = mode;
}

export function setExecutionState(state: string): void {
  _state.execution_state = state;
}

export function setProviderState(provider: string, state: string): void {
  _state.provider_states[provider] = state;
}

export function setExecutorConnectivity(state: string): void {
  _state.executor_connectivity = state;
}

export function setMockMode(mock: boolean): void {
  _state.mock_mode = mock;
}

export function setRiskOff(riskOff: boolean): void {
  _state.risk_off = riskOff;
}

export function setLastTickResult(result: OperationalState["last_tick_result"]): void {
  _state.last_tick_result = result;
}

/**
 * Verifica se o gate atual permite envio de comandos ao executor.
 * G0 (Shadow) nunca envia comandos.
 */
export function canSendCommands(): boolean {
  return _state.gate !== "G0" && _state.arm_state === "ARMED";
}

/**
 * Verifica se o sistema está em shadow mode.
 */
export function isShadowMode(): boolean {
  return _state.gate === "G0";
}
