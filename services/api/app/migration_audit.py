"""P0 security migration preflight: inspect PostgreSQL schema, never mutate it.

The local exercise must not be called ready if the independent checker
trigger or unique-approval constraint is absent or disabled. This is not
a production penetration test or authorization certification.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

EXPECTED_EXTENSIONS = ("postgis", "pg_trgm")
EXPECTED_INDEXES = (
    "approvals_once_per_proposal",
    "incidents_demo_scope_idx",
    "exercise_source_samples_time_idx",
    "exercise_data_sources_geography_idx",
    "exercise_geo_assets_geography_idx",
    "exercise_agency_tasks_incident_state_idx",
    "exercise_agency_task_events_time_idx",
)
EXPECTED_TRIGGER = "aegis_check_independent_checker"


def summarize_security_schema(*, extensions: set[str], indexes: dict[str, bool],
                              trigger_enabled: bool, sampled_at: datetime) -> dict:
    missing_extensions = sorted(set(EXPECTED_EXTENSIONS) - extensions)
    missing_indexes = sorted(name for name in EXPECTED_INDEXES if indexes.get(name) is not True)
    ready = not missing_extensions and not missing_indexes and trigger_enabled is True
    return {
        "status": "ready" if ready else "not_ready",
        "mode": "synthetic_exercise",
        "sampled_at": sampled_at.isoformat(),
        "missing_extensions": missing_extensions,
        "missing_or_nonunique_indexes": missing_indexes,
        "independent_checker_trigger_enabled": trigger_enabled is True,
        "synthetic_only": True,
        "real_operations_authorized": False,
        "note": "DB constraints checked only; this does not test real IdP, RLS or live service authority.",
    }


def inspect_security_schema() -> dict:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row,
                         connect_timeout=4) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT extname FROM pg_extension WHERE extname = ANY(%s)",
                (list(EXPECTED_EXTENSIONS),),
            )
            extensions = {row["extname"] for row in cur.fetchall()}

            indexes = {}
            for name in EXPECTED_INDEXES:
                cur.execute(
                    """SELECT idx.indisvalid AS valid, idx.indisready AS ready,
                              idx.indisunique AS unique_index
                       FROM pg_class AS tbl
                       JOIN pg_namespace AS ns ON ns.oid=tbl.relnamespace
                       JOIN pg_index AS idx ON idx.indexrelid=tbl.oid
                       WHERE ns.nspname='public' AND tbl.relname=%s""",
                    (name,),
                )
                row = cur.fetchone()
                indexes[name] = bool(row and row["valid"] and row["ready"] and
                                     (name != "approvals_once_per_proposal" or row["unique_index"]))

            cur.execute(
                """SELECT t.tgenabled AS enabled
                   FROM pg_trigger AS t
                   JOIN pg_class AS tbl ON tbl.oid=t.tgrelid
                   JOIN pg_namespace AS ns ON ns.oid=tbl.relnamespace
                   WHERE ns.nspname='public' AND tbl.relname='approvals'
                     AND t.tgname=%s AND NOT t.tgisinternal""",
                (EXPECTED_TRIGGER,),
            )
            trigger = cur.fetchone()
    return summarize_security_schema(
        extensions=extensions, indexes=indexes,
        trigger_enabled=bool(trigger and trigger["enabled"] in ("O", "A")),
        sampled_at=datetime.now(timezone.utc),
    )


def main() -> None:
    try:
        report = inspect_security_schema()
    except (psycopg.Error, KeyError):
        print(json.dumps({
            "status": "not_ready", "mode": "synthetic_exercise",
            "error": "Schema inspection unavailable", "real_operations_authorized": False,
        }))
        raise SystemExit(1) from None
    print(json.dumps(report, sort_keys=True, indent=2))
    if report["status"] != "ready":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
