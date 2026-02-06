// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/ui — Format Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Formata timestamp ISO para HH:MM:SS (UTC-3).
 */
export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * Formata timestamp ISO para DD/MM/YYYY HH:MM:SS (UTC-3).
 */
export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * Formata data ISO para YYYY-MM-DD.
 */
export function formatDate(iso: string): string {
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

/**
 * Retorna relógio UTC-3 atual.
 */
export function getCurrentTimeBR(): string {
  return new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Trunca UUID para exibição.
 */
export function shortId(id: string): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

/**
 * Formata número com casas decimais.
 */
export function formatNumber(n: number | undefined | null, decimals = 2): string {
  if (n === undefined || n === null) return "—";
  return n.toFixed(decimals);
}

/**
 * Formata percentual.
 */
export function formatPercent(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Severity para cor.
 */
export function severityColor(severity: string): string {
  switch (severity?.toUpperCase()) {
    case "ERROR":
      return "text-red-400";
    case "WARN":
      return "text-yellow-400";
    case "INFO":
    default:
      return "text-blue-400";
  }
}

/**
 * Severity para cor de badge bg.
 */
export function severityBgColor(severity: string): string {
  switch (severity?.toUpperCase()) {
    case "ERROR":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "WARN":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "INFO":
    default:
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
}
