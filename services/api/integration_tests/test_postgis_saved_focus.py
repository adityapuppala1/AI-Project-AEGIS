"""Append-only verification of persisted selection, attribution and atomic refusal."""
import os
from uuid import uuid4

import psycopg
import pytest

from app import workflow_store, local_copilot
from app.governance import Action, DecisionError
from app.intelligence_store import DEMO_AGENCY

pytestmark = pytest.mark.skipif(not os.getenv("AEGIS_TEST_DATABASE_URL"), reason="Opt-in local PostGIS required")


def new_case():
    case = str(uuid4())
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("""INSERT INTO incidents(id,agency_id,hazard_type,status,location,is_exercise_fixture)
          SELECT %s,agency_id,'Synthetic saved focus regression',status,location,TRUE
          FROM incidents WHERE id='22222222-2222-4222-8222-222222222222'""", (case,))
        conn.execute("""INSERT INTO exercise_incident_evidence
          (id,incident_id,source_label,source_kind,summary,observed_at,ingested_at,quality_status,synthetic)
          VALUES (%s,%s,'Synthetic focus regression','exercise_report','SIMULATION: saved focus evidence',
                  NOW(),NOW(),'synthetic_curated',TRUE)""", (str(uuid4()), case))
    return case


@pytest.mark.parametrize("enabled", [False, True])
def test_saved_selection_and_fallback_survive_independent_review(monkeypatch, enabled):
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_ENABLED", "1" if enabled else "0")
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_MODEL", "tinyllama:1.1b")
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_TARGET", "loopback")
    # A deterministic selector tests persistence; this is not real model inference.
    monkeypatch.setattr(local_copilot, "generate_selection", lambda *_: local_copilot.Selection(finding_index=1, playbook_step="URB-03"))
    case = new_case()
    proposal = workflow_store.create_proposal(case, DEMO_AGENCY, "focus-maker", Action.INTERNAL_TRIAGE,
                                             "SIMULATION: review selected references", include_review_focus=True)
    audit = workflow_store.proposal_audit(proposal, DEMO_AGENCY)
    payload = audit["proposal"]["proposal"]
    focus, context = payload["review_focus"], payload["response_draft"]
    assert focus["context_fingerprint"] == context["context_fingerprint"]
    assert focus["status"] == ("model_assisted_selection" if enabled else "template_fallback")
    assert focus["finding"] == context["review_brief"]["findings"][1 if enabled else 0]
    assert focus["review_option"] in context["review_brief"]["review_options"]
    assert audit["events"][0]["actor_subject"] == "focus-maker"
    assert audit["events"][0]["details"]["review_focus"]["selection"] == focus["selection"]
    assert workflow_store.transition(proposal, DEMO_AGENCY, "focus-maker", "submit") == "submitted"
    with pytest.raises(DecisionError):
        workflow_store.transition(proposal, DEMO_AGENCY, "focus-maker", "approve", "SIMULATION: self review prohibited")
    assert workflow_store.transition(proposal, DEMO_AGENCY, "focus-checker", "approve", "SIMULATION: separate reference review") == "approved"
    assert workflow_store.proposal_audit(proposal, DEMO_AGENCY)["proposal"]["proposal"] == payload


def test_changed_inputs_during_selection_roll_back_draft_and_audit(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    case = new_case()
    original = local_copilot.review_focus
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_ENABLED", "0")
    def changed(context):
        focus = original(context)
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            conn.execute("""INSERT INTO exercise_incident_evidence
              (id,incident_id,source_label,source_kind,summary,observed_at,ingested_at,quality_status,synthetic)
              VALUES (%s,%s,'Synthetic focus regression','exercise_report','SIMULATION: changed during selection',
                      NOW(),NOW(),'synthetic_curated',TRUE)""", (str(uuid4()), case))
        return focus
    monkeypatch.setattr(local_copilot, "review_focus", changed)
    actor = "focus-rollback-" + str(uuid4())
    with pytest.raises(DecisionError, match="context changed"):
        workflow_store.create_proposal(case, DEMO_AGENCY, actor, Action.INTERNAL_TRIAGE,
                                       "SIMULATION: refuse changed inputs", include_review_focus=True)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        assert conn.execute("SELECT count(*) FROM action_proposals WHERE incident_id=%s", (case,)).fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM audit_events WHERE actor_subject=%s", (actor,)).fetchone()[0] == 0
    with pytest.raises(LookupError):
        workflow_store.create_proposal(case, uuid4(), actor, Action.INTERNAL_TRIAGE,
                                       "SIMULATION: wrong agency", include_review_focus=True)
