-- Opt-in proactive scheduler (A1) and evidence-change sentinel (A2). Additive and idempotent;
-- requires 012 and 013. Nothing here sends, approves, notifies or creates cases.
--
-- dedupe_key: sha256 over agency, trigger id, config version and the cited evidence, set only for
-- scheduler-created runs. The partial unique index guarantees one run per identical trigger
-- evaluation even if two API workers race; operator-started runs keep NULL and are unaffected.
ALTER TABLE proactive_runs ADD COLUMN IF NOT EXISTS dedupe_key TEXT
  CHECK (dedupe_key IS NULL OR dedupe_key ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS proactive_runs_dedupe_idx ON proactive_runs(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- One compact, append-only row per scheduler tick. Errors are fixed codes, never raw exceptions.
CREATE TABLE IF NOT EXISTS proactive_scheduler_ticks (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL CHECK (outcome IN ('completed','skipped_paused','skipped_locked','failed')),
  runs_started INTEGER NOT NULL DEFAULT 0 CHECK (runs_started >= 0),
  flags_recorded INTEGER NOT NULL DEFAULT 0 CHECK (flags_recorded >= 0),
  errors TEXT[] NOT NULL DEFAULT '{}' CHECK (array_to_string(errors, ',') ~ '^[a-z_,]*$'),
  actor TEXT NOT NULL DEFAULT 'system:scheduler'
);
CREATE INDEX IF NOT EXISTS proactive_scheduler_ticks_agency_idx ON proactive_scheduler_ticks(agency_id, started_at DESC);

DROP TRIGGER IF EXISTS proactive_scheduler_ticks_no_update ON proactive_scheduler_ticks;
CREATE TRIGGER proactive_scheduler_ticks_no_update BEFORE UPDATE OR DELETE ON proactive_scheduler_ticks
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
