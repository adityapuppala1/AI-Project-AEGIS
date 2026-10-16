"""PolicyStudio manifest is display-only and cannot enable live operations."""
from fastapi.testclient import TestClient

from app.main import app
from app.policy_profile import PROFILE_VERSION, exercise_policy_profile
from app.governance import may_execute_live_action

client = TestClient(app)


def test_policy_is_versioned_fully_synthetic_and_locked():
    policy = exercise_policy_profile()
    assert policy["policy_version"] == PROFILE_VERSION
    assert policy["source"] == "synthetic_exercise"
    assert policy["policy_editor_enabled"] is False
    assert policy["oidc_required_for_proposals"] is True
    assert policy["independent_checker_required"] is True
    assert policy["agency_scoped_proposals"] is True
    assert policy["exercise_fixture_only_proposals"] is True
    assert policy["real_source_integrations_enabled"] is False
    assert policy["live_public_warning_enabled"] is False
    assert policy["live_dispatch_enabled"] is False
    assert policy["executing_suggested_actions_enabled"] is False
    assert may_execute_live_action() is False


def test_manifest_endpoint_read_only():
    response = client.get("/v1/exercise/policy")
    assert response.status_code == 200
    assert response.json()["policy_version"] == PROFILE_VERSION
    assert response.json()["live_dispatch_enabled"] is False
    assert client.post("/v1/exercise/policy", json={}).status_code == 405
    assert client.post("/v1/live/public-warning", json={}).status_code == 403
