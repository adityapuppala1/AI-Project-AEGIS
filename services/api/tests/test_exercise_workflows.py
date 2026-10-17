"""Exercise workflow authorization tests; no database or IdP network required."""
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import exercise_workflows
from app.main import app
from app.security import Operator, get_operator

client = TestClient(app)
AGENCY_ID = UUID("11111111-1111-4111-8111-111111111111")
INCIDENT_ID = "22222222-2222-4222-8222-222222222222"
PROPOSAL_ID = "77777777-7777-4777-8777-777777777777"


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def authenticate(role: str, subject: str = "verified-user-1"):
    app.dependency_overrides[get_operator] = lambda: Operator(
        subject=subject, agency_id=AGENCY_ID, roles=frozenset({role}),
    )


def valid_proposal():
    return {
        "incident_id": INCIDENT_ID,
        "action_type": "prepare_warning",
        "rationale": "Exercise-only warning draft for review.",
    }


def test_requires_configured_identity_provider(monkeypatch):
    for key in ("OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL"):
        monkeypatch.delenv(key, raising=False)
    assert client.get("/v1/exercise/proposals").status_code == 503
    assert client.post("/v1/exercise/proposals", json=valid_proposal()).status_code == 503


def test_auth_required_even_with_identity_provider_config(monkeypatch):
    monkeypatch.setenv("OIDC_ISSUER", "https://issuer.example.test")
    monkeypatch.setenv("OIDC_AUDIENCE", "aegis-api")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://issuer.example.test/keys")
    assert client.get("/v1/exercise/proposals").status_code == 401


def test_create_uses_verified_identity_not_request_fields(monkeypatch):
    authenticate("incident_operator")
    received = {}
    def fake_create(incident_id, agency_id, subject, action, rationale):
        received.update(
            incident_id=incident_id, agency_id=agency_id,
            subject=subject, action=action.value, rationale=rationale,
        )
        return PROPOSAL_ID
    monkeypatch.setattr(exercise_workflows, "create_proposal", fake_create)
    response = client.post("/v1/exercise/proposals", json=valid_proposal())
    assert response.status_code == 201
    assert received["subject"] == "verified-user-1"
    assert received["agency_id"] == AGENCY_ID
    assert received["incident_id"] == INCIDENT_ID
    assert response.json()["exercise_only"] is True

    forged = {**valid_proposal(), "maker_subject": "another-user"}
    assert client.post("/v1/exercise/proposals", json=forged).status_code == 422


def test_checker_cannot_create_and_operator_cannot_approve(monkeypatch):
    monkeypatch.setattr(exercise_workflows, "create_proposal", lambda *_: pytest.fail("Unauthorized database write"))
    monkeypatch.setattr(exercise_workflows, "transition", lambda *_: pytest.fail("Unauthorized transition"))
    authenticate("incident_checker")
    assert client.post("/v1/exercise/proposals", json=valid_proposal()).status_code == 403

    authenticate("incident_operator")
    response = client.post(
        f"/v1/exercise/proposals/{PROPOSAL_ID}/transition",
        json={"operation": "approve", "rationale": "Review completed"},
    )
    assert response.status_code == 403


def test_submit_and_review_bind_identity_and_agency(monkeypatch):
    captured = []
    def fake_transition(proposal_id, agency_id, actor, operation, reason):
        captured.append((proposal_id, agency_id, actor, operation, reason))
        return {"submit": "submitted", "approve": "approved"}[operation]
    monkeypatch.setattr(exercise_workflows, "transition", fake_transition)
    authenticate("incident_operator", "maker-1")
    response = client.post(
        f"/v1/exercise/proposals/{PROPOSAL_ID}/transition",
        json={"operation": "submit"},
    )
    assert response.status_code == 200
    assert captured[-1][1:4] == (AGENCY_ID, "maker-1", "submit")

    authenticate("incident_checker", "checker-2")
    response = client.post(
        f"/v1/exercise/proposals/{PROPOSAL_ID}/transition",
        json={"operation": "approve", "rationale": "Independent review complete"},
    )
    assert response.status_code == 200
    assert captured[-1][1:4] == (AGENCY_ID, "checker-2", "approve")
    assert response.json()["exercise_only"] is True


def test_client_supplied_actor_identity_rejected():
    authenticate("incident_checker")
    response = client.post(
        f"/v1/exercise/proposals/{PROPOSAL_ID}/transition",
        json={"operation": "approve", "actor_subject": "fake-checker", "rationale": "No"},
    )
    assert response.status_code == 422


def test_proposal_listing_scoped_to_verified_agency(monkeypatch):
    authenticate("incident_auditor")
    seen = []
    monkeypatch.setattr(exercise_workflows, "list_proposals", lambda agency_id: seen.append(agency_id) or [])
    response = client.get("/v1/exercise/proposals")
    assert response.status_code == 200
    assert response.json() == []
    assert seen == [AGENCY_ID]


def test_live_public_warning_remains_blocked():
    authenticate("incident_checker")
    assert client.post("/v1/live/public-warning").status_code == 403


def test_verified_identity_context():
    authenticate("incident_auditor", "audit-officer-1")
    response = client.get("/v1/exercise/proposals/identity")
    assert response.status_code == 200
    assert response.json() == {
        "subject": "audit-officer-1",
        "agency_id": str(AGENCY_ID),
        "roles": ["incident_auditor"],
        "exercise_only": True,
    }


def test_checker_cannot_run_department_simulation(monkeypatch):
    authenticate("incident_checker")
    monkeypatch.setattr(exercise_workflows, "transition", lambda *_: pytest.fail("Unauthorized simulation"))
    assert client.post(f"/v1/exercise/proposals/{PROPOSAL_ID}/transition",
                       json={"operation": "simulate"}).status_code == 403


def test_private_audit_uses_signed_agency(monkeypatch):
    authenticate("incident_auditor")
    captured = []
    monkeypatch.setattr(exercise_workflows, "proposal_audit",
                        lambda pid, agency: captured.append((pid, agency)) or {"exercise_only": True})
    assert client.get(f"/v1/exercise/proposals/{PROPOSAL_ID}/audit").status_code == 200
    assert captured == [(PROPOSAL_ID, AGENCY_ID)]


def test_cap_export_requires_configuration(monkeypatch):
    for key in ("OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL"):
        monkeypatch.delenv(key, raising=False)
    assert client.get(f"/v1/exercise/proposals/{PROPOSAL_ID}/cap-draft").status_code == 503


def test_cap_export_is_private_scoped_and_download_only(monkeypatch):
    from test_cap_draft import approved_audit
    authenticate("incident_auditor")
    captured = []
    monkeypatch.setattr(exercise_workflows, "proposal_audit",
                        lambda pid, agency: captured.append((pid, agency)) or approved_audit())
    response = client.get(f"/v1/exercise/proposals/{PROPOSAL_ID}/cap-draft")
    assert response.status_code == 200
    assert captured == [(PROPOSAL_ID, AGENCY_ID)]
    assert response.headers["content-type"].startswith("application/xml")
    content = app.openapi()["paths"]["/v1/exercise/proposals/{proposal_id}/cap-draft"]["get"]["responses"]["200"]["content"]
    assert "application/xml" in content and "application/json" not in content
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"].endswith('-draft.xml"')
    assert client.post(f"/v1/exercise/proposals/{PROPOSAL_ID}/cap-draft").status_code == 405


def test_cap_export_cannot_disclose_other_agency_proposals(monkeypatch):
    authenticate("incident_operator")
    def missing(pid, agency):
        assert agency == AGENCY_ID
        raise LookupError("Other agency private detail")
    monkeypatch.setattr(exercise_workflows, "proposal_audit", missing)
    response = client.get(f"/v1/exercise/proposals/{PROPOSAL_ID}/cap-draft")
    assert response.status_code == 404
    assert "Other agency" not in response.text


@pytest.mark.parametrize("operation", ["prepare_tasks", "acknowledge_task", "close_task"])
def test_checker_only_cannot_record_scripted_tasks(monkeypatch, operation):
    authenticate("incident_checker")
    monkeypatch.setattr(exercise_workflows, "transition", lambda *_: pytest.fail("Unauthorized task write"))
    body = {"operation": operation, "rationale": "SIMULATION: task test"}
    if operation != "prepare_tasks": body["task_id"] = "control_room"
    assert client.post(f"/v1/exercise/proposals/{PROPOSAL_ID}/transition", json=body).status_code == 403


def test_task_transition_uses_signed_identity_and_agency(monkeypatch):
    authenticate("incident_operator", "verified-task-operator")
    captured = []
    monkeypatch.setattr(exercise_workflows, "transition", lambda *a, **k: captured.append((a, k)) or "approved")
    assert client.post(f"/v1/exercise/proposals/{PROPOSAL_ID}/transition", json={
        "operation": "acknowledge_task", "task_id": "control_room", "rationale": "SIMULATION: desk reviewed",
    }).status_code == 200
    args, kwargs = captured[0]
    assert args[:4] == (PROPOSAL_ID, AGENCY_ID, "verified-task-operator", "acknowledge_task")
    assert kwargs == {"task_id": "control_room"}


@pytest.mark.parametrize("body", [{"operation": "acknowledge_task"},
    {"operation": "acknowledge_task", "task_id": "unregistered"},
    {"operation": "prepare_tasks", "task_id": "control_room"},
    {"operation": "submit", "task_id": "control_room"},
    {"operation": "close_task", "task_id": "control_room", "actor_subject": "forged"}])
def test_task_payload_shape_is_strict(monkeypatch, body):
    authenticate("incident_operator")
    monkeypatch.setattr(exercise_workflows, "transition", lambda *_: pytest.fail("Unexpected store call"))
    assert client.post(f"/v1/exercise/proposals/{PROPOSAL_ID}/transition", json=body).status_code == 422
