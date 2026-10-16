-- Idempotent exercise-only governance constraints on existing operational tables.
ALTER TABLE action_proposals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE action_proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS approvals_once_per_proposal ON approvals(proposal_id);
CREATE INDEX IF NOT EXISTS action_proposals_incident_idx ON action_proposals(incident_id);
CREATE INDEX IF NOT EXISTS audit_events_resource_idx ON audit_events(resource_type, resource_id, occurred_at);
