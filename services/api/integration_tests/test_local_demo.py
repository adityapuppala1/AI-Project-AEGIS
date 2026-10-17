"""Opt-in real PostGIS checks; appends labeled synthetic rows, never resets data.

AEGIS_TEST_DATABASE_URL must name a disposable local exercise database.
JWTs are signed by ephemeral TEST keys; this is NOT real IdP/human acceptance.
"""
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import security
from app.doctor import inspect_stack
from app.main import app
from app.migration_audit import inspect_security_schema
from app.intelligence_store import DEMO_AGENCY
from app.scenario_runner import replay_tabletop
from app.replay import load_bundled_fixture
from app.ingestion_store import replay_records

pytestmark = pytest.mark.skipif(not os.getenv("AEGIS_TEST_DATABASE_URL"), reason="Opt-in local PostGIS database required")
CASE = "22222222-2222-4222-8222-222222222222"


def test_postgis_demo_chain_and_negative_authorization(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    assert inspect_stack()["status"] == "ready"  # Exercises real psycopg placeholders.
    assert inspect_security_schema()["status"] == "ready"
    records = load_bundled_fixture()
    replay_records(records)
    first_counts = inspect_stack()["fixture_counts"]
    replay_records(records)
    assert inspect_stack()["fixture_counts"] == first_counts
    run = uuid4()
    assert replay_tabletop(run)["accepted_samples"] == 3
    assert replay_tabletop(run)["duplicate_samples"] == 3

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setenv("OIDC_ISSUER", "https://test-issuer.example.test")
    monkeypatch.setenv("OIDC_AUDIENCE", "aegis-test")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://test-issuer.example.test/keys")
    class TestKeys:
        def get_signing_key_from_jwt(self, token):
            return SimpleNamespace(key=private_key.public_key())
    monkeypatch.setattr(security, "_jwk_client", lambda _: TestKeys())
    def headers(subject, agency=DEMO_AGENCY, roles=None):
        now = datetime.now(timezone.utc)
        token = jwt.encode({"sub": subject, "iss": "https://test-issuer.example.test", "aud": "aegis-test",
                            "iat": now, "exp": now + timedelta(minutes=5),
                            "aegis_agency_id": str(agency),
                            "aegis_roles": roles or ["incident_operator", "incident_checker"]}, private_key, algorithm="RS256")
        return {"Authorization": "Bearer " + token}
    maker = headers("integration-maker-" + str(run))
    checker = headers("integration-checker-" + str(run))
    other = headers("integration-other", uuid4())
    with TestClient(app) as client:
        assert client.get("/v1/exercise/proposals").status_code == 401
        ready = client.get(f"/v1/exercise/incidents/{CASE}/readiness").json()
        assert ready["context_state"] == "simulated_context_for_human_review"
        response = client.post("/v1/exercise/proposals", headers=maker, json={
            "incident_id": CASE, "action_type": "internal_triage",
            "rationale": "SIMULATION: integration test evidence review; no real operations",
        })
        assert response.status_code == 201, response.text
        pid = response.json()["id"]
        path = f"/v1/exercise/proposals/{pid}"
        def change(actor, operation):
            return client.post(path + "/transition", headers=actor, json={"operation": operation, "rationale": "SIMULATION: independent test review"})
        assert change(maker, "simulate").status_code == 409
        assert change(maker, "submit").status_code == 200
        assert change(maker, "approve").status_code == 409
        assert change(other, "approve").status_code == 404
        assert change(checker, "approve").status_code == 200
        assert change(checker, "approve").status_code == 409
        assert change(maker, "simulate").status_code == 200
        assert change(maker, "simulate").status_code == 200
        assert client.get(path + "/audit", headers=other).status_code == 404
        assert client.get(path + "/audit").status_code == 401
        audit = client.get(path + "/audit", headers=checker).json()
        assert len(audit["decisions"]) == 1
        assert audit["decisions"][0]["checker_subject"] != audit["proposal"]["maker_subject"]
        payload = audit["proposal"]["proposal"]
        assert payload["response_draft"]["playbook"]["synthetic_evidence_ids"]
        assert len(payload["simulation"]["tasks"]) == 3
        assert payload["simulation"]["outbound_messages_sent"] is False
        assert [e["action"] for e in audit["events"]].count("simulated_department_tasks") == 1
        assert client.post("/v1/live/public-warning", headers=checker).status_code == 403
