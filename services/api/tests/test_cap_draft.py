"""Exercise artifact guardrails; these do not establish real IdP acceptance."""
from copy import deepcopy
import xml.etree.ElementTree as ET

import pytest

from app.cap_draft import cap_draft_xml, CAP_NS
from app.governance import DecisionError
from app.proposal_simulation import PLAYBOOK

PID = "77777777-7777-4777-8777-777777777777"
CASE = "22222222-2222-4222-8222-222222222222"
EVIDENCE = "33333333-3333-4333-8333-333333333333"


def approved_audit():
    return {"exercise_only": True, "operational_actions_enabled": False,
            "proposal": {"id": PID, "incident_id": CASE, "maker_subject": "maker",
                         "action_type": "prepare_warning", "status": "approved",
                         "proposal": {"exercise_only": True, "rationale": "Synthetic <rain> & water exercise",
                                      "response_draft": {"incident_id": CASE,
                                          "source": "synthetic_exercise", "operational_actions_enabled": False,
                                          "real_world_risk_probability": None,
                                          "context_state": "insufficient_simulated_context",
                                          "reasons": [{"description": "No validated flood model"}],
                                          "playbook": {"version": PLAYBOOK,
                                                       "synthetic_evidence_ids": [EVIDENCE],
                                                       "synthetic_source_ids": []}}}},
            "decisions": [{"checker_subject": "checker", "decision": "approved",
                           "rationale": "Exercise-only independent review",
                           "decided_at": "2026-10-17T10:00:00+00:00"}]}


def test_xml_is_repeatable_escaped_private_and_never_claims_severity():
    audit = approved_audit()
    original = deepcopy(audit)
    xml = cap_draft_xml(audit)
    assert cap_draft_xml(audit) == xml
    assert audit == original
    root = ET.fromstring(xml)
    ns = {"c": CAP_NS}
    assert root.tag == "{" + CAP_NS + "}alert"
    assert root.findtext("c:status", namespaces=ns) == "Draft"
    assert root.findtext("c:scope", namespaces=ns) == "Private"
    assert root.findtext("c:addresses", namespaces=ns).endswith("@indtrana.invalid")
    info = root.find("c:info", ns)
    for key in ("urgency", "severity", "certainty"):
        assert info.findtext("c:" + key, namespaces=ns) == "Unknown"
    assert "<rain> & water" in info.findtext("c:description", namespaces=ns)
    assert b"&lt;rain&gt; &amp; water" in xml
    assert "No validated flood model" in info.findtext("c:description", namespaces=ns)
    assert info.find("c:area/c:polygon", ns) is None
    assert info.find("c:area/c:circle", ns) is None
    assert EVIDENCE in xml.decode()
    assert "insufficient_simulated_context" in xml.decode()


@pytest.mark.parametrize("status", ["draft", "submitted", "rejected"])
def test_unapproved_proposals_never_export(status):
    audit = approved_audit()
    audit["proposal"]["status"] = status
    with pytest.raises(DecisionError):
        cap_draft_xml(audit)


@pytest.mark.parametrize("case", ["wrong_action", "no_decision", "self_review", "rejected",
                                  "duplicate_decision", "no_reason", "live", "wrong_case",
                                  "legacy", "missing_evidence", "bad_timestamp", "invalid_xml"])
def test_invalid_or_unsafe_captured_state_fails_closed(case):
    audit = approved_audit()
    proposal, decision = audit["proposal"], audit["decisions"][0]
    draft = proposal["proposal"]["response_draft"]
    if case == "wrong_action": proposal["action_type"] = "internal_triage"
    elif case == "no_decision": audit["decisions"] = []
    elif case == "self_review": decision["checker_subject"] = "maker"
    elif case == "rejected": decision["decision"] = "rejected"
    elif case == "duplicate_decision": audit["decisions"].append(dict(decision))
    elif case == "no_reason": decision["rationale"] = " "
    elif case == "live": draft["operational_actions_enabled"] = True
    elif case == "wrong_case": draft["incident_id"] = EVIDENCE
    elif case == "legacy": proposal["proposal"]["response_draft"] = None
    elif case == "missing_evidence": draft["playbook"]["synthetic_evidence_ids"] = []
    elif case == "bad_timestamp": decision["decided_at"] = "2026-10-17T10:00:00"
    elif case == "invalid_xml": proposal["proposal"]["rationale"] = "Exercise\x00text"
    with pytest.raises(DecisionError):
        cap_draft_xml(audit)
