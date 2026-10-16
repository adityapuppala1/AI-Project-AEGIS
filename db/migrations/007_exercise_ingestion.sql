-- DATAFUSION EXERCISE INGESTION. NO REAL OPERATIONS OR AUTOMATIC ACTIONS.
-- All events originate from a bundled, known synthetic fixture via CLI.
CREATE TABLE IF NOT EXISTS exercise_ingestion_ledger (
  event_id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES exercise_data_sources(id),
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_value NUMERIC(12,3) NOT NULL CHECK (metric_value >= 0),
  metric_unit TEXT NOT NULL,
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE)
);
CREATE INDEX IF NOT EXISTS exercise_ingestion_source_time_idx
 ON exercise_ingestion_ledger (source_id, observed_at DESC, event_id);

-- Reject metadata only: no untrusted raw payloads, images, or documents kept.
-- One entry per unique invalid record and reason even after replay.
CREATE TABLE IF NOT EXISTS exercise_ingestion_quarantine (
  id UUID PRIMARY KEY,
  record_sha256 CHAR(64) NOT NULL CHECK (record_sha256 ~ '^[a-f0-9]{64}$'),
  reason_code TEXT NOT NULL CHECK
    (reason_code IN ('invalid_contract','unregistered_source','unit_mismatch',
                    'future_observation','event_conflict','oversized_record')),
  event_id TEXT,
  source_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE),
  UNIQUE (record_sha256, reason_code)
);
CREATE INDEX IF NOT EXISTS exercise_ingestion_quarantine_time_idx
 ON exercise_ingestion_quarantine (received_at DESC);
