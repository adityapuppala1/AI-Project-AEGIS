"""Read-only exercise-stack preflight for existing Windows/PostGIS volumes.

Reports ONLY synthetic fixture readiness. It does not validate actual sensors,
operator sessions, agency deployment, GIS truth, flood accuracy, or emergency
response authorization. Never print the DATABASE_URL or credentials.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from app.intelligence_store import DEMO_AGENCY

# These names are constants controlled by the repository, not user input.
REQUIRED_RELATIONS = (
    "agencies", "incidents", "action_proposals", "approvals", "audit_events",
    "exercise_incident_events", "exercise_incident_evidence",
    "exercise_data_sources", "exercise_source_samples", "exercise_geo_assets",
    "exercise_ingestion_ledger", "exercise_ingestion_quarantine",
    "exercise_agency_tasks", "exercise_agency_task_events",
)
REQUIRED_COLUMNS = {
    "incidents": ("is_exercise_fixture",),
    "action_proposals": ("created_at", "updated_at"),
    "exercise_data_sources": ("location", "comparison_group", "comparison_window_seconds",
                              "comparison_tolerance"),
}
MINIMUM_FIXTURES = {
    "incidents": 5, "sources": 5, "source_samples": 32,
    "timeline_events": 7, "evidence": 5, "geo_assets": 5,
    "agency_tasks": 7, "agency_task_events": 13,
}
COUNTS = {
    "incidents": """SELECT COUNT(*) AS n FROM incidents
                    WHERE agency_id=%s AND is_exercise_fixture IS TRUE
                    AND id IN ('22222222-2222-4222-8222-222222222222',
                               '33333333-3333-4333-8333-333333333333',
                               '44444444-4444-4444-8444-444444444444',
                               '55555555-5555-4555-8555-555555555555',
                               '66666666-6666-4666-8666-666666666666')""",
    "sources": """SELECT COUNT(*) AS n FROM exercise_data_sources
                  WHERE agency_id=%s AND synthetic IS TRUE AND id::text LIKE 'c3000000-%%'""",
    "source_samples": """SELECT COUNT(*) AS n FROM exercise_source_samples AS x
                         JOIN exercise_data_sources AS s ON s.id=x.source_id
                         WHERE s.agency_id=%s AND s.synthetic IS TRUE
                           AND x.synthetic IS TRUE""",
    "timeline_events": """SELECT COUNT(*) AS n FROM exercise_incident_events AS e
                          JOIN incidents AS i ON i.id=e.incident_id
                          WHERE i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                            AND e.synthetic IS TRUE""",
    "evidence": """SELECT COUNT(*) AS n FROM exercise_incident_evidence AS e
                   JOIN incidents AS i ON i.id=e.incident_id
                   WHERE i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                     AND e.synthetic IS TRUE""",
    "geo_assets": """SELECT COUNT(*) AS n FROM exercise_geo_assets
                     WHERE agency_id=%s AND synthetic IS TRUE AND id::text LIKE 'e5000000-%%'""",
    "agency_tasks": """SELECT COUNT(*) AS n FROM exercise_agency_tasks AS t
                       JOIN incidents AS i ON i.id=t.incident_id
                       WHERE i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                         AND t.synthetic IS TRUE AND t.id::text LIKE 'f6000000-%%'""",
    "agency_task_events": """SELECT COUNT(*) AS n FROM exercise_agency_task_events AS e
                             JOIN exercise_agency_tasks AS t ON t.id=e.task_id
                             JOIN incidents AS i ON i.id=t.incident_id
                             WHERE i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                               AND t.synthetic IS TRUE AND e.synthetic IS TRUE
                               AND e.id::text LIKE 'f7000000-%%'""",
}

DEPENDENCY_FIXTURES = (
    ("incident_context", "Incident evidence context", ("incidents", "timeline_events", "evidence")),
    ("source_observations", "Synthetic source observations", ("sources", "source_samples")),
    ("spatial_context", "Fictional spatial context", ("geo_assets",)),
    ("agency_sync", "Scripted department tasks", ("agency_tasks", "agency_task_events")),
)


def dependency_diagnostics(*, missing_relations: list[str], missing_columns: list[str],
                           counts: dict[str, int] | None) -> list[dict]:
    schema_ready = not missing_relations and not missing_columns
    result = [{
        "id": "exercise_database", "label": "Local exercise database",
        "status": "ready", "reason_code": "database_query_succeeded",
        "next_step": "No action required.",
    }, {
        "id": "exercise_schema", "label": "Exercise schema and migrations",
        "status": "ready" if schema_ready else "not_ready",
        "reason_code": "schema_complete" if schema_ready else "schema_incomplete",
        "next_step": ("No action required." if schema_ready else
                      "Run the reviewed additive migrate service; do not reset the database volume."),
    }]
    for dependency_id, label, fixture_names in DEPENDENCY_FIXTURES:
        if not schema_ready or counts is None:
            status, reason = "blocked", "schema_check_failed"
            next_step = "Resolve the schema diagnostic before checking fixtures."
        else:
            gaps = [name for name in fixture_names if counts.get(name, -1) < MINIMUM_FIXTURES[name]]
            status = "ready" if not gaps else "not_ready"
            reason = "fixtures_present" if not gaps else "fixtures_incomplete"
            next_step = ("No action required." if not gaps else
                         "Run the reviewed idempotent synthetic seed service; do not use a volume reset.")
        result.append({"id": dependency_id, "label": label, "status": status,
                       "reason_code": reason, "next_step": next_step})
    return result


def summarize(*, missing_relations: list[str], missing_columns: list[str],
              counts: dict[str, int] | None, as_of: datetime) -> dict:
    """Deterministically fail closed even if only one migration is incomplete."""
    gaps = [key for key, minimum in MINIMUM_FIXTURES.items()
            if counts is None or counts.get(key, -1) < minimum]
    ready = not missing_relations and not missing_columns and not gaps
    return {
        "diagnostic_version": "aegis.exercise.dependencies.v1",
        "status": "ready" if ready else "not_ready",
        "mode": "synthetic_exercise",
        "as_of": as_of.isoformat(),
        "checks": {
            "schema": not missing_relations and not missing_columns,
            "fixtures": not gaps,
            "read_only": True,
            "real_integrations_connected": False,
            "operational_actions_enabled": False,
        },
        "missing_relations": missing_relations,
        "missing_columns": missing_columns,
        "incomplete_fixtures": gaps,
        "fixture_counts": counts if counts is not None else {},
        "dependencies": dependency_diagnostics(
            missing_relations=missing_relations, missing_columns=missing_columns, counts=counts),
        "note": "Local synthetic database readiness only; real emergency operation remains prohibited.",
    }


def inspect_stack() -> dict:
    now = datetime.now(timezone.utc)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row,
                         connect_timeout=4) as conn:
        with conn.cursor() as cur:
            missing_relations = []
            for relation in REQUIRED_RELATIONS:
                cur.execute("SELECT to_regclass(%s)::text AS relation", ("public." + relation,))
                if cur.fetchone()["relation"] is None:
                    missing_relations.append(relation)

            missing_columns = []
            for relation, columns in REQUIRED_COLUMNS.items():
                for column in columns:
                    cur.execute(
                        """SELECT EXISTS (
                             SELECT 1 FROM information_schema.columns
                             WHERE table_schema='public' AND table_name=%s
                               AND column_name=%s
                           ) AS present""",
                        (relation, column),
                    )
                    if not cur.fetchone()["present"]:
                        missing_columns.append(relation + "." + column)

            if missing_relations or missing_columns:
                return summarize(missing_relations=missing_relations,
                                 missing_columns=missing_columns, counts=None, as_of=now)

            counts = {}
            for name, sql in COUNTS.items():
                cur.execute(sql, (str(DEMO_AGENCY),))
                counts[name] = int(cur.fetchone()["n"])
            return summarize(missing_relations=[], missing_columns=[],
                             counts=counts, as_of=now)


def main() -> None:
    try:
        result = inspect_stack()
    except (psycopg.Error, KeyError):
        print(json.dumps({
            "status": "not_ready", "mode": "synthetic_exercise",
            "error": "Database unavailable or not configured",
            "operational_actions_enabled": False,
        }))
        raise SystemExit(1) from None
    print(json.dumps(result, sort_keys=True, indent=2))
    if result["status"] != "ready":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
