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

  // ─── cTrader Open API ─────────────────────────────────────
  /** cTrader Application Client ID */
  CTRADER_CLIENT_ID: string;
  /** cTrader Application Client Secret */
  CTRADER_CLIENT_SECRET: string;
  /** cTrader OAuth Redirect URI */
  CTRADER_REDIRECT_URI: string;
  /** cTrader OAuth Access Token */
  CTRADER_ACCESS_TOKEN: string;
  /** cTrader OAuth Refresh Token */
  CTRADER_REFRESH_TOKEN: string;
  /** cTrader Trader Account ID (ctidTraderAccountId) */
  CTRADER_CTID_TRADER_ACCOUNT_ID: string;
  /** cTrader Environment: LIVE or DEMO */
  CTRADER_ENV: string;
  /** Market Data Provider identifier */
  MARKET_DATA_PROVIDER: string;
  /** Market Data request timeout in ms */
  MARKET_DATA_TIMEOUT_MS: number;

  // ─── News Provider (Calendar) ─────────────────────────────
  /** FMP API Key (Financial Modeling Prep — provider primário) */
  FMP_API_KEY: string;
  /** Trading Economics API Key (legacy — mantido para compatibilidade) */
  TRADING_ECONOMICS_API_KEY: string;
  /** Finnhub API Key (legacy — mantido para compatibilidade) */
  FINNHUB_API_KEY: string;
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

    // cTrader Open API
    CTRADER_CLIENT_ID: requireEnv("CTRADER_CLIENT_ID"),
    CTRADER_CLIENT_SECRET: requireEnv("CTRADER_CLIENT_SECRET"),
    CTRADER_REDIRECT_URI: process.env.CTRADER_REDIRECT_URI ?? "",
    CTRADER_ACCESS_TOKEN: requireEnv("CTRADER_ACCESS_TOKEN"),
    CTRADER_REFRESH_TOKEN: process.env.CTRADER_REFRESH_TOKEN ?? "",
    CTRADER_CTID_TRADER_ACCOUNT_ID: requireEnv("CTRADER_CTID_TRADER_ACCOUNT_ID"),
    CTRADER_ENV: process.env.CTRADER_ENV ?? "DEMO",
    MARKET_DATA_PROVIDER: process.env.MARKET_DATA_PROVIDER ?? "CTRADER",
    MARKET_DATA_TIMEOUT_MS: parseInt(process.env.MARKET_DATA_TIMEOUT_MS ?? "5000", 10),

    // News Provider — FMP é o primário
    FMP_API_KEY: process.env.FMP_API_KEY ?? "",
    // Legacy providers (calendarService lê direto de process.env)
    TRADING_ECONOMICS_API_KEY: process.env.TRADING_ECONOMICS_API_KEY ?? "",
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY ?? "",
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
