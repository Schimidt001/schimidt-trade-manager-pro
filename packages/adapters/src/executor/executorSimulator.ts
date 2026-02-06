// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Executor Simulator
// ═══════════════════════════════════════════════════════════════
// Simulador do executor para testes e rollout gradual.
// Mantém estado interno (estratégia, símbolos, armed/disarmed).
// Permite testar Gate 0 e Gate 1 sem dinheiro real.
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
}

// ─── Simulador ─────────────────────────────────────────────────

/**
 * Simulador do executor que implementa IExecutorAdapter.
 * Mantém estado em memória e responde de acordo com o modo configurado.
 */
export class ExecutorSimulator implements IExecutorAdapter {
  private _simulatorMode: SimulatorMode;
  private _state: SimulatorState;
  private _eventLog: ExecutorEvent[];

  constructor(simulatorMode: SimulatorMode = "normal") {
    this._simulatorMode = simulatorMode;
    this._eventLog = [];
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
