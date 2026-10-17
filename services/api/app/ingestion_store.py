"""Private CLI-only DataFusion exercise replay and metadata-only quarantine.

No HTTP ingestion route exists. A replay runs locally in the API container
from a code-reviewed fixture, using one PostgreSQL transaction.
"""
import os
from collections import Counter
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

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



def _attach_case_evidence(cur, incident_id: UUID, event_id: UUID, digest: str) -> int:
    """Explicit tabletop association, never inferred causality or corroboration.

    Read stored validated data, not the current input payload. The digest binds
    duplicate replay requests to the original accepted event. Quarantined or
    conflicting records never reach this path.
    """
    cur.execute(
        """SELECT l.source_id::text, l.observed_at, l.received_at,
                  l.metric_value, l.metric_unit, x.quality_status, s.name, s.source_kind
           FROM exercise_ingestion_ledger l
           JOIN exercise_source_samples x ON x.id=l.event_id AND x.source_id=l.source_id
           JOIN exercise_data_sources s ON s.id=l.source_id
           WHERE l.event_id=%s AND l.payload_sha256=%s AND s.agency_id=%s
             AND l.synthetic IS TRUE AND x.synthetic IS TRUE AND s.synthetic IS TRUE""",
        (str(event_id), digest, str(DEMO_AGENCY)),
    )
    stored = cur.fetchone()
    if stored is None:
        raise ValueError("Accepted synthetic event provenance is unavailable")
    evidence_id = uuid5(NAMESPACE_URL, f"aegis-case-replay-evidence:{incident_id}:{event_id}")
    chronology_id = uuid5(NAMESPACE_URL, f"aegis-case-replay-timeline:{incident_id}:{event_id}")
    summary = (
        f"SIMULATION: Explicit local replay association. Event {event_id}; "
        f"source {stored['source_id']}; accepted payload SHA256 {digest}; "
        f"reading {stored['metric_value']} {stored['metric_unit']}. "
        "Association is not inferred causality, independent corroboration or real flood evidence."
    )
    cur.execute(
        """INSERT INTO exercise_incident_evidence
           (id,incident_id,source_label,source_kind,summary,observed_at,ingested_at,quality_status)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING RETURNING id""",
        (str(evidence_id), str(incident_id), stored["name"],
         "exercise_report" if stored["source_kind"] == "field_report" else "exercise_sensor",
         summary, stored["observed_at"], stored["received_at"], stored["quality_status"]),
    )
    added = int(cur.fetchone() is not None)
    cur.execute(
        """INSERT INTO exercise_incident_events
           (id,incident_id,event_type,occurred_at,summary,actor_label)
           VALUES (%s,%s,'observation',%s,%s,'Local synthetic replay')
           ON CONFLICT (id) DO NOTHING""",
        (str(chronology_id), str(incident_id), stored["observed_at"], summary),
    )
    return added

def replay_records(records: list[object], *, as_of: datetime | None = None, incident_id: UUID | None = None) -> dict:
    if not 1 <= len(records) <= MAX_BATCH_SIZE:
        raise ValueError("A replay needs between 1 and 100 exercise records")
    clock = as_of or datetime.now(timezone.utc)
    if clock.tzinfo is None:
        raise ValueError("as_of must have a timezone")
    if incident_id is not None and not isinstance(incident_id, UUID):
        raise ValueError("Exercise incident identifier must be a UUID")
    results = Counter()
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Serialize concurrent local replays so event-id lookups remain atomic.
            cur.execute("SELECT pg_advisory_xact_lock(4839418221)")
            if incident_id is not None:
                cur.execute(
                    """SELECT id FROM incidents WHERE id=%s AND agency_id=%s
                       AND is_exercise_fixture IS TRUE FOR SHARE""",
                    (str(incident_id), str(DEMO_AGENCY)),
                )
                if cur.fetchone() is None:
                    raise LookupError("Synthetic exercise incident not found")
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
                        if incident_id is not None:
                            results["linked_evidence"] += _attach_case_evidence(
                                cur, incident_id, validated.event_id, digest)
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
                if incident_id is not None:
                    results["linked_evidence"] += _attach_case_evidence(
                        cur, incident_id, validated.event_id, digest)
                results["accepted"] += 1
        # Transaction is committed only if all queries succeed; partial
        # failures roll back ledger, quarantine and sample rows together.
    return {
        "mode": "synthetic_exercise",
        "incident_id": str(incident_id) if incident_id else None,
        "linked_evidence": results["linked_evidence"],
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
