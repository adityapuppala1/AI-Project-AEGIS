"""Strict versioned contract for deterministic, bundled exercise events.

This validates *synthetic* records only. It never authenticates real sensors,
accepts external device credentials, or delivers actionable warning signals.
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

CONTRACT = "aegis.exercise.observation.v1"
MAX_RECORD_BYTES = 4096
FUTURE_TOLERANCE = timedelta(seconds=120)


class ExerciseObservationV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    contract_version: Literal["aegis.exercise.observation.v1"]
    event_id: UUID
    source_id: UUID
    synthetic: Literal[True]
    observed_at: datetime
    metric_value: Decimal = Field(ge=0, le=50000, max_digits=12, decimal_places=3)
    metric_unit: Literal["mm", "cm", "reports"]
    quality_status: Literal["synthetic_curated", "synthetic_unverified"]

    @field_validator("observed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observed_at must have a timezone")
        return value.astimezone(timezone.utc)


def payload_digest(raw: object) -> str:
    canonical = json.dumps(raw, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def check_record(raw: object, *, as_of: datetime) -> tuple[ExerciseObservationV1 | None, str | None]:
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone aware")
    if len(json.dumps(raw, default=str, ensure_ascii=True).encode("utf-8")) > MAX_RECORD_BYTES:
        return None, "oversized_record"
    # Require RFC3339-style string fields in raw JSON, but parse here rather
    # than allowing Pydantic strict mode to accidentally reject valid JSON.
    if not isinstance(raw, dict):
        return None, "invalid_contract"
    try:
        payload = ExerciseObservationV1.model_validate_json(json.dumps(raw))
    except (ValueError, TypeError):
        return None, "invalid_contract"
    if payload.observed_at > as_of.astimezone(timezone.utc) + FUTURE_TOLERANCE:
        return None, "future_observation"
    return payload, None


def reject_metadata(raw: object) -> tuple[str | None, str | None]:
    if not isinstance(raw, dict):
        return None, None
    # Never reflect unbounded or untrusted descriptions into audit output.
    event_id = raw.get("event_id")
    source_id = raw.get("source_id")
    safe_event = str(event_id)[:80] if isinstance(event_id, str) else None
    safe_source = str(source_id)[:80] if isinstance(source_id, str) else None
    return safe_event, safe_source
