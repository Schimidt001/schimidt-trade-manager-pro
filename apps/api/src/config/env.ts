// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Configuração de Ambiente
// ═══════════════════════════════════════════════════════════════

export interface EnvConfig {
  /** Porta do servidor */
  PORT: number;
  /** URL de conexão PostgreSQL */
  DATABASE_URL: string;
  /** API Key para role Admin */
  API_KEY_ADMIN: string;
  /** API Key para role Operator */
  API_KEY_OPERATOR: string;
  /** API Key para role Viewer */
  API_KEY_VIEWER: string;
  /** Versão do build */
  BUILD_VERSION: string;
  /** Node environment */
  NODE_ENV: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
  return value;
}

export function loadEnv(): EnvConfig {
  return {
    PORT: parseInt(process.env.PORT ?? "3000", 10),
    DATABASE_URL: requireEnv("DATABASE_URL"),
    API_KEY_ADMIN: requireEnv("API_KEY_ADMIN"),
    API_KEY_OPERATOR: requireEnv("API_KEY_OPERATOR"),
    API_KEY_VIEWER: requireEnv("API_KEY_VIEWER"),
    BUILD_VERSION: process.env.BUILD_VERSION ?? "1.0.0-dev",
    NODE_ENV: process.env.NODE_ENV ?? "development",
  };
}

/** Singleton da config carregada */
let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = loadEnv();
  }
  return _config;
}
