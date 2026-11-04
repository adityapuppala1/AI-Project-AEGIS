"""CAP 1.2 exercise file for a proactive run; status is hard-coded to Exercise, no transport exists."""
from datetime import datetime, timezone
from uuid import UUID
import xml.etree.ElementTree as ET

CAP_NS = "urn:oasis:names:tc:emergency:cap:1.2"
STATUS = "Exercise"
DISCLAIMER = ("EXERCISE ONLY — synthetic rehearsal thresholds, not calibrated; never transmit or use for "
              "emergency operations. Needs accountable human review.")
_CATEGORY = {"flood": "Met", "heavy_rain": "Met", "river_discharge": "Met", "wind": "Met", "heat": "Met",
             "fire": "Fire", "landslide": "Geo", "flood_gauge": "Met"}
_SEVERITY = {0: "Minor", 1: "Moderate", 2: "Severe", 3: "Extreme"}


class CapRefused(ValueError):
    pass


_BASIS = {"synthetic": "synthetic", "licensed": "licensed", "mixed": "mixed synthetic and licensed", "none": "no"}
_HAZARD_ONLY = {"area": "Exercise grid point; no validated hazard footprint", "instruction": "", "params": [], "radius": "5"}


def _count(value) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value < 10**12:
        raise CapRefused("Invalid exposure count")
    return int(value)


def _exposure_text(block) -> dict:
    """Fixed templates only: counts are integers, the basis comes from a closed set and feature ids
    must be UUIDs. Hazard-only triggers keep the original wording."""
    if not isinstance(block, dict) or block.get("status") != "evaluated":
        return _HAZARD_ONLY
    basis = _BASIS.get(block.get("data_basis"))
    radius = block.get("footprint_radius_km")
    if basis is None or isinstance(radius, bool) or not isinstance(radius, (int, float)) or not 0 < radius <= 100:
        raise CapRefused("Invalid impact block")
    people, facilities, roads = (_count(block.get(k)) for k in ("people_exposed", "critical_facilities", "road_segments"))
    try:
        features = sorted({str(UUID(value)) for value in block.get("exposure_feature_ids") or []})
    except (TypeError, ValueError, AttributeError) as exc:
        raise CapRefused("Invalid exposure references") from exc
    radius_text = f"{radius:g}"
    return {"area": (f"Exercise footprint {radius_text} km around grid point; {basis} exposure inside: {people} people, "
                     f"{facilities} critical facilities, {roads} road segments. No validated hazard footprint"),
            "instruction": (f" Impact-based exercise trigger ({basis} exposure): exposure counts are rehearsal inputs, "
                            "not a damage, casualty or inundation estimate."),
            "params": [("aegis.impact_config_version", str(block.get("config_version"))[:60]),
                       ("aegis.impact_state", str(block.get("state"))[:20]),
                       ("aegis.exposure_basis", str(block.get("data_basis"))),
                       ("aegis.people_exposed", str(people)), ("aegis.critical_facilities", str(facilities)),
                       *(("aegis.exposure_feature_id", value) for value in features[:50])],
            "radius": radius_text}


def exercise_cap_xml(run: dict, trigger: dict, status: str = STATUS) -> bytes:
    if status != STATUS:
        raise CapRefused("Only status Exercise can be exported")
    if run.get("operational_actions_enabled") is not False or run.get("needs_accountable_human_review") is not True:
        raise CapRefused("Run is not an exercise-only run")
    try:
        run_id = str(UUID(run["id"]))
        evidence = sorted({str(UUID(value)) for value in run.get("evidence_ids") or []})
        trigger_event = str(UUID(trigger["id"]))
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise CapRefused("Invalid run references") from exc
    if len(evidence) > 500:
        raise CapRefused("Unbounded citations")
    judgment = run.get("judgment") or {}
    exposure = _exposure_text((trigger.get("rationale") or {}).get("impact"))
    band =(judgment.get("severity_band") or {}).get("score")
    hazard = str(trigger.get("hazard", "unknown"))
    root = ET.Element("alert", {"xmlns": CAP_NS})

    def add(parent, name, value):
        ET.SubElement(parent, name).text = str(value)
    add(root, "identifier", "aegis-proactive-exercise-" + run_id)
    add(root, "sender", "proactive-exercise@aegis.invalid")
    add(root, "sent", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S-00:00"))
    add(root, "status", STATUS)
    add(root, "msgType", "Alert")
    add(root, "scope", "Private")
    add(root, "addresses", "local-review-only@aegis.invalid")
    add(root, "code", "AEGIS-EXERCISE-NOT-FOR-TRANSMISSION")
    add(root, "note", DISCLAIMER)
    info = ET.SubElement(root, "info")
    for name, value in (("language", "en-IN"), ("category", _CATEGORY.get(hazard, "Other")),
                        ("event", "EXERCISE: " + hazard.replace("_", " ") + " trigger " + str(trigger.get("state"))),
                        ("responseType", "Monitor"), ("urgency", "Unknown"),
                        ("severity", _SEVERITY.get(band, "Unknown") if isinstance(band, int) else "Unknown"),
                        ("certainty", "Unknown"), ("senderName", "AEGIS proactive exercise desk"),
                        ("headline", "EXERCISE — no public warning"),
                        ("description", DISCLAIMER + "\nDecision band: " + str(judgment.get("decision_band", "unknown"))
                         + "\nPlaybook option: " + str((judgment.get("playbook_option") or {}).get("choice", "unknown"))),
                        ("instruction", "Review cited evidence locally. Do not forward, transmit, warn the public or dispatch."
                         + exposure["instruction"])):
        add(info, name, value)
    params = [("aegis.run_id", run_id), ("aegis.trigger_event_id", trigger_event),
              ("aegis.trigger_id", str(trigger.get("trigger_id"))), ("aegis.operational_actions_enabled", "false"),
              *exposure["params"], *(("aegis.evidence_id", value) for value in evidence)]
    for name, value in params:
        parameter = ET.SubElement(info, "parameter")
        add(parameter, "valueName", name)
        add(parameter, "value", value)
    area = ET.SubElement(info, "area")
    add(area, "areaDesc", exposure["area"])
    if isinstance(trigger.get("lat"), (int, float)) and isinstance(trigger.get("lon"), (int, float)):
        add(area, "circle", f"{trigger['lat']:.4f},{trigger['lon']:.4f} {exposure['radius']}")
    for node in root.iter():
        if node.text and any(ord(c) < 32 and c not in "\t\n\r" for c in node.text):
            raise CapRefused("Text contains characters invalid in XML")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def self_check(writer) -> bool:
    """The exporter must produce Exercise and refuse Actual."""
    sample_id = "00000000-0000-4000-8000-000000000001"
    run = {"id": sample_id, "evidence_ids": [sample_id], "operational_actions_enabled": False,
           "needs_accountable_human_review": True}
    trigger = {"id": sample_id, "hazard": "heavy_rain", "state": "watch", "trigger_id": "self_check"}
    xml = writer(run, trigger)
    if ET.fromstring(xml).findtext(f"{{{CAP_NS}}}status") != STATUS:
        return False
    try:
        writer(run, trigger, status="Actual")
    except CapRefused:
        return True
    return False
