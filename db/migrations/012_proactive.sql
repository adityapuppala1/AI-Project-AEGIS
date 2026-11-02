-- Opt-in proactive multi-hazard watch. Additive and idempotent.
-- Evidence and trigger events never create cases, proposals, tasks or approvals.
-- connector_config, connector_secrets and proactive_runs.state may be updated; audit, evidence
-- and trigger rows are append-only.
CREATE TABLE IF NOT EXISTS connector_config (
  connector_id TEXT PRIMARY KEY CHECK (connector_id ~ '^[a-z_]{3,40}$'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  CHECK (connector_id <> 'authority_notification' OR enabled = false)
);

CREATE TABLE IF NOT EXISTS connector_secrets (
  connector_id TEXT NOT NULL,
  key_name TEXT NOT NULL CHECK (key_name ~ '^[a-z_]{2,40}$'),
  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL CHECK (octet_length(nonce) = 12),
  key_version INTEGER NOT NULL DEFAULT 1,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{8}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (connector_id, key_name)
);

CREATE TABLE IF NOT EXISTS connector_audit (
  id UUID PRIMARY KEY,
  connector_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save','clear_secret','test','enable','disable')),
  ok BOOLEAN NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connector_audit_connector_idx ON connector_audit(connector_id, at DESC);

CREATE TABLE IF NOT EXISTS hazard_evidence (
  id UUID PRIMARY KEY,
  connector_id TEXT NOT NULL,
  hazard TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  value DOUBLE PRECISION,
  unit TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sha256 TEXT NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_url TEXT
);
CREATE INDEX IF NOT EXISTS hazard_evidence_retrieved_idx ON hazard_evidence(retrieved_at DESC);

CREATE TABLE IF NOT EXISTS hazard_trigger_events (
  id UUID PRIMARY KEY,
  trigger_id TEXT NOT NULL,
  config_version TEXT NOT NULL,
  hazard TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('clear','watch','candidate')),
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  score DOUBLE PRECISION,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  rationale JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS hazard_trigger_events_fired_idx ON hazard_trigger_events(fired_at DESC);

CREATE TABLE IF NOT EXISTS proactive_runs (
  id UUID PRIMARY KEY,
  trigger_event_id UUID NOT NULL REFERENCES hazard_trigger_events(id),
  state JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proactive_run_audit (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES proactive_runs(id),
  step TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS proactive_run_audit_run_idx ON proactive_run_audit(run_id, at);

CREATE OR REPLACE FUNCTION proactive_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS connector_audit_no_update ON connector_audit;
CREATE TRIGGER connector_audit_no_update BEFORE UPDATE ON connector_audit
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
DROP TRIGGER IF EXISTS hazard_evidence_no_update ON hazard_evidence;
CREATE TRIGGER hazard_evidence_no_update BEFORE UPDATE ON hazard_evidence
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
DROP TRIGGER IF EXISTS hazard_trigger_events_no_update ON hazard_trigger_events;
CREATE TRIGGER hazard_trigger_events_no_update BEFORE UPDATE ON hazard_trigger_events
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
DROP TRIGGER IF EXISTS proactive_run_audit_no_update ON proactive_run_audit;
CREATE TRIGGER proactive_run_audit_no_update BEFORE UPDATE ON proactive_run_audit
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
