// ═════════════════════════════════════════════════════════════
// Exposure Governor
// Valida limites de exposição por moeda, cluster e símbolo.
// Função pura — sem I/O, sem estado externo.
// ═════════════════════════════════════════════════════════════

import { ReasonCode } from "@schimidt-brain/contracts";
import type { BrainIntent } from "@schimidt-brain/contracts";
import type { PortfolioState, OpenPosition } from "../types/inputs";

// ─── Tipos internos ──────────────────────────────────────────

export interface ExposureCheckResult {
  readonly allowed: boolean;
  readonly reason_code: ReasonCode | null;
  readonly message: string;
  /** Se não permitido mas possível com risco reduzido */
  readonly suggested_risk_pct: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Extrai as moedas base e cotação de um símbolo de par.
 * Ex: "EURUSD" → ["EUR", "USD"]
 * Ex: "BTCUSD" → ["BTC", "USD"]
 */
function extractCurrencies(symbol: string): [string, string] {
  // Pares forex padrão: 6 chars
  if (symbol.length === 6) {
    return [symbol.slice(0, 3), symbol.slice(3, 6)];
  }
  // Crypto ou outros: assume base=primeiros 3+, quote=últimos 3
  if (symbol.length > 6) {
    return [symbol.slice(0, symbol.length - 3), symbol.slice(-3)];
  }
  return [symbol, "USD"];
}

/**
 * Calcula exposição total por moeda.
 */
function calculateCurrencyExposure(
  positions: readonly OpenPosition[],
  newSymbol: string,
  newRiskPct: number
): Map<string, number> {
  const exposure = new Map<string, number>();

  for (const pos of positions) {
    const [base, quote] = extractCurrencies(pos.symbol);
    exposure.set(base, (exposure.get(base) ?? 0) + pos.risk_pct);
    exposure.set(quote, (exposure.get(quote) ?? 0) + pos.risk_pct * 0.5);
  }

  // Adicionar nova posição proposta
  const [newBase, newQuote] = extractCurrencies(newSymbol);
  exposure.set(newBase, (exposure.get(newBase) ?? 0) + newRiskPct);
  exposure.set(newQuote, (exposure.get(newQuote) ?? 0) + newRiskPct * 0.5);

  return exposure;
}

/**
 * Calcula exposição por símbolo.
 */
function calculateSymbolExposure(
  positions: readonly OpenPosition[],
  symbol: string,
  newRiskPct: number
): number {
  let total = newRiskPct;
  for (const pos of positions) {
    if (pos.symbol === symbol) {
      total += pos.risk_pct;
    }
  }
  return total;
}

// ─── Função principal ────────────────────────────────────────

/**
 * Verifica se um intent respeita todos os limites de exposição.
 *
 * Checks:
 * 1. Exposição por símbolo
 * 2. Exposição por moeda
 * 3. Exposição correlacionada
 * 4. Número máximo de posições
 * 5. Drawdown limit
 * 6. Daily loss limit
 * 7. Exposição total
 */
export function checkExposure(
  intent: BrainIntent,
  portfolio: PortfolioState
): ExposureCheckResult {
  const { risk_limits, risk_state, positions } = portfolio;

  // ─── 1. Max positions ──────────────────────────────────────
  if (risk_state.open_positions >= risk_limits.max_positions) {
    return {
      allowed: false,
      reason_code: ReasonCode.PM_MAX_POSITIONS,
      message: `Limite de ${risk_limits.max_positions} posições simultâneas atingido (atual: ${risk_state.open_positions})`,
      suggested_risk_pct: null,
    };
  }

  // ─── 2. Drawdown limit ────────────────────────────────────
  if (
    Math.abs(risk_state.current_drawdown_pct) >= risk_limits.max_drawdown_pct
  ) {
    return {
      allowed: false,
      reason_code: ReasonCode.PM_DRAWDOWN_LIMIT,
      message: `Drawdown atual (${risk_state.current_drawdown_pct.toFixed(1)}%) excede limite (${risk_limits.max_drawdown_pct}%)`,
      suggested_risk_pct: null,
    };
  }

  // ─── 3. Daily loss limit ──────────────────────────────────
  if (
    Math.abs(risk_state.daily_loss_pct) >= risk_limits.max_daily_loss_pct
  ) {
    return {
      allowed: false,
      reason_code: ReasonCode.PM_DAILY_LOSS_LIMIT,
      message: `Perda diária (${risk_state.daily_loss_pct.toFixed(1)}%) excede limite (${risk_limits.max_daily_loss_pct}%)`,
      suggested_risk_pct: null,
    };
  }

  // ─── 4. Exposição total ───────────────────────────────────
  const newTotalExposure =
    risk_state.current_exposure_pct + intent.proposed_risk_pct;
  if (newTotalExposure > risk_limits.max_exposure_pct) {
    const available =
      risk_limits.max_exposure_pct - risk_state.current_exposure_pct;
    if (available > 0.1) {
      return {
        allowed: false,
        reason_code: ReasonCode.PM_EXPOSURE_LIMIT,
        message: `Exposição total (${newTotalExposure.toFixed(1)}%) excederia limite (${risk_limits.max_exposure_pct}%). Risco reduzido sugerido.`,
        suggested_risk_pct: Math.floor(available * 10) / 10,
      };
    }
    return {
      allowed: false,
      reason_code: ReasonCode.PM_EXPOSURE_LIMIT,
      message: `Exposição total (${newTotalExposure.toFixed(1)}%) excederia limite (${risk_limits.max_exposure_pct}%)`,
      suggested_risk_pct: null,
    };
  }

  // ─── 5. Exposição por símbolo ─────────────────────────────
  const symbolExposure = calculateSymbolExposure(
    positions,
    intent.symbol,
    intent.proposed_risk_pct
  );
  if (symbolExposure > risk_limits.max_exposure_per_symbol_pct) {
    const currentSymbolExposure = symbolExposure - intent.proposed_risk_pct;
    const available =
      risk_limits.max_exposure_per_symbol_pct - currentSymbolExposure;
    if (available > 0.1) {
      return {
        allowed: false,
        reason_code: ReasonCode.PM_EXPOSURE_LIMIT,
        message: `Exposição em ${intent.symbol} (${symbolExposure.toFixed(1)}%) excederia limite por símbolo (${risk_limits.max_exposure_per_symbol_pct}%). Risco reduzido sugerido.`,
        suggested_risk_pct: Math.floor(available * 10) / 10,
      };
    }
    return {
      allowed: false,
      reason_code: ReasonCode.PM_EXPOSURE_LIMIT,
      message: `Exposição em ${intent.symbol} (${symbolExposure.toFixed(1)}%) excederia limite por símbolo (${risk_limits.max_exposure_per_symbol_pct}%)`,
      suggested_risk_pct: null,
    };
  }

  // ─── 6. Exposição por moeda ───────────────────────────────
  const currencyExposure = calculateCurrencyExposure(
    positions,
    intent.symbol,
    intent.proposed_risk_pct
  );
  for (const [currency, exposure] of currencyExposure) {
    if (exposure > risk_limits.max_exposure_per_currency_pct) {
      return {
        allowed: false,
        reason_code: ReasonCode.PM_EXPOSURE_LIMIT,
        message: `Exposição na moeda ${currency} (${exposure.toFixed(1)}%) excederia limite por moeda (${risk_limits.max_exposure_per_currency_pct}%)`,
        suggested_risk_pct: null,
      };
    }
  }

  // ─── 7. Exposição correlacionada ──────────────────────────
  // Conta posições no mesmo par de moedas (mesmo cluster)
  const [intentBase] = extractCurrencies(intent.symbol);
  let correlatedExposure = intent.proposed_risk_pct;
  for (const pos of positions) {
    const [posBase] = extractCurrencies(pos.symbol);
    if (posBase === intentBase && pos.symbol !== intent.symbol) {
      correlatedExposure += pos.risk_pct;
    }
  }
  if (correlatedExposure > risk_limits.max_correlated_exposure_pct) {
    return {
      allowed: false,
      reason_code: ReasonCode.PM_CORRELATION_BLOCK,
      message: `Exposição correlacionada em ${intentBase} (${correlatedExposure.toFixed(1)}%) excederia limite (${risk_limits.max_correlated_exposure_pct}%)`,
      suggested_risk_pct: null,
    };
  }

  // ─── Tudo OK ──────────────────────────────────────────────
  return {
    allowed: true,
    reason_code: null,
    message: "Exposição dentro dos limites",
    suggested_risk_pct: null,
  };
}
