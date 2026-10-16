"""Read-only incident intelligence fixtures for the public EXERCISE workspace.

Do not reuse these endpoints for real agency evidence. Live or confidential
incident access must require verified SSO/ABAC at every layer.
"""
import os
from datetime import datetime, timezone
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

DEMO_AGENCY = UUID("11111111-1111-4111-8111-111111111111")


def _serialize(row: dict) -> dict:
    return {
        key: value.isoformat() if isinstance(value, datetime) else str(value) if isinstance(value, UUID) else value
        for key, value in row.items()
    }


def incident_workspace(incident_id: UUID) -> dict | None:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::text, hazard_type, status, created_at,
                          ST_Y(location) AS lat, ST_X(location) AS lon
                   FROM incidents WHERE id = %s AND agency_id = %s
                     AND is_exercise_fixture IS TRUE""",
                (str(incident_id), str(DEMO_AGENCY)),
            )
            incident = cur.fetchone()
            if incident is None:
                return None
            cur.execute(
                """SELECT id::text, event_type, occurred_at, recorded_at,
                          summary, actor_label, synthetic
                   FROM exercise_incident_events
                   WHERE incident_id = %s AND synthetic IS TRUE
                   ORDER BY occurred_at DESC, id LIMIT 100""",
                (str(incident_id),),
            )
            timeline = [_serialize(row) for row in cur.fetchall()]
            cur.execute(
                """SELECT id::text, source_label, source_kind, summary,
                          observed_at, ingested_at, quality_status, synthetic
                   FROM exercise_incident_evidence
                   WHERE incident_id = %s AND synthetic IS TRUE
                   ORDER BY observed_at DESC, id LIMIT 50""",
                (str(incident_id),),
            )
            evidence = []
            for row in cur.fetchall():
                serialized = _serialize(row)
                serialized["ingest_lag_seconds"] = max(
                    0, int((row["ingested_at"] - row["observed_at"]).total_seconds())
                )
                evidence.append(serialized)

    return {
        "incident": _serialize(incident),
        "timeline": timeline,
        "evidence": evidence,
        "source": "synthetic_exercise",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "assessment": {
            "status": "not_assessed",
            "model_version": None,
            "calibrated_probability": None,
            "prediction_horizon": None,
            "message": "No validated hazard forecast or automated recommendation is attached to this exercise case.",
        },
        "operational_actions_enabled": False,
    }
