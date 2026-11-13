"""Deterministic, non-operational readiness for synthetic IndTrana exercises.

No flood forecasting, numeric risk inference, real dispatch recommendations,
real asset impact claims, or operational approval is generated here.
"""
from collections import Counter
import hashlib
import json
from datetime import datetime, timezone
from app.source_health import classify_source
from app.source_comparison import compare_sources
from uuid import UUID

CHECKLIST_VERSION = "aegis.exercise.context.v2"
PLAYBOOK_VERSION = "AEGIS-URBAN-FLOOD-EXERCISE-v0.1"


def context_fingerprint(case: dict, nearby: dict) -> str:
    """Identify the bounded checked inputs, excluding retrieval-clock churn.

    Freshness classes remain included: aging across a configured window must
    invalidate an old review even if no new sample has arrived. This is a
    change detector, not a signature or a database-wide ingestion barrier.
    """
    def ordered(items):
        return sorted(items, key=lambda item: json.dumps(item, sort_keys=True))

    inputs = {
        "version": "aegis.exercise.review-inputs.v1",
        "checklist_version": CHECKLIST_VERSION,
        "playbook_version": PLAYBOOK_VERSION,
        "incident": case["incident"],
        "assessment": case["assessment"],
        "evidence": ordered(case["evidence"]),
        "radius_m": nearby["radius_m"],
        "center": nearby.get("center"),
        "sources": ordered(nearby["nearby_sources"]),
        "assets": ordered(nearby["nearby_assets"]),
    }
    canonical = json.dumps(inputs, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()

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
    source_comparison = compare_sources(sources)
    if source_comparison["status"] == "disagreement":
        reasons.append({"code": "comparable_sources_disagree",
                        "description": "Explicitly comparable synthetic observations exceed their configured tolerance; a human must review the cited sources."})
    elif source_comparison["status"] == "not_comparable":
        reasons.append({"code": "no_comparable_source_pair",
                        "description": "No eligible pair of explicitly compatible, curated, current synthetic observations can be compared."})
    if counts["fresh"] and not curated_fresh:
        reasons.append({"code": "no_curated_current_demo_source",
                        "description": "Recent observations exist, but none is a curated exercise fixture."})
    if evidence and not curated_evidence:
        reasons.append({"code": "no_curated_case_evidence",
                        "description": "Only unverified synthetic case evidence is attached."})
    enough_demo_context = bool(curated_fresh and curated_evidence)
    return {
        "context_fingerprint": context_fingerprint(case, nearby),
        "review_brief": {
            "version": "aegis.exercise.review-brief.v1",
            "generated_by": "deterministic_template_no_model",
            "synthetic": True,
            "operational_actions_enabled": False,
            "findings": [
                {
                    "text": f"This exercise case contains {len(evidence)} synthetic evidence records; {curated_evidence} are curated fixtures. Curated does not mean field-verified.",
                    "evidence_ids": sorted(set(evidence_refs)),
                    "source_ids": [],
                },
                {
                    "text": f"Within {radius} m, {len(sources)} synthetic geographic source candidates were checked; {curated_fresh} are curated and current. Explicit source comparison status: {source_comparison['status']}. Agreement is not corroboration.",
                    "evidence_ids": [],
                    "source_ids": sorted(set(source_refs)),
                },
            ],
            "review_options": [
                {"playbook_step": "URB-01", "text": "Review original evidence, quality labels and source timestamps; request missing independent corroboration."},
                {"playbook_step": "URB-03", "text": (
                    "Resolve missing or uncurated context before preparing an exercise recommendation."
                    if not enough_demo_context else
                    "Prepare a human-authored exercise recommendation citing these references and their limitations."
                )},
                {"playbook_step": "URB-04", "text": "Any submitted exercise proposal requires a different authorized checker; this brief cannot approve or execute it."},
            ],
            "limitations": [item["description"] for item in reasons],
            "playbook_version": PLAYBOOK_VERSION,
        },
        "checklist_version": CHECKLIST_VERSION,
        "reference_time": reference.isoformat(),
        "reference_clock": "source_freshness_evaluation_time",
        "unknowns": [
            *( ["No eligible explicitly compatible source pair was available for comparison."]
               if source_comparison["status"] == "not_comparable" else [] ),
            "Real flood likelihood, depth and infrastructure impact are unknown.",
            "Nearby sources are geographic candidates, not independent corroboration.",
        ],
        "next_review_step": (
            "Review missing or uncurated case evidence and current source observations before drafting."
            if not enough_demo_context else
            "Review cited evidence and its limitations; any exercise draft still requires an independent checker."
        ),
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
        "source_comparison": source_comparison,
        "playbook": {
            "version": PLAYBOOK_VERSION,
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
