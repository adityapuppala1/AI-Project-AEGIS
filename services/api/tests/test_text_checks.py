"""NUL characters in stored free text are a 422, not a database 500; other text (Telugu, emoji, newlines) is fine."""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import department_tasks, exercise_workflows, learning, proactive_run
from app.main import app
from app.security import Operator, get_operator

GOOD = ["Flood gates checked వరద నీరు తగ్గింది 🌊", "Line one of the note\nline two of the note\tdone"]
BAD = "Rationale with a hidden \u0000 character"

MODELS = [
    (exercise_workflows.CreateProposal, {"incident_id": str(uuid4()), "action_type": "internal_triage"}),
    (exercise_workflows.ChangeProposal, {"operation": "submit"}),
    (department_tasks.TaskChange, {"operation": "close_task", "task_id": "control_room", "expected_assignment_version": 1}),
    (learning.Review, {"approve": True}),
    (learning.Apply, {}),
    (proactive_run.CancelRun, {}),
]


@pytest.mark.parametrize("model,base", MODELS)
def test_nul_is_rejected_and_ordinary_text_accepted(model, base):
    with pytest.raises(ValidationError):
        model.model_validate({**base, "rationale": BAD})
    for text in GOOD:
        assert model.model_validate({**base, "rationale": text}).rationale == text


def test_proposal_route_answers_422_for_nul():
    app.dependency_overrides[get_operator] = lambda: Operator("op-1", uuid4(), frozenset({"incident_operator"}))
    try:
        response = TestClient(app, raise_server_exceptions=False).post(
            "/v1/exercise/proposals", json={"incident_id": str(uuid4()), "action_type": "internal_triage", "rationale": BAD})
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_operator, None)
