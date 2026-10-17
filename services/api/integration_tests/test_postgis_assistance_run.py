"""Real-row-lock checks for durable bounded assistance; append-only fixtures."""
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import psycopg
import pytest

from app import workflow_store
from app.governance import Action, DecisionError
from app.intelligence_store import DEMO_AGENCY

pytestmark = pytest.mark.skipif(not os.getenv("AEGIS_TEST_DATABASE_URL"), reason="Opt-in local PostGIS required")


def create_case_and_draft(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    case = str(uuid4())
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("""INSERT INTO incidents(id,agency_id,hazard_type,status,location,is_exercise_fixture)
          SELECT %s,agency_id,'Synthetic bounded assistance regression',status,location,TRUE
          FROM incidents WHERE id='22222222-2222-4222-8222-222222222222'""", (case,))
        conn.execute("""INSERT INTO exercise_incident_evidence
          (id,incident_id,source_label,source_kind,summary,observed_at,ingested_at,quality_status,synthetic)
          VALUES (%s,%s,'Synthetic assistance regression','exercise_report','SIMULATION: bounded run evidence',
                  NOW(),NOW(),'synthetic_curated',TRUE)""", (str(uuid4()), case))
    maker = "assistance-maker-" + str(uuid4())
    draft = workflow_store.create_proposal(case, DEMO_AGENCY, maker, Action.INTERNAL_TRIAGE,
                                           "SIMULATION: bounded assistance review")
    return case, draft, maker


def test_run_persists_resumes_retries_and_stops_before_submission(monkeypatch):
    _case, draft, maker = create_case_and_draft(monkeypatch)
    assert workflow_store.transition(draft, DEMO_AGENCY, maker, "start_assistance") == "draft"
    assert workflow_store.transition(draft, DEMO_AGENCY, maker, "start_assistance") == "draft"
    # Concurrent retry of the same expected step produces one durable step.
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: workflow_store.transition(
            draft, DEMO_AGENCY, maker, "advance_assistance", assistance_step="gather_references"), range(2)))
    assert results == ["draft", "draft"]
    workflow_store.transition(draft, DEMO_AGENCY, maker, "advance_assistance", assistance_step="check_quality")
    workflow_store.transition(draft, DEMO_AGENCY, maker, "advance_assistance", assistance_step="validate_draft")
    audit = workflow_store.proposal_audit(draft, DEMO_AGENCY)
    run = audit["proposal"]["proposal"]["assistance_run"]
    assert run["status"] == "review_ready"
    assert [item["step"] for item in run["completed_steps"]] == [
        "gather_references", "check_quality", "validate_draft"]
    assert audit["proposal"]["status"] == "draft"
    assert not audit["decisions"]
    events = [event for event in audit["events"] if "assistance" in event["action"]]
    assert [event["action"] for event in events] == ["start_assistance", "advance_assistance",
                                                      "advance_assistance", "advance_assistance"]
    assert all(event["details"]["operational_actions_enabled"] is False for event in events)


def test_cancel_and_context_change_fail_closed(monkeypatch):
    case, draft, maker = create_case_and_draft(monkeypatch)
    workflow_store.transition(draft, DEMO_AGENCY, maker, "start_assistance")
    workflow_store.transition(draft, DEMO_AGENCY, maker, "cancel_assistance",
                              "SIMULATION: operator stopped bounded assistance")
    with pytest.raises(DecisionError, match="cannot be resumed"):
        workflow_store.transition(draft, DEMO_AGENCY, maker, "advance_assistance",
                                  assistance_step="gather_references")
    fresh = workflow_store.create_proposal(case, DEMO_AGENCY, maker, Action.INTERNAL_TRIAGE,
                                           "SIMULATION: evidence change bounded run")
    workflow_store.transition(fresh, DEMO_AGENCY, maker, "start_assistance")
    before = workflow_store.proposal_audit(fresh, DEMO_AGENCY)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("""INSERT INTO exercise_incident_evidence
          (id,incident_id,source_label,source_kind,summary,observed_at,ingested_at,quality_status,synthetic)
          VALUES (%s,%s,'Synthetic assistance regression','exercise_report','SIMULATION: changed after start',
                  NOW(),NOW(),'synthetic_curated',TRUE)""", (str(uuid4()), case))
    with pytest.raises(DecisionError, match="context changed"):
        workflow_store.transition(fresh, DEMO_AGENCY, maker, "advance_assistance",
                                  assistance_step="gather_references")
    assert workflow_store.proposal_audit(fresh, DEMO_AGENCY) == before
    assert workflow_store.transition(fresh, DEMO_AGENCY, maker, "cancel_assistance",
                                     "SIMULATION: context changed; stop run") == "draft"
    assert workflow_store.proposal_audit(fresh, DEMO_AGENCY)["proposal"]["proposal"]["assistance_run"]["status"] == "cancelled"


def test_nonmaker_cannot_operate_run(monkeypatch):
    _case, draft, maker = create_case_and_draft(monkeypatch)
    with pytest.raises(DecisionError, match="maker"):
        workflow_store.transition(draft, DEMO_AGENCY, maker + "-other", "start_assistance")
