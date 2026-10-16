-- AEGIS AgencySync: scripted exercise-only department acknowledgements.
-- NO actual emergency dispatch, SMS, email or inter-agency transmission.
CREATE TABLE IF NOT EXISTS exercise_agency_tasks (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    agency_label TEXT NOT NULL CHECK (length(agency_label) BETWEEN 3 AND 100),
    task_kind TEXT NOT NULL CHECK (task_kind IN (
        'desk_review', 'field_verification_draft',
        'infrastructure_check_draft', 'communications_draft'
    )),
    summary TEXT NOT NULL CHECK (
        length(summary) BETWEEN 18 AND 400 AND summary LIKE 'SIMULATION:%'
    ),
    playbook_ref TEXT NOT NULL CHECK (playbook_ref = 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1'),
    state TEXT NOT NULL CHECK (state IN ('prepared','acknowledged','closed')),
    prepared_at TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE),
    CHECK (due_at >= prepared_at),
    CHECK (acknowledged_at IS NULL OR acknowledged_at >= prepared_at),
    CHECK (closed_at IS NULL OR (
        acknowledged_at IS NOT NULL AND closed_at >= acknowledged_at
    )),
    CHECK (
        (state = 'prepared' AND acknowledged_at IS NULL AND closed_at IS NULL) OR
        (state = 'acknowledged' AND acknowledged_at IS NOT NULL AND closed_at IS NULL) OR
        (state = 'closed' AND acknowledged_at IS NOT NULL AND closed_at IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS exercise_agency_tasks_incident_state_idx
    ON exercise_agency_tasks (incident_id, state, prepared_at DESC);
CREATE TABLE IF NOT EXISTS exercise_agency_task_events (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES exercise_agency_tasks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('prepared','acknowledged','closed','exercise_note')),
    occurred_at TIMESTAMPTZ NOT NULL,
    actor_label TEXT NOT NULL CHECK (length(actor_label) BETWEEN 3 AND 100),
    summary TEXT NOT NULL CHECK (
        length(summary) BETWEEN 18 AND 400 AND summary LIKE 'SIMULATION:%'
    ),
    synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE)
);
CREATE INDEX IF NOT EXISTS exercise_agency_task_events_time_idx
    ON exercise_agency_task_events (task_id, occurred_at, id);
