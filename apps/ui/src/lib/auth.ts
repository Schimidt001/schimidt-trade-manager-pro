// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/ui — Auth Helpers
// ═══════════════════════════════════════════════════════════════
// Gerencia API key em sessionStorage.
// Roles: viewer | operator | admin
// ═══════════════════════════════════════════════════════════════

export type Role = "admin" | "operator" | "viewer";

const STORAGE_KEY = "schimidt_brain_api_key";
const ROLE_KEY = "schimidt_brain_role";

// ─── API Key ──────────────────────────────────────────────────

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(ROLE_KEY);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

// ─── Role ─────────────────────────────────────────────────────

export function getRole(): Role {
  if (typeof window === "undefined") return "viewer";
  return (sessionStorage.getItem(ROLE_KEY) as Role) || "viewer";
}

export function setRole(role: Role): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ROLE_KEY, role);
}

export function isViewer(): boolean {
  return getRole() === "viewer";
}

export function canOperate(): boolean {
  const r = getRole();
  return r === "operator" || r === "admin";
}

export function canAdmin(): boolean {
  return getRole() === "admin";
}
