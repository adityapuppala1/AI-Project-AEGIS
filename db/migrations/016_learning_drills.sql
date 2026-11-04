-- A8 post-event learning, A9 exercise drills. Additive and idempotent; requires 012 (proactive_block_update)
-- and 013 (agency scope). Nothing here is read by the live trigger engine except trigger_config_versions,
-- which only an explicit platform_admin apply action writes (app/learning.py). Approval alone never applies.
--
-- Statistics are rehearsal statistics on synthetic thresholds or unreviewed retrospective labels. They are
-- never forecasting accuracy (research/real-data/PHASE2_PROTOCOL.md forbids that wording).

-- Closed event windows: an operator's explicit "close" action or a replay of known/synthetic events.
CREATE TABLE IF NOT EXISTS learning_windows (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL,
  hazard TEXT NOT NULL CHECK (hazard ~ '^[a-z][a-z_]{1,39}$'),
  window_start DATE NOT NULL,
  window_end DATE NOT NULL CHECK (window_end >= window_start AND window_end - window_start <= 400),
  source TEXT NOT NULL CHECK (source IN ('operator_close', 'replay_known_events', 'replay_synthetic')),
  basis TEXT NOT NULL CHECK (basis IN ('synthetic_rehearsal', 'known_events_unreviewed', 'registered_protocol_labels')),
  config_version TEXT NOT NULL CHECK (length(config_version) BETWEEN 1 AND 120),
  observed_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL,
  closed_by TEXT NOT NULL CHECK (closed_by NOT LIKE 'system:%'),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_windows_agency_idx ON learning_windows(agency_id, closed_at DESC);

-- Threshold change proposals: a versioned config diff generated from a window's statistics only.
CREATE TABLE IF NOT EXISTS threshold_proposals (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL,
  window_id UUID NOT NULL REFERENCES learning_windows(id),
  base_version TEXT NOT NULL CHECK (length(base_version) BETWEEN 1 AND 120),
  new_version TEXT NOT NULL CHECK (new_version ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  diff JSONB NOT NULL,
  rationale JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  maker_subject TEXT NOT NULL CHECK (maker_subject NOT LIKE 'system:%'),
  checker_subject TEXT CHECK (checker_subject IS NULL OR checker_subject NOT LIKE 'system:%'),
  decision_rationale TEXT CHECK (decision_rationale IS NULL OR length(decision_rationale) BETWEEN 10 AND 2000),
  applied_version TEXT,
  applied_by TEXT CHECK (applied_by IS NULL OR applied_by NOT LIKE 'system:%'),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Independent maker-checker, enforced again in SQL: the checker can never be the maker.
  CHECK (checker_subject IS NULL OR checker_subject <> maker_subject),
  CHECK (status NOT IN ('approved', 'rejected') OR (checker_subject IS NOT NULL AND decision_rationale IS NOT NULL)),
  -- Only an approved candidate can ever be applied.
  CHECK (applied_version IS NULL OR status = 'approved')
);
CREATE INDEX IF NOT EXISTS threshold_proposals_agency_idx ON threshold_proposals(agency_id, created_at DESC);

-- Applied trigger configuration overlays. The engine loads the newest row over the fixture. Append-only.
CREATE TABLE IF NOT EXISTS trigger_config_versions (
  version_id TEXT PRIMARY KEY CHECK (version_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  base_version TEXT NOT NULL,
  overrides JSONB NOT NULL,
  proposal_id UUID NOT NULL UNIQUE REFERENCES threshold_proposals(id),
  applied_by TEXT NOT NULL CHECK (applied_by NOT LIKE 'system:%'),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trigger_config_versions_applied_idx ON trigger_config_versions(applied_at DESC);

CREATE TABLE IF NOT EXISTS learning_audit (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('window', 'proposal', 'config')),
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('close', 'replay', 'create', 'submit', 'approve', 'reject', 'apply')),
  actor TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_audit_subject_idx ON learning_audit(subject_id, at);

-- A9 drills: exercise-only by construction. Drill evidence lives in the drill state, never in hazard_evidence.
CREATE TABLE IF NOT EXISTS exercise_drills (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL,
  exercise BOOLEAN NOT NULL DEFAULT true CHECK (exercise),
  scenario_id TEXT NOT NULL CHECK (scenario_id ~ '^[a-z0-9_.-]{1,80}$'),
  state JSONB NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by NOT LIKE 'system:%'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exercise_drills_agency_idx ON exercise_drills(agency_id, created_at DESC);

CREATE TABLE IF NOT EXISTS exercise_drill_audit (
  id UUID PRIMARY KEY,
  drill_id UUID NOT NULL REFERENCES exercise_drills(id),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 40),
  actor TEXT NOT NULL,
  sim_minute INTEGER NOT NULL CHECK (sim_minute >= 0),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exercise_drill_audit_drill_idx ON exercise_drill_audit(drill_id, at);

DROP TRIGGER IF EXISTS learning_windows_no_update ON learning_windows;
CREATE TRIGGER learning_windows_no_update BEFORE UPDATE OR DELETE ON learning_windows
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
DROP TRIGGER IF EXISTS trigger_config_versions_no_update ON trigger_config_versions;
CREATE TRIGGER trigger_config_versions_no_update BEFORE UPDATE OR DELETE ON trigger_config_versions
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
DROP TRIGGER IF EXISTS learning_audit_no_update ON learning_audit;
CREATE TRIGGER learning_audit_no_update BEFORE UPDATE OR DELETE ON learning_audit
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
DROP TRIGGER IF EXISTS exercise_drill_audit_no_update ON exercise_drill_audit;
CREATE TRIGGER exercise_drill_audit_no_update BEFORE UPDATE OR DELETE ON exercise_drill_audit
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
