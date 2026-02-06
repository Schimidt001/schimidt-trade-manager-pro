-- ═══════════════════════════════════════════════════════════════
-- @schimidt-brain/db — Migration 0002: Índices
-- ═══════════════════════════════════════════════════════════════
-- Índices para performance de UI, stream, replay e search.
-- Idempotente: usa IF NOT EXISTS em todos os índices.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── ledger_events: índices obrigatórios ────────────────────────

-- Ordenação temporal (principal para listagens e tail)
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp_desc
  ON ledger_events (timestamp DESC);

-- Busca por cadeia de correlação
CREATE INDEX IF NOT EXISTS idx_ledger_correlation_id
  ON ledger_events (correlation_id);

-- Filtro por tipo de evento + tempo
CREATE INDEX IF NOT EXISTS idx_ledger_event_type_timestamp
  ON ledger_events (event_type, timestamp DESC);

-- Filtro por símbolo + tempo
CREATE INDEX IF NOT EXISTS idx_ledger_symbol_timestamp
  ON ledger_events (symbol, timestamp DESC)
  WHERE symbol IS NOT NULL;

-- Filtro por brain_id + tempo (parcial, apenas quando não-null)
CREATE INDEX IF NOT EXISTS idx_ledger_brain_id_timestamp
  ON ledger_events (brain_id, timestamp DESC)
  WHERE brain_id IS NOT NULL;

-- Filtro por severidade + tempo
CREATE INDEX IF NOT EXISTS idx_ledger_severity_timestamp
  ON ledger_events (severity, timestamp DESC);

-- GIN index em payload para buscas JSONB avançadas
CREATE INDEX IF NOT EXISTS idx_ledger_payload_gin
  ON ledger_events USING GIN (payload);

-- Filtro por reason_code + tempo (útil para search/logs)
CREATE INDEX IF NOT EXISTS idx_ledger_reason_code_timestamp
  ON ledger_events (reason_code, timestamp DESC)
  WHERE reason_code IS NOT NULL;

-- ─── audit_logs: índices obrigatórios ───────────────────────────

-- Ordenação temporal
CREATE INDEX IF NOT EXISTS idx_audit_timestamp_desc
  ON audit_logs (timestamp DESC);

-- Filtro por ator + tempo
CREATE INDEX IF NOT EXISTS idx_audit_actor_timestamp
  ON audit_logs (actor_user_id, timestamp DESC);

-- Filtro por recurso + tempo
CREATE INDEX IF NOT EXISTS idx_audit_resource_timestamp
  ON audit_logs (resource, timestamp DESC);

-- ─── replay_days: índices opcionais ─────────────────────────────

-- Filtro por status + data (para listar dias completos/parciais)
CREATE INDEX IF NOT EXISTS idx_replay_status_date
  ON replay_days (status, date DESC);

COMMIT;
