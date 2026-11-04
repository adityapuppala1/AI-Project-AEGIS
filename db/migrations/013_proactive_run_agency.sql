-- Proactive run agency scope and platform kill switch. Additive and idempotent; requires 012.
-- proactive_runs.agency_id is the creating operator's verified aegis_agency_id. Legacy rows keep
-- NULL and are deliberately invisible to every scoped route (fail closed); nothing back-fills them.
ALTER TABLE proactive_runs ADD COLUMN IF NOT EXISTS agency_id UUID;
CREATE INDEX IF NOT EXISTS proactive_runs_agency_idx ON proactive_runs(agency_id, created_at DESC);

-- Single-row kill switch. Engaging it blocks run creation, run advance and watch refresh with
-- 409 proactive_paused; reads, cancellation and existing drafts are untouched.
CREATE TABLE IF NOT EXISTS proactive_pause (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  paused BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
INSERT INTO proactive_pause (id, paused) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS proactive_pause_audit (
  id UUID PRIMARY KEY,
  paused BOOLEAN NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  actor TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proactive_pause_audit_at_idx ON proactive_pause_audit(at DESC);

DROP TRIGGER IF EXISTS proactive_pause_audit_no_update ON proactive_pause_audit;
CREATE TRIGGER proactive_pause_audit_no_update BEFORE UPDATE OR DELETE ON proactive_pause_audit
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
