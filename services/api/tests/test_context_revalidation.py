"""Saved context must match the current bounded synthetic review inputs."""
from uuid import uuid4

import pytest

from app import assessment_adapter, workflow_store
from app.governance import DecisionError
from app.intelligence_store import DEMO_AGENCY


def row(fingerprint="sha256:captured"):
    return {"incident_id": "22222222-2222-4222-8222-222222222222",
            "proposal": {"response_draft": {"context_fingerprint": fingerprint}}}


@pytest.mark.parametrize("current", [None, {}, {"context_fingerprint": "sha256:changed"}])
def test_missing_or_changed_context_blocks_review(monkeypatch, current):
    monkeypatch.setattr(assessment_adapter, "exercise_readiness", lambda *_: current)
    with pytest.raises(DecisionError, match="context changed"):
        workflow_store._revalidate_context(row(), DEMO_AGENCY)


def test_legacy_pending_snapshot_needs_new_draft_without_reading_demo(monkeypatch):
    monkeypatch.setattr(assessment_adapter, "exercise_readiness", lambda *_: pytest.fail("Unexpected read"))
    with pytest.raises(DecisionError, match="Create a new draft"):
        workflow_store._revalidate_context(row(None), DEMO_AGENCY)


def test_context_failure_propagates_for_sanitized_route_handling(monkeypatch):
    def unavailable(*_):
        raise assessment_adapter.ContextUnavailable("case_context_unavailable")
    monkeypatch.setattr(assessment_adapter, "exercise_readiness", unavailable)
    with pytest.raises(assessment_adapter.ContextUnavailable):
        workflow_store._revalidate_context(row(), DEMO_AGENCY)


def test_same_context_returns_auditable_fingerprint(monkeypatch):
    monkeypatch.setattr(assessment_adapter, "exercise_readiness",
                        lambda *_: {"context_fingerprint": "sha256:captured"})
    assert workflow_store._revalidate_context(row(), DEMO_AGENCY) == "sha256:captured"


def test_other_agencies_never_read_public_demo_context(monkeypatch):
    monkeypatch.setattr(assessment_adapter, "exercise_readiness", lambda *_: pytest.fail("Cross-agency read"))
    assert workflow_store._revalidate_context(row(), uuid4()) is None
