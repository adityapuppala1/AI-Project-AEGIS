"""Bounded public synthetic-source queries. Not a production connector registry."""
import os
from datetime import datetime, timezone
from uuid import UUID
import psycopg
from psycopg.rows import dict_row

from app.intelligence_store import DEMO_AGENCY
from app.source_health import classify_source


def _format_reading(row: dict | None) -> dict | None:
    if row is None or row["reading_id"] is None:
        return None
    return {
        "id": str(row["reading_id"]),
        "observed_at": row["observed_at"].isoformat(),
        "ingested_at": row["ingested_at"].isoformat(),
        "value": float(row["metric_value"]),
        "quality_status": row["quality_status"],
        "synthetic": True,
    }


def list_exercise_sources() -> dict:
    as_of = datetime.now(timezone.utc)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # LATERAL returns each source's latest observation, if available.
            cur.execute(
                """SELECT s.id::text AS id, s.name, s.source_kind,
                          s.metric_label, s.metric_unit, s.expected_interval_seconds,
                          s.warning_multiplier, s.stale_multiplier,
                          latest.id::text AS reading_id, latest.observed_at,
                          latest.ingested_at, latest.metric_value,
                          latest.quality_status
                   FROM exercise_data_sources AS s
                   LEFT JOIN LATERAL (
                     SELECT x.id, x.observed_at, x.ingested_at,
                            x.metric_value, x.quality_status
                     FROM exercise_source_samples AS x
                     WHERE x.source_id = s.id AND x.synthetic IS TRUE
                     ORDER BY x.observed_at DESC, x.id DESC
                     LIMIT 1
                   ) AS latest ON TRUE
                   WHERE s.agency_id=%s AND s.synthetic IS TRUE
                   ORDER BY s.name, s.id LIMIT 100""",
                (str(DEMO_AGENCY),),
            )
            rows = cur.fetchall()
    summary = {status: 0 for status in ("fresh", "delayed", "stale", "no_data", "clock_anomaly")}
    sources = []
    for row in rows:
        health = classify_source(
            observed_at=row["observed_at"],
            ingested_at=row["ingested_at"],
            as_of=as_of,
            expected_interval_seconds=row["expected_interval_seconds"],
            warning_multiplier=float(row["warning_multiplier"]),
            stale_multiplier=float(row["stale_multiplier"]),
        )
        summary[health["status"]] += 1
        sources.append({
            "id": row["id"],
            "name": row["name"],
            "source_kind": row["source_kind"],
            "metric_label": row["metric_label"],
            "metric_unit": row["metric_unit"],
            "expected_interval_seconds": row["expected_interval_seconds"],
            "warning_multiplier": float(row["warning_multiplier"]),
            "stale_multiplier": float(row["stale_multiplier"]),
            "health": health,
            "latest": _format_reading(row),
            "synthetic": True,
        })
    return {
        "sources": sources,
        "counts": summary,
        "source": "synthetic_exercise",
        "as_of": as_of.isoformat(),
        "real_connectors_enabled": False,
        "total": len(sources),
    }


def source_history(source_id: UUID, limit: int = 24) -> dict | None:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::text, name, metric_label, metric_unit
                   FROM exercise_data_sources
                   WHERE id=%s AND agency_id=%s AND synthetic IS TRUE""",
                (str(source_id), str(DEMO_AGENCY)),
            )
            source = cur.fetchone()
            if source is None:
                return None
            cur.execute(
                """SELECT id::text, observed_at, ingested_at,
                          metric_value, quality_status
                   FROM exercise_source_samples
                   WHERE source_id=%s AND synthetic IS TRUE
                   ORDER BY observed_at DESC, id DESC LIMIT %s""",
                (str(source_id), limit),
            )
            items = cur.fetchall()
    return {
        "id": source["id"],
        "name": source["name"],
        "metric_label": source["metric_label"],
        "metric_unit": source["metric_unit"],
        "samples": [
            {
                "id": row["id"],
                "observed_at": row["observed_at"].isoformat(),
                "ingested_at": row["ingested_at"].isoformat(),
                "value": float(row["metric_value"]),
                "quality_status": row["quality_status"],
                "synthetic": True,
            }
            for row in items
        ],
        "source": "synthetic_exercise",
        "as_of": datetime.now(timezone.utc).isoformat(),
        "real_connector": False,
    }
