"""Private CLI-only DataFusion exercise replay and metadata-only quarantine.

No HTTP ingestion route exists. A replay runs locally in the API container
from a code-reviewed fixture, using one PostgreSQL transaction.
"""
import os
from collections import Counter
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5

import psycopg
from psycopg.rows import dict_row

from app.ingestion_contract import check_record, payload_digest, reject_metadata
from app.intelligence_store import DEMO_AGENCY

MAX_BATCH_SIZE = 100
REASONS = (
    "invalid_contract", "unregistered_source", "unit_mismatch",
    "future_observation", "event_conflict", "oversized_record",
)


def quarantine(cur, raw: object, reason: str) -> None:
    if reason not in REASONS:
        raise ValueError("Unknown quarantine reason")
    digest = payload_digest(raw)
    event_id, source_id = reject_metadata(raw)
    record_id = uuid5(NAMESPACE_URL, "aegis-exercise-quarantine:" + digest + ":" + reason)
    # Deliberately do NOT persist the raw record; only a bounded identifier
    # and a digest. This is not a production evidence vault or DLQ.
    cur.execute(
        """INSERT INTO exercise_ingestion_quarantine
           (id, record_sha256, reason_code, event_id, source_id)
           VALUES (%s,%s,%s,%s,%s) ON CONFLICT (record_sha256, reason_code) DO NOTHING""",
        (str(record_id), digest, reason, event_id, source_id),
    )


def replay_records(records: list[object], *, as_of: datetime | None = None) -> dict:
    if not 1 <= len(records) <= MAX_BATCH_SIZE:
        raise ValueError("A replay needs between 1 and 100 exercise records")
    clock = as_of or datetime.now(timezone.utc)
    if clock.tzinfo is None:
        raise ValueError("as_of must have a timezone")
    results = Counter()
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            for raw in records:
                validated, problem = check_record(raw, as_of=clock)
                if problem is not None:
                    quarantine(cur, raw, problem)
                    results[problem] += 1
                    continue
                assert validated is not None
                cur.execute(
                    """SELECT metric_unit FROM exercise_data_sources
                       WHERE id=%s AND agency_id=%s AND synthetic IS TRUE""",
                    (str(validated.source_id), str(DEMO_AGENCY)),
                )
                source = cur.fetchone()
                if not source:
                    quarantine(cur, raw, "unregistered_source")
                    results["unregistered_source"] += 1
                    continue
                if source["metric_unit"] != validated.metric_unit:
                    quarantine(cur, raw, "unit_mismatch")
                    results["unit_mismatch"] += 1
                    continue

                digest = payload_digest(raw)
                cur.execute(
                    "SELECT payload_sha256 FROM exercise_ingestion_ledger WHERE event_id=%s FOR UPDATE",
                    (str(validated.event_id),),
                )
                previous = cur.fetchone()
                if previous:
                    if previous["payload_sha256"] == digest:
                        results["duplicate"] += 1
                    else:
                        quarantine(cur, raw, "event_conflict")
                        results["event_conflict"] += 1
                    continue

                received_at = datetime.now(timezone.utc)
                cur.execute(
                    """INSERT INTO exercise_ingestion_ledger
                       (event_id,source_id,payload_sha256,observed_at,received_at,metric_value,metric_unit)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        str(validated.event_id), str(validated.source_id), digest,
                        validated.observed_at, received_at, validated.metric_value,
                        validated.metric_unit,
                    ),
                )
                cur.execute(
                    """INSERT INTO exercise_source_samples
                       (id,source_id,observed_at,ingested_at,metric_value,quality_status)
                       VALUES (%s,%s,%s,%s,%s,%s)""",
                    (
                        str(validated.event_id), str(validated.source_id),
                        validated.observed_at, received_at,
                        validated.metric_value, validated.quality_status,
                    ),
                )
                results["accepted"] += 1
        # Transaction is committed only if all queries succeed; partial
        # failures roll back ledger, quarantine and sample rows together.
    return {
        "mode": "synthetic_exercise",
        "processed": len(records),
        "accepted": results["accepted"],
        "duplicate": results["duplicate"],
        "quarantined": sum(results[reason] for reason in REASONS),
        "quarantine_reasons": {reason: results[reason] for reason in REASONS},
        "no_operational_actions": True,
    }


def ingestion_overview() -> dict:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT COUNT(*) AS total FROM exercise_ingestion_ledger AS l
                   JOIN exercise_data_sources AS s ON s.id=l.source_id
                   WHERE s.agency_id=%s AND s.synthetic IS TRUE AND l.synthetic IS TRUE""",
                (str(DEMO_AGENCY),),
            )
            accepted = cur.fetchone()["total"]
            cur.execute(
                """SELECT reason_code, COUNT(*) AS amount FROM exercise_ingestion_quarantine
                   WHERE synthetic IS TRUE GROUP BY reason_code ORDER BY reason_code"""
            )
            reasons = {row["reason_code"]: row["amount"] for row in cur.fetchall()}
    return {
        "mode": "synthetic_exercise",
        "replay_trigger": "local_cli_only",
        "accepted_events": accepted,
        "quarantine_records": sum(reasons.values()),
        "quarantine_reasons": reasons,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "live_ingestion_enabled": False,
        "no_operational_actions": True,
    }
