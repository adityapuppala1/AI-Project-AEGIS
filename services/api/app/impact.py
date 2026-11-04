"""Impact-based trigger evaluation (roadmap A3): hazard state x exposure inside a fixed footprint.

Deterministic code, no model. For each hazard trigger the exposure features (db/migrations/
015_exposure.sql) inside a circular exercise footprint are counted and the versioned rules in
app/fixtures/impact_triggers.v2.json turn (hazard state, counts) into clear/watch/candidate.
The result cites the exposure feature ids it counted and records whether the exposure is
synthetic or real-licensed. It is not a damage, casualty or inundation estimate.

When the exposure layer is empty or unreadable the hazard state is kept unchanged and the trigger
is labelled hazard-only, so the v1 behaviour continues to work without migration 015.
"""
import json
import math
from functools import lru_cache
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "fixtures" / "impact_triggers.v2.json"
RANK = {"clear": 0, "watch": 1, "candidate": 2}
MEASURES = ("people_exposed", "critical_facilities", "road_segments")
MAX_CITED = 50
MAX_FEATURES = 5000
LABELS = {"synthetic": "impact-based (synthetic exposure)", "licensed": "impact-based (licensed exposure)",
          "mixed": "impact-based (mixed synthetic and licensed exposure)", "none": "impact-based (no exposure in footprint)"}
HAZARD_ONLY_LABEL = "hazard-only (exposure layer unavailable)"


@lru_cache(maxsize=1)
def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def summarize(features: list[dict], radius_km: float, config: dict | None = None) -> dict:
    """Counts inside one footprint. Feature dicts need id, kind, count and synthetic."""
    config = config or load_config()
    critical = set(config["critical_kinds"])
    by_kind = {kind: 0 for kind in config["exposure_kinds"]}
    people = facilities = roads = synthetic = licensed = 0
    licences = set()
    for feature in features[:MAX_FEATURES]:
        kind = feature.get("kind")
        if kind not in by_kind:
            continue
        by_kind[kind] += 1
        if kind == "population_cell":
            count = feature.get("count")
            if isinstance(count, (int, float)) and not isinstance(count, bool) and math.isfinite(count) and count > 0:
                people += int(count)
        elif kind in critical:
            facilities += 1
        elif kind == "road_segment":
            roads += 1
        if feature.get("synthetic") is True:
            synthetic += 1
        else:
            licensed += 1
            if isinstance(feature.get("licence"), str):
                licences.add(feature["licence"][:80])
    cited = sorted((f for f in features[:MAX_FEATURES] if f.get("kind") in by_kind), key=lambda f: (f["kind"], str(f["id"])))
    basis = "none" if not synthetic and not licensed else "synthetic" if not licensed else "licensed" if not synthetic else "mixed"
    return {"people_exposed": people, "critical_facilities": facilities, "road_segments": roads, "by_kind": by_kind,
            "feature_count": synthetic + licensed, "exposure_feature_ids": [str(f["id"]) for f in cited][:MAX_CITED],
            "synthetic_count": synthetic, "licensed_count": licensed, "data_basis": basis,
            "licences": sorted(licences)[:5], "footprint_radius_km": radius_km}


def classify(hazard_state: str, counts: dict, spec: dict) -> tuple[str, str | None]:
    """(impact state, the measure that satisfied the rule or None). Thresholds are inclusive (>=)."""
    for level in ("candidate", "watch"):
        rule = spec[level]
        if RANK.get(hazard_state, 0) < RANK[rule["min_hazard_state"]]:
            continue
        for measure, minimum in rule["any_of"].items():
            if measure in MEASURES and counts.get(measure, 0) >= minimum:
                return level, measure
    return "clear", None


def _block(config: dict, hazard_state: str, summary: dict, spec: dict) -> dict:
    state, matched = classify(hazard_state, summary, spec)
    return {"config_version": config["version"], "status": "evaluated", "state": state, "hazard_state": hazard_state,
            "matched_measure": matched, "label": LABELS[summary["data_basis"]],
            "rules": {level: spec[level] for level in ("watch", "candidate")}, **summary}


def apply(triggers: list[dict], store, config: dict | None = None) -> list[dict]:
    """Annotate (and re-state) hazard triggers in place. `store` provides exposure_layer_count()
    and exposure_within(lat, lon, radius_km, limit). Never raises: a failure keeps hazard states."""
    config = config or load_config()
    hazards = config["hazards"]
    try:
        available = store.exposure_layer_count() > 0
        status = "evaluated" if available else "exposure_layer_empty"
    except Exception:
        available, status = False, "exposure_unavailable"
    for trigger in triggers:
        spec = hazards.get(trigger["hazard"])
        rationale = trigger.setdefault("rationale", {})
        if spec is None:
            rationale["impact"] = {"config_version": config["version"], "status": "hazard_not_configured",
                                   "hazard_state": trigger["state"], "label": HAZARD_ONLY_LABEL}
            continue
        if available:
            try:
                features = store.exposure_within(trigger["lat"], trigger["lon"], spec["footprint_radius_km"], MAX_FEATURES)
            except Exception:
                available, status = False, "exposure_unavailable"
        if not available:
            rationale["impact"] = {"config_version": config["version"], "status": status, "hazard_state": trigger["state"],
                                   "label": HAZARD_ONLY_LABEL}
            continue
        block = _block(config, trigger["state"], summarize(features, spec["footprint_radius_km"], config), spec)
        rationale["impact"] = block
        trigger["state"] = block["state"]
    return triggers


def reclassify(hazard_state: str, impact: dict | None) -> str:
    """Re-apply stored exposure counts and rules to a variant's hazard state (used by run simulation)."""
    if not isinstance(impact, dict) or impact.get("status") != "evaluated":
        return hazard_state
    rules = impact.get("rules") or {}
    if "watch" not in rules or "candidate" not in rules:
        return hazard_state
    return classify(hazard_state, impact, rules)[0]


def version_tag(trigger: dict) -> str:
    """Impact part of the scheduler dedupe key: config version plus evaluation status."""
    impact = (trigger.get("rationale") or {}).get("impact")
    if not isinstance(impact, dict):
        return "impact:none"
    return f"{impact.get('config_version')}|{impact.get('status')}"


def cited_features(trigger: dict) -> list[str]:
    impact = (trigger.get("rationale") or {}).get("impact")
    return sorted(impact.get("exposure_feature_ids") or []) if isinstance(impact, dict) else []
