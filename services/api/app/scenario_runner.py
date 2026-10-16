"""Opt-in local ReplayLab: create fresh synthetic readings without deleting history.

This CLI inserts three fictional data samples for demonstration only.
No HTTP mutation endpoint, physical device, official feed, public warning,
departmental message or dispatch service is involved.
"""
import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import psycopg
from psycopg.rows import dict_row

from app.intelligence_store import DEMO_AGENCY

SCENARIO_VERSION = "aegis.tabletop.urban-flood.v1"
# Exact demo sources: source D4 deliberately keeps NO DATA.
SAMPLES = (
    ("c3000000-0000-4000-8000-000000000001", "mm", 4, 1, "34.000", "synthetic_curated"),
    ("c3000000-0000-4000-8000-000000000002", "cm", 22, 2, "78.000", "synthetic_curated"),
    ("c3000000-0000-4000-8000-000000000003", "reports", 150, 3, "4.000", "synthetic_unverified"),
)


def replay_tabletop(run_id: UUID, *, as_of: datetime | None = None) -> dict:
    if not isinstance(run_id, UUID):
        raise ValueError("Exercise run identifier must be a UUID")
    now = as_of or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Exercise reference time must include timezone")
    now = now.astimezone(timezone.utc)
    accepted = 0
    duplicate = 0
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Serialize this single opt-in exercise write transaction.
            cur.execute("SELECT pg_advisory_xact_lock(4839418222)")
            cur.execute(
                """SELECT id::text, metric_unit FROM exercise_data_sources
                   WHERE agency_id=%s AND synthetic IS TRUE
                     AND id=ANY(%s::uuid[])""",
                (str(DEMO_AGENCY), [row[0] for row in SAMPLES]),
            )
            registered = {row["id"]: row["metric_unit"] for row in cur.fetchall()}
            if registered != {sid: unit for sid, unit, *_ in SAMPLES}:
                raise ValueError("Required synthetic registry or measurement units do not match")

            for source_id, unit, age_minutes, lag_minutes, value, quality in SAMPLES:
                observed = now - timedelta(minutes=age_minutes)
                ingested = observed + timedelta(minutes=lag_minutes)
                sample_id = uuid5(NAMESPACE_URL, SCENARIO_VERSION + ":" + str(run_id) + ":" + source_id)
                cur.execute(
                    """INSERT INTO exercise_source_samples
                       (id, source_id, observed_at, ingested_at,
                        metric_value, quality_status, synthetic)
                       VALUES (%s,%s,%s,%s,%s,%s,TRUE)
                       ON CONFLICT (id) DO NOTHING
                       RETURNING id::text""",
                    (str(sample_id), source_id, observed, ingested,
                     Decimal(value), quality),
                )
                if cur.fetchone() is None:
                    duplicate += 1
                else:
                    accepted += 1
    return {
        "scenario_version": SCENARIO_VERSION,
        "run_id": str(run_id),
        "generated_at": now.isoformat(),
        "source": "synthetic_exercise",
        "accepted_samples": accepted,
        "duplicate_samples": duplicate,
        "deliberately_unreported_sources": 1,
        "real_sensor_connections": False,
        "operational_actions_enabled": False,
        "outbound_messages_sent": False,
        "note": "Fictional observations for local testing. Existing history is never reset.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline AEGIS synthetic observation scenario")
    parser.add_argument("--confirm-synthetic", action="store_true",
                        help="Explicitly permit adding three fictional sample rows")
    parser.add_argument("--run-id", type=UUID, default=None,
                        help="Optional fixed UUID; reusing it is idempotent")
    args = parser.parse_args()
    if not args.confirm_synthetic:
        parser.error("Use --confirm-synthetic to add fictional observations to your local exercise database")
    report = replay_tabletop(args.run_id or uuid4())
    print(json.dumps(report, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
