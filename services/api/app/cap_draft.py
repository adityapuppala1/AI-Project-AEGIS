"""Private CAP 1.2 exercise XML artifacts; deliberately no delivery transport."""
from datetime import datetime, timezone
from uuid import UUID
import xml.etree.ElementTree as ET

from app.governance import DecisionError
from app.proposal_simulation import PLAYBOOK

CAP_NS = "urn:oasis:names:tc:emergency:cap:1.2"
DISCLAIMER = "EXERCISE DRAFT ONLY — fictional data; never transmit or use for emergency operations."


def cap_draft_xml(audit: dict) -> bytes:
    proposal = audit.get("proposal", {})
    payload = proposal.get("proposal", {})
    draft = payload.get("response_draft") or {}
    decisions = audit.get("decisions", [])
    if (audit.get("exercise_only") is not True or
            audit.get("operational_actions_enabled") is not False or
            payload.get("exercise_only") is not True or
            proposal.get("status") != "approved" or
            proposal.get("action_type") != "prepare_warning"):
        raise DecisionError("An approved exercise warning-preparation proposal is required")
    if (len(decisions) != 1 or decisions[0].get("decision") != "approved" or
            not decisions[0].get("checker_subject") or
            decisions[0]["checker_subject"] == proposal.get("maker_subject") or
            not str(decisions[0].get("rationale", "")).strip()):
        raise DecisionError("An independent recorded checker approval is required")
    if (draft.get("operational_actions_enabled") is not False or
            draft.get("source") != "synthetic_exercise" or
            draft.get("incident_id") != proposal.get("incident_id") or
            draft.get("playbook", {}).get("version") != PLAYBOOK or
            draft.get("real_world_risk_probability", "missing") is not None):
        raise DecisionError("Recreate a cited synthetic response draft before XML export")
    try:
        proposal_id = str(UUID(proposal["id"]))
        incident_id = str(UUID(proposal["incident_id"]))
        approved_at = datetime.fromisoformat(decisions[0]["decided_at"].replace("Z", "+00:00"))
        if approved_at.utcoffset() is None:
            raise ValueError("Missing timestamp zone")
        sent = approved_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S-00:00")
        evidence = [str(UUID(value)) for value in draft["playbook"]["synthetic_evidence_ids"]]
        sources = [str(UUID(value)) for value in draft["playbook"]["synthetic_source_ids"]]
        if not evidence or len(evidence) > 50 or len(sources) > 20:
            raise ValueError("Unbounded citations")
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise DecisionError("Invalid captured exercise references or approval timestamp") from exc
    root = ET.Element("alert", {"xmlns": CAP_NS})
    def add(parent, name, value):
        ET.SubElement(parent, name).text = str(value)
    add(root, "identifier", "aegis-exercise-draft-" + proposal_id)
    add(root, "sender", "draft-review@aegis.invalid")
    add(root, "sent", sent)
    add(root, "status", "Draft")
    add(root, "msgType", "Alert")
    add(root, "scope", "Private")
    add(root, "addresses", "local-review-only@aegis.invalid")
    add(root, "code", "AEGIS-DRAFT-NOT-FOR-TRANSMISSION")
    add(root, "code", "AEGIS-SYNTHETIC-EXERCISE")
    add(root, "note", DISCLAIMER)
    info = ET.SubElement(root, "info")
    for name, value in (("language", "en-IN"), ("category", "Met"),
                        ("event", "SIMULATION: fictional urban waterlogging"),
                        ("responseType", "Monitor"), ("urgency", "Unknown"),
                        ("severity", "Unknown"), ("certainty", "Unknown"),
                        ("senderName", "Fictional AEGIS exercise desk"),
                        ("headline", "EXERCISE DRAFT — no public warning"),
                        ("description", DISCLAIMER + "\nCaptured exercise rationale: " + str(payload.get("rationale", "")) + "\nLimitations: " + " ".join(str(item.get("description", "")) for item in draft.get("reasons", []))),
                        ("instruction", "Review captured evidence and uncertainty locally. Do not forward, transmit, warn the public or dispatch responders.")):
        add(info, name, value)
    for name, value in [("aegis.incident_id", incident_id), ("aegis.playbook", PLAYBOOK),
                        ("aegis.context_state", draft.get("context_state", "unknown")),
                        ("aegis.operational_actions_enabled", "false")]:
        parameter = ET.SubElement(info, "parameter")
        add(parameter, "valueName", name)
        add(parameter, "value", value)
    for kind, values in (("evidence_id", evidence), ("source_id", sources)):
        for value in sorted(set(values)):
            parameter = ET.SubElement(info, "parameter")
            add(parameter, "valueName", "aegis.synthetic_" + kind)
            add(parameter, "value", value)
    area = ET.SubElement(info, "area")
    add(area, "areaDesc", "Fictional Hyderabad exercise case " + incident_id + "; no validated hazard footprint")
    # ElementTree escapes free text. XML 1.0 excludes most control characters.
    for node in root.iter():
        if node.text and any(ord(c) < 32 and c not in "\t\n\r" or 0xD800 <= ord(c) <= 0xDFFF or ord(c) in {0xFFFE, 0xFFFF} for c in node.text):
            raise DecisionError("Captured text contains characters invalid in XML")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)
