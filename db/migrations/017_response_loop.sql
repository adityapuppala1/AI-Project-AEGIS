-- Team response loop (docs/RESPONSE_LOOP.md). Additive and idempotent; requires schema.sql, 005 (exercise
-- incidents) and 012 (proactive_block_update). Exercise only: nothing here sends a message to anyone, and
-- the rows can only describe the five invented teams in services/api/app/fixtures/synthetic_teams.v1.json.
CREATE TABLE IF NOT EXISTS exercise_team_requests (
  id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES action_proposals(id),
  incident_id UUID NOT NULL REFERENCES incidents(id),
  agency_id UUID NOT NULL,
  task_id TEXT NOT NULL CHECK (task_id IN ('control_room', 'infrastructure', 'communications')),
  department_id TEXT NOT NULL CHECK (department_id IN ('control_room', 'infrastructure', 'communications')),
  team_id TEXT NOT NULL CHECK (team_id IN ('syn-team-rescue-01', 'syn-team-rescue-02', 'syn-team-health-01',
                                          'syn-team-fire-01', 'syn-team-municipal-01')),
  team_label TEXT NOT NULL CHECK (length(team_label) BETWEEN 1 AND 120),
  state TEXT NOT NULL CHECK (state IN ('requested', 'accepted', 'en_route', 'on_site', 'completed',
                                       'declined', 'stood_down')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
  requested_by TEXT NOT NULL CHECK (length(requested_by) BETWEEN 1 AND 256 AND requested_by NOT LIKE 'system:%'),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE),
  outbound_messages_sent BOOLEAN NOT NULL DEFAULT FALSE CHECK (outbound_messages_sent IS FALSE)
);
-- One active request per proposal, task and team. Terminal rows do not block a new request.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_team_requests_active_uidx
  ON exercise_team_requests (proposal_id, task_id, team_id)
  WHERE state IN ('requested', 'accepted', 'en_route', 'on_site');
CREATE INDEX IF NOT EXISTS exercise_team_requests_team_idx
  ON exercise_team_requests (agency_id, team_id, state);
CREATE INDEX IF NOT EXISTS exercise_team_requests_department_idx
  ON exercise_team_requests (agency_id, department_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS exercise_team_requests_incident_idx
  ON exercise_team_requests (incident_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS exercise_team_requests_proposal_idx
  ON exercise_team_requests (proposal_id, task_id);

-- Append-only report history. The actor subject is kept for audit and never returned by the response routes.
CREATE TABLE IF NOT EXISTS exercise_team_reports (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES exercise_team_requests(id),
  kind TEXT NOT NULL CHECK (kind IN ('requested', 'accepted', 'declined', 'en_route', 'on_site', 'completed',
                                     'situation_report', 'needs_support', 'stood_down', 'desk_handled')),
  code TEXT CHECK (code IS NULL OR code IN (
    'already_committed', 'out_of_area', 'not_equipped', 'off_shift', 'other',
    'as_expected', 'worse_than_expected', 'better_than_expected', 'access_blocked', 'nothing_found',
    'more_people', 'equipment', 'medical', 'transport')),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 1000 AND note !~ '[[:cntrl:]]'),
  authority TEXT NOT NULL CHECK (authority IN ('team', 'department_relay', 'department')),
  actor_subject TEXT NOT NULL CHECK (length(actor_subject) BETWEEN 1 AND 256 AND actor_subject NOT LIKE 'system:%'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE)
);
CREATE INDEX IF NOT EXISTS exercise_team_reports_request_idx
  ON exercise_team_reports (request_id, occurred_at, id);

DROP TRIGGER IF EXISTS exercise_team_reports_no_update ON exercise_team_reports;
CREATE TRIGGER exercise_team_reports_no_update BEFORE UPDATE OR DELETE ON exercise_team_reports
  FOR EACH ROW EXECUTE FUNCTION proactive_block_update();
