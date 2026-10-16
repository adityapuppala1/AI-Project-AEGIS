-- Additive tables for the *synthetic-only* Incident Intelligence workspace.
-- These are NOT the authorization audit trail or operational evidence vault.
CREATE TABLE IF NOT EXISTS exercise_incident_events (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('observation','assessment','coordination','resolution')),
    occurred_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary TEXT NOT NULL CHECK (LENGTH(summary) BETWEEN 5 AND 2000),
    actor_label TEXT NOT NULL,
    synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic = TRUE)
);
CREATE INDEX IF NOT EXISTS exercise_incident_events_timeline_idx
    ON exercise_incident_events (incident_id, occurred_at DESC, id);

CREATE TABLE IF NOT EXISTS exercise_incident_evidence (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    source_label TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('exercise_sensor','exercise_report','exercise_gis')),
    summary TEXT NOT NULL CHECK (LENGTH(summary) BETWEEN 5 AND 2000),
    observed_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL,
    quality_status TEXT NOT NULL CHECK (quality_status IN ('synthetic_unverified','synthetic_curated')),
    synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic = TRUE),
    CHECK (ingested_at >= observed_at)
);
CREATE INDEX IF NOT EXISTS exercise_incident_evidence_time_idx
    ON exercise_incident_evidence (incident_id, observed_at DESC, id);
