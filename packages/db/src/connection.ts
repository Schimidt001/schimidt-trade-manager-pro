// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Pool de conexão PostgreSQL
// ═══════════════════════════════════════════════════════════════
// Usa node-postgres (pg) com pool.
// Configuração via DATABASE_URL (env).
// ═══════════════════════════════════════════════════════════════

import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * Retorna o pool de conexão singleton.
 * Cria o pool na primeira chamada usando DATABASE_URL.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "@schimidt-brain/db: DATABASE_URL não definida. " +
        "Configure a variável de ambiente antes de usar o pacote."
      );
    }
    pool = new Pool({
      connectionString,
      // Configurações sensatas para produção
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

/**
 * Encerra o pool de conexão.
 * Deve ser chamado no shutdown graceful da aplicação.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
