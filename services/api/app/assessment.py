"""Deterministic, non-operational readiness for synthetic AEGIS exercises.

No flood forecasting, numeric risk inference, real dispatch recommendations,
real asset impact claims, or operational approval is generated here.
"""
from collections import Counter
from datetime import datetime, timezone
from app.source_health import classify_source
from uuid import UUID

FRESHNESS = frozenset({"fresh", "delayed", "stale", "no_data", "clock_anomaly"})


def evaluate_readiness(case: dict, nearby: dict) -> dict:
    if case.get("source") != "synthetic_exercise" or case.get("operational_actions_enabled") is not False:
        raise ValueError("Only explicitly synthetic exercise cases are allowed")
    if (nearby.get("source") != "synthetic_exercise"
        or nearby.get("analysis_kind") != "geographic_proximity_only"
        or nearby.get("operational_actions_enabled") is not False
        or nearby.get("validated_risk_model") is not False
        or nearby.get("actual_asset_impact_known") is not False):
        raise ValueError("Unknown or unsafe geospatial context")
    incident = case.get("incident")
    if not isinstance(incident, dict) or not isinstance(incident.get("id"), str):
        raise ValueError("Malformed exercise case")
    case_id = str(UUID(incident["id"]))
    if nearby.get("incident_id") != case_id:
        raise ValueError("Case and geographic context do not match")
    radius = nearby.get("radius_m")
    if type(radius) is not int or not 100 <= radius <= 5000:
        raise ValueError("Analysis radius out of bounds")
    sources = nearby.get("nearby_sources")
    assets = nearby.get("nearby_assets")
    evidence = case.get("evidence")
    assessment = case.get("assessment")
    if (not isinstance(sources, list) or len(sources) > 20
        or any(not isinstance(item, dict) or item.get("synthetic") is not True
               or item.get("freshness") not in FRESHNESS
               or item.get("quality_status") not in
                    (None, "synthetic_curated", "synthetic_unverified")
               for item in sources)):
        raise ValueError("Untrusted source observations")
    if (not isinstance(assets, list) or len(assets) > 20
        or any(not isinstance(item, dict) or item.get("synthetic") is not True
               or item.get("impact_status") != "not_assessed" for item in assets)):
        raise ValueError("Unknown infrastructure impact claim")
    if (not isinstance(evidence, list) or len(evidence) > 50
        or any(not isinstance(item, dict) or item.get("synthetic") is not True
               or item.get("quality_status") not in ("synthetic_curated", "synthetic_unverified")
               for item in evidence)):
        raise ValueError("Unknown or non-synthetic evidence")
    if (not isinstance(assessment, dict)
        or assessment.get("status") != "not_assessed"
        or assessment.get("calibrated_probability") is not None):
        raise ValueError("Unvalidated incident-specific risk must remain unavailable")
    # Recalculate *all* source statuses, rather than trusting a string from
    # a previous component. The same classifier is used by Source Health.
    # A mismatch is a simulation data integrity error, never evidence.
    reference_text = nearby.get("as_of")
    if not isinstance(reference_text, str):
        raise ValueError("Missing reference clock for simulated source provenance")
    try:
        reference = datetime.fromisoformat(reference_text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Invalid simulated reference clock") from exc
    if reference.tzinfo is None or reference.utcoffset() is None:
        raise ValueError("Reference clock must be timezone aware")

    def event_time(value: object, label: str) -> datetime | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError(label + " must be a timezone-aware ISO timestamp")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Malformed " + label) from exc
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError(label + " must include timezone")
        return parsed

    for source in sources:
        expected = source.get("expected_interval_seconds")
        warning = source.get("warning_multiplier")
        stale = source.get("stale_multiplier")
        if (type(expected) is not int or not 60 <= expected <= 86400
            or type(warning) not in (int, float)
            or type(stale) not in (int, float)):
            raise ValueError("Missing or invalid freshness threshold provenance")
        observed = event_time(source.get("observed_at"), "observed_at")
        ingested = event_time(source.get("ingested_at"), "ingested_at")
        if (observed is None) != (ingested is None):
            raise ValueError("Incomplete exercise reading timestamp pair")
        try:
            calculated = classify_source(
                observed_at=observed, ingested_at=ingested,
                as_of=reference, expected_interval_seconds=expected,
                warning_multiplier=float(warning), stale_multiplier=float(stale),
            )
        except (TypeError, ValueError) as exc:
            raise ValueError("Invalid exercise source freshness configuration") from exc
        if calculated["status"] != source["freshness"]:
            raise ValueError("Exercise source freshness conflicts with its timestamps")

    def verified_exercise_id(value: object, kind: str) -> str:
        if not isinstance(value, str):
            raise ValueError("Missing synthetic " + kind + " reference")
        try:
            return str(UUID(value))
        except ValueError as exc:
            raise ValueError("Invalid synthetic " + kind + " reference") from exc

    source_refs = [verified_exercise_id(item.get("id"), "source") for item in sources]
    evidence_refs = [verified_exercise_id(item.get("id"), "evidence") for item in evidence]
    counts = Counter(item["freshness"] for item in sources)
    reasons = []
    if not sources:
        reasons.append({"code": "no_geographic_sources",
                        "description": "No positioned simulated sources are within the selected radius."})
    if sources and not counts["fresh"]:
        reasons.append({"code": "no_current_simulated_samples",
                        "description": "No nearby exercise sample is within its configured observation window."})
    if counts["delayed"] or counts["stale"]:
        reasons.append({"code": "aging_observations",
                        "description": "Some exercise observations are delayed or stale. Recent ingestion cannot refresh old observations."})
    if counts["no_data"] or counts["clock_anomaly"]:
        reasons.append({"code": "missing_or_invalid_timestamps",
                        "description": "One or more simulated sources lack observations or have anomalous timestamps."})
    if any(item.get("quality_status") == "synthetic_unverified" for item in sources):
        reasons.append({"code": "unverified_demo_source",
                        "description": "One or more simulated sources have not been curated for this exercise."})
    if not evidence:
        reasons.append({"code": "no_case_evidence",
                        "description": "No synthetic evidence records are attached to this case."})
    reasons.extend([
        {"code": "no_validated_hazard_model",
         "description": "There is no validated event-specific flood prediction model for this incident."},
        {"code": "proximity_is_not_impact",
         "description": "Fictional facilities nearby do not establish physical exposure, damage or causality."},
    ])
    # A recent but unverified synthetic sample (or unverified case evidence)
    # cannot make the exercise context appear corroborated.
    curated_fresh = sum(item["freshness"] == "fresh" and
                        item.get("quality_status") == "synthetic_curated"
                        for item in sources)
    curated_evidence = sum(item.get("quality_status") == "synthetic_curated"
                           for item in evidence)
    if counts["fresh"] and not curated_fresh:
        reasons.append({"code": "no_curated_current_demo_source",
                        "description": "Recent observations exist, but none is a curated exercise fixture."})
    if evidence and not curated_evidence:
        reasons.append({"code": "no_curated_case_evidence",
                        "description": "Only unverified synthetic case evidence is attached."})
    enough_demo_context = bool(curated_fresh and curated_evidence)
    return {
        "incident_id": case_id,
        "source": "synthetic_exercise",
        "assessment_kind": "explainable_context_checklist_only",
        "context_state": ("simulated_context_for_human_review" if enough_demo_context
                          else "insufficient_simulated_context"),
        "model_eligible_for_real_forecast": False,
        "validated_risk_model": False,
        "real_world_risk_probability": None,
        "real_world_asset_impact_known": False,
        "operational_actions_enabled": False,
        "needs_accountable_human_review": True,
        "radius_m": radius,
        "source_freshness_counts": {key: counts[key] for key in sorted(FRESHNESS)},
        "fictional_assets_nearby": len(assets),
        "synthetic_evidence_records": len(evidence),
        "curated_current_sources": curated_fresh,
        "curated_evidence_records": curated_evidence,
        "playbook": {
            "version": "AEGIS-URBAN-FLOOD-EXERCISE-v0.1",
            "status": "illustrative_not_approved_operational_sop",
            "step_refs": ["URB-01", "URB-02", "URB-03", "URB-04", "URB-05"],
            "synthetic_evidence_ids": sorted(set(evidence_refs))[:50],
            "synthetic_source_ids": sorted(set(source_refs))[:20],
            "generated_by": "deterministic_exercise_checklist_not_ai_forecast",
            "operational_actions_enabled": False,
        },
        "reasons": reasons,
        "recommendation_draft": [
            "Verify exercise evidence, observation timestamps and quality labels. Request independent corroboration for missing or stale observations.",
            "Treat geographically close sources as candidates, not causal evidence. Consult authorized GIS and validated sources for any real-world determination.",
            "Record an accountable human exercise assessment separately; this screen cannot authorize warning issuance or responder dispatch.",
        ],
    }
