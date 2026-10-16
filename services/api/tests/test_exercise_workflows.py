from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_exercise_workflow_locked_by_default(monkeypatch):
    monkeypatch.delenv("ENABLE_INSECURE_EXERCISE_WORKFLOW", raising=False)
    assert client.get("/v1/exercise/proposals").status_code == 403
    assert client.post("/v1/exercise/proposals", json={
        "incident_id": "22222222-2222-4222-8222-222222222222",
        "maker_subject": "demo-operator",
        "action_type": "prepare_warning",
        "rationale": "This is an exercise-only recommendation.",
    }).status_code == 403


def test_unrecognized_workflow_operation_rejected():
    from app.exercise_workflows import ChangeProposal
    from pydantic import ValidationError
    import pytest
    with pytest.raises(ValidationError):
        ChangeProposal(actor_subject="demo-operator", operation="execute_live", rationale="No")


def test_public_warning_stays_blocked(monkeypatch):
    monkeypatch.setenv("ENABLE_INSECURE_EXERCISE_WORKFLOW", "true")
    assert client.post("/v1/live/public-warning").status_code == 403
