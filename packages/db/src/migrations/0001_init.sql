-- ═══════════════════════════════════════════════════════════════
-- @schimidt-brain/db — Migration 0001: Criação das tabelas
-- ═══════════════════════════════════════════════════════════════
-- Tabelas: ledger_events, audit_logs, replay_days
-- Idempotente: usa IF NOT EXISTS em todas as operações
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. ledger_events ───────────────────────────────────────────
-- Armazena TODOS os eventos estruturados do sistema:
--   MCL snapshots, brain intents, PM decisions, EHM actions,
--   execution state changes, provider state changes.
-- O campo payload guarda o JSON completo conforme contracts
-- para replay fiel e auditoria.
CREATE TABLE IF NOT EXISTS ledger_events (
  event_id        UUID            PRIMARY KEY,
  correlation_id  UUID            NOT NULL,
  timestamp       TIMESTAMPTZ     NOT NULL,
  severity        TEXT            NOT NULL
                    CHECK (severity IN ('INFO', 'WARN', 'ERROR')),
  event_type      TEXT            NOT NULL,
  component       TEXT            NOT NULL
                    CHECK (component IN (
                      'MCL', 'PM', 'A2', 'B3', 'C3', 'D2', 'EHM', 'SYSTEM'
                    )),
  symbol          TEXT            NULL,
  brain_id        TEXT            NULL,
  reason_code     TEXT            NULL,
  payload         JSONB           NOT NULL
);

-- ─── 2. audit_logs ──────────────────────────────────────────────
-- Registra mudanças de configuração e ações humanas/sistema.
-- Campos before/after guardam diff completo em JSONB.
CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id        UUID            PRIMARY KEY,
  timestamp       TIMESTAMPTZ     NOT NULL,
  actor_user_id   TEXT            NOT NULL,
  actor_role      TEXT            NOT NULL,
  action          TEXT            NOT NULL
                    CHECK (action IN (
                      'CONFIG_CHANGE', 'PARAM_UPDATE', 'BRAIN_TOGGLE',
                      'MODE_OVERRIDE', 'MANUAL_ACTION', 'SYSTEM_RESTART',
                      'PERMISSION_CHANGE'
                    )),
  resource        TEXT            NOT NULL,
  reason          TEXT            NOT NULL,
  before          JSONB           NULL,
  after           JSONB           NULL,
  correlation_id  UUID            NULL
);

-- ─── 3. replay_days ─────────────────────────────────────────────
-- Cache/registro de dias disponíveis para replay e export.
-- Um dia é "complete" se tiver eventos cobrindo as janelas
-- do playbook e fechamento (definido pela API).
CREATE TABLE IF NOT EXISTS replay_days (
  date            DATE            PRIMARY KEY,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  status          TEXT            NOT NULL
                    CHECK (status IN ('complete', 'partial')),
  summary         JSONB           NULL
);

COMMIT;
