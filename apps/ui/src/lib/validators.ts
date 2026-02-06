// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/ui — Validators
// ═══════════════════════════════════════════════════════════════

/**
 * Valida que a string de confirmação corresponde ao esperado.
 * Usado em ConfirmActionModal (ARM/DISARM/KILL).
 */
export function validateConfirmText(input: string, expected: string): boolean {
  return input.trim().toUpperCase() === expected.toUpperCase();
}

/**
 * Valida que o motivo tem pelo menos N caracteres.
 */
export function validateReason(reason: string, minLength = 5): boolean {
  return reason.trim().length >= minLength;
}

/**
 * Valida formato de data YYYY-MM-DD.
 */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Valida UUID v4.
 */
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
