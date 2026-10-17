"""Real PostGIS review invalidation; append only to a new synthetic test case."""
import os
from uuid import uuid4

import psycopg
import pytest

from app import assessment_adapter, workflow_store
from app.governance import Action, DecisionError
from app.intelligence_store import DEMO_AGENCY

pytestmark = pytest.mark.skipif(not os.getenv("AEGIS_TEST_DATABASE_URL"),
                                reason="Opt-in local PostGIS database required")


def test_changed_evidence_blocks_submission_and_approval_atomically(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    case, run = str(uuid4()), str(uuid4())
    maker, checker = "revalidation-maker-" + run, "revalidation-checker-" + run
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("""INSERT INTO incidents(id,agency_id,hazard_type,status,location,is_exercise_fixture)
            SELECT %s,agency_id,'Synthetic revalidation regression',status,location,TRUE
            FROM incidents WHERE id='22222222-2222-4222-8222-222222222222'""", (case,))
    draft = workflow_store.create_proposal(case, DEMO_AGENCY, maker, Action.INTERNAL_TRIAGE,
                                          "SIMULATION: changed review input test")
    submitted = workflow_store.create_proposal(case, DEMO_AGENCY, maker, Action.INTERNAL_TRIAGE,
                                              "SIMULATION: submitted review input test")
    assert workflow_store.transition(submitted, DEMO_AGENCY, maker, "submit") == "submitted"
    before = workflow_store.proposal_audit(submitted, DEMO_AGENCY)
    fingerprint = before["proposal"]["proposal"]["response_draft"]["context_fingerprint"]
    assert before["events"][-1]["details"]["checked_context_fingerprint"] == fingerprint
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("""INSERT INTO exercise_incident_evidence
            (id,incident_id,source_label,source_kind,summary,observed_at,ingested_at,quality_status,synthetic)
            VALUES (%s,%s,'Synthetic regression','exercise_report',
                    'SIMULATION: newly received evidence after draft capture',NOW(),NOW(),'synthetic_curated',TRUE)""",
                     (str(uuid4()), case))
    with pytest.raises(DecisionError, match="context changed"):
        workflow_store.transition(draft, DEMO_AGENCY, maker, "submit")
    with pytest.raises(DecisionError, match="context changed"):
        workflow_store.transition(submitted, DEMO_AGENCY, checker, "approve", "SIMULATION: independent review")
    assert workflow_store.proposal_audit(draft, DEMO_AGENCY)["proposal"]["status"] == "draft"
    assert workflow_store.proposal_audit(submitted, DEMO_AGENCY) == before
    # An outage must also leave the decision and audit unchanged.
    with monkeypatch.context() as scope:
        def unavailable(*_):
            raise assessment_adapter.ContextUnavailable("case_context_unavailable")
        scope.setattr(assessment_adapter, "exercise_readiness", unavailable)
        with pytest.raises(assessment_adapter.ContextUnavailable):
            workflow_store.transition(submitted, DEMO_AGENCY, checker, "approve", "SIMULATION: no context")
        assert workflow_store.proposal_audit(submitted, DEMO_AGENCY) == before
        assert workflow_store.transition(submitted, DEMO_AGENCY, checker, "reject",
                                         "SIMULATION: evidence changed; request a new draft") == "rejected"
    fresh = workflow_store.create_proposal(case, DEMO_AGENCY, maker, Action.INTERNAL_TRIAGE,
                                          "SIMULATION: refreshed evidence reviewed")
    assert workflow_store.transition(fresh, DEMO_AGENCY, maker, "submit") == "submitted"
    assert workflow_store.transition(fresh, DEMO_AGENCY, checker, "approve",
                                    "SIMULATION: independent refreshed review") == "approved"
    audit = workflow_store.proposal_audit(fresh, DEMO_AGENCY)
    assert len(audit["decisions"]) == 1
    assert audit["events"][-1]["details"]["checked_context_fingerprint"] != fingerprint
