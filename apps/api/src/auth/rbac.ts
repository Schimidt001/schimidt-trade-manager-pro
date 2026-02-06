// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — RBAC (Role-Based Access Control)
// ═══════════════════════════════════════════════════════════════
// Roles: Admin > Operator > Viewer
// Admin: tudo (config changes, users placeholder)
// Operator: arm/disarm/tick + tudo do Viewer
// Viewer: GETs + stream (leitura apenas)
// ═══════════════════════════════════════════════════════════════

export type Role = "admin" | "operator" | "viewer";

/**
 * Hierarquia de roles (maior = mais permissões).
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

/**
 * Verifica se a role do utilizador atende ao mínimo exigido.
 */
export function hasMinRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Verifica se a role pode executar ações de escrita (arm/disarm/tick).
 */
export function canOperate(role: Role): boolean {
  return hasMinRole(role, "operator");
}

/**
 * Verifica se a role pode alterar configurações.
 */
export function canAdmin(role: Role): boolean {
  return hasMinRole(role, "admin");
}
