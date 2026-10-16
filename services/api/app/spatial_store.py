"""Exercise-only PostGIS proximity exploration.

The word 'correlation' means geographic candidate matching here, not causal
or statistical correlation. These locations and assets are fictional. Real
agency assets, incident intelligence and decisions require OIDC/ABAC.
"""
import os
from datetime import datetime, timezone
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.intelligence_store import DEMO_AGENCY
from app.source_health import classify_source
from app.spatial_rules import DEFAULT_RADIUS_METERS, MAX_CANDIDATES, MAX_RADIUS_METERS, distance_band, explanation

SOURCE_SQL = """
SELECT s.id::text, s.name, s.source_kind, s.metric_label, s.metric_unit,
       s.expected_interval_seconds, s.warning_multiplier, s.stale_multiplier,
       ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography) AS distance_m,
       x.observed_at, x.ingested_at, x.metric_value, x.quality_status
FROM exercise_data_sources AS s
LEFT JOIN LATERAL (
  SELECT observed_at, ingested_at, metric_value, quality_status
  FROM exercise_source_samples
  WHERE source_id=s.id AND synthetic IS TRUE
  ORDER BY observed_at DESC, id DESC LIMIT 1
) AS x ON TRUE
WHERE s.agency_id=%s AND s.synthetic IS TRUE AND s.location IS NOT NULL
  AND ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography, %s)
ORDER BY distance_m ASC, s.id ASC LIMIT %s
"""

ASSET_SQL = """
SELECT id::text, asset_name, asset_kind,
       ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography) AS distance_m
FROM exercise_geo_assets
WHERE agency_id=%s AND synthetic IS TRUE
  AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography, %s)
ORDER BY distance_m ASC, id ASC LIMIT %s
"""


def spatial_candidates(incident_id: UUID, *, radius_m: int = DEFAULT_RADIUS_METERS) -> dict | None:
    if not 100 <= radius_m <= MAX_RADIUS_METERS:
        raise ValueError("Analysis radius outside bounded exercise limits")
    as_of = datetime.now(timezone.utc)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::text, hazard_type, ST_Y(location) AS lat, ST_X(location) AS lon
                   FROM incidents WHERE id=%s AND agency_id=%s AND is_exercise_fixture IS TRUE
                     AND location IS NOT NULL""",
                (str(incident_id), str(DEMO_AGENCY)),
            )
            incident = cur.fetchone()
            if not incident:
                return None
            center = (incident["lon"], incident["lat"])
            cur.execute(
                SOURCE_SQL,
                (center[0], center[1], str(DEMO_AGENCY), center[0], center[1], radius_m, MAX_CANDIDATES),
            )
            sources = cur.fetchall()
            cur.execute(
                ASSET_SQL,
                (center[0], center[1], str(DEMO_AGENCY), center[0], center[1], radius_m, MAX_CANDIDATES),
            )
            assets = cur.fetchall()
    candidates = []
    for row in sources:
        freshness = classify_source(
            observed_at=row["observed_at"], ingested_at=row["ingested_at"], as_of=as_of,
            expected_interval_seconds=row["expected_interval_seconds"],
            warning_multiplier=float(row["warning_multiplier"]),
            stale_multiplier=float(row["stale_multiplier"]),
        )
        distance = round(float(row["distance_m"]), 1)
        stale = freshness["status"] != "fresh"
        candidates.append({
            "id": row["id"],
            "name": row["name"],
            "source_kind": row["source_kind"],
            "distance_m": distance,
            "distance_band": distance_band(distance),
            "freshness": freshness["status"],
            "observed_at": row["observed_at"].isoformat() if row["observed_at"] else None,
            "quality_status": row["quality_status"] if row["quality_status"] else None,
            "metric_value": float(row["metric_value"]) if row["metric_value"] is not None else None,
            "metric_unit": row["metric_unit"],
            "reason": explanation(distance_m=distance, has_reading=row["observed_at"] is not None, stale=stale),
            "synthetic": True,
        })
    nearby_assets = []
    for row in assets:
        distance = round(float(row["distance_m"]), 1)
        nearby_assets.append({
            "id": row["id"],
            "name": row["asset_name"],
            "asset_kind": row["asset_kind"],
            "distance_m": distance,
            "distance_band": distance_band(distance),
            "impact_status": "not_assessed",
            "synthetic": True,
        })
    return {
        "incident_id": str(incident_id),
        "radius_m": radius_m,
        "center": {"lat": incident["lat"], "lon": incident["lon"]},
        "as_of": as_of.isoformat(),
        "nearby_sources": candidates,
        "nearby_assets": nearby_assets,
        "source": "synthetic_exercise",
        "analysis_kind": "geographic_proximity_only",
        "validated_risk_model": False,
        "actual_asset_impact_known": False,
        "operational_actions_enabled": False,
        "guidance": [
            "Verify the observation time, source identity and measured units before any inference.",
            "Proximity alone does not establish shared flooding, causation or real-world asset exposure.",
            "Do not infer that a fictional facility is affected. Consult an authorized agency and validated GIS layer.",
        ],
    }
