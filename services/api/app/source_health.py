"""Deterministic source-freshness classification, independent from model risk.

Data is *synthetic*, and this module does not assert that a provider or real
sensor is healthy. Freshness is measured by observed_at, NOT ingested_at.
"""
from datetime import datetime, timezone
from typing import Literal

Freshness = Literal["fresh", "delayed", "stale", "no_data", "clock_anomaly"]
CLOCK_TOLERANCE_SECONDS = 120


def classify_source(
    *,
    observed_at: datetime | None,
    ingested_at: datetime | None,
    as_of: datetime,
    expected_interval_seconds: int,
    warning_multiplier: float = 1.5,
    stale_multiplier: float = 4.0,
) -> dict:
    """Classify observed-data age, ingestion lag and future-clock anomalies.

    Threshold comparison is strict greater-than, so a sample exactly at the
    warning threshold remains fresh. These are exercise UX heuristics, NOT
    validated SLAs or scientific flood-risk measures.
    """
    if expected_interval_seconds <= 0 or not 1 <= warning_multiplier < stale_multiplier:
        raise ValueError("Invalid source freshness configuration")
    if as_of.tzinfo is None:
        raise ValueError("as_of must have a timezone")

    if observed_at is None or ingested_at is None:
        return {
            "status": "no_data", "age_seconds": None,
            "ingestion_lag_seconds": None,
            "reason": "No synthetic observations have been recorded.",
        }
    if observed_at.tzinfo is None or ingested_at.tzinfo is None:
        return {
            "status": "clock_anomaly", "age_seconds": None,
            "ingestion_lag_seconds": None,
            "reason": "Observation timestamp lacks a timezone.",
        }
    now = as_of.astimezone(timezone.utc)
    observed = observed_at.astimezone(timezone.utc)
    ingested = ingested_at.astimezone(timezone.utc)
    age = (now - observed).total_seconds()
    lag = (ingested - observed).total_seconds()

    if age < -CLOCK_TOLERANCE_SECONDS or (ingested - now).total_seconds() > CLOCK_TOLERANCE_SECONDS or lag < 0:
        return {
            "status": "clock_anomaly",
            "age_seconds": int(age),
            "ingestion_lag_seconds": int(lag),
            "reason": "Simulated source timestamps conflict with the reference clock.",
        }
    age_seconds = max(0, int(age))
    if age > expected_interval_seconds * stale_multiplier:
        status: Freshness = "stale"
        reason = "Observation age exceeds the configured stale-data threshold."
    elif age > expected_interval_seconds * warning_multiplier:
        status = "delayed"
        reason = "Observation age exceeds the expected update window."
    else:
        status = "fresh"
        reason = "Synthetic observation age is within the configured update window."
    return {
        "status": status,
        "age_seconds": age_seconds,
        "ingestion_lag_seconds": max(0, int(lag)),
        "reason": reason,
    }
