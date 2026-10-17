"""Bounded, deterministic comparison of explicitly compatible exercise sources."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import math
import re

GROUP_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def compare_sources(sources: list[dict]) -> dict:
    groups: dict[str, list[dict]] = defaultdict(list)
    for source in sources:
        metadata = (
            source.get("comparison_group"),
            source.get("comparison_window_seconds"),
            source.get("comparison_tolerance"),
        )
        if all(value is None for value in metadata):
            continue
        if any(value is None for value in metadata):
            raise ValueError("Incomplete source comparison policy")
        group, window, tolerance = metadata
        if (not isinstance(group, str) or GROUP_PATTERN.fullmatch(group) is None
            or type(window) is not int or not 60 <= window <= 86400
            or type(tolerance) not in (int, float) or not math.isfinite(float(tolerance))
            or not 0 <= float(tolerance) <= 1_000_000):
            raise ValueError("Invalid source comparison policy")
        groups[group].append(source)

    results = []
    for name in sorted(groups):
        configured = groups[name]
        policies = {(item["comparison_window_seconds"],
                     float(item["comparison_tolerance"]), item.get("metric_unit"))
                    for item in configured}
        if len(policies) != 1:
            raise ValueError("Conflicting source comparison policy")
        window, tolerance, unit = next(iter(policies))
        if not isinstance(unit, str) or not unit.strip() or len(unit) > 64:
            raise ValueError("Invalid source comparison unit")
        eligible = [item for item in configured
                    if item.get("freshness") == "fresh"
                    and item.get("quality_status") == "synthetic_curated"
                    and type(item.get("metric_value")) in (int, float)
                    and math.isfinite(float(item["metric_value"]))
                    and isinstance(item.get("observed_at"), str)]
        status = "not_comparable"
        span = None
        value_range = None
        source_ids: list[str] = []
        if len(eligible) >= 2:
            times = [datetime.fromisoformat(item["observed_at"].replace("Z", "+00:00"))
                     for item in eligible]
            if any(value.tzinfo is None or value.utcoffset() is None for value in times):
                raise ValueError("Comparison timestamps must include timezone")
            span = int((max(times) - min(times)).total_seconds())
            if span <= window:
                values = [float(item["metric_value"]) for item in eligible]
                value_range = max(values) - min(values)
                status = "agreement" if value_range <= tolerance else "disagreement"
                source_ids = sorted(item["id"] for item in eligible)
        results.append({
            "comparison_group": name,
            "status": status,
            "metric_unit": unit,
            "window_seconds": window,
            "tolerance": tolerance,
            "observed_span_seconds": span,
            "value_range": value_range,
            "source_ids": source_ids,
        })

    overall = ("disagreement" if any(item["status"] == "disagreement" for item in results)
               else "agreement" if any(item["status"] == "agreement" for item in results)
               else "not_comparable")
    return {
        "version": "aegis.exercise.source-comparison.v1",
        "status": overall,
        "groups": results,
        "synthetic": True,
        "method": "explicit_group_time_window_and_absolute_tolerance",
        "validated_forecast": False,
        "operational_actions_enabled": False,
        "note": "Deterministic synthetic threshold check; agreement is not corroboration, accuracy, or a forecast.",
    }
