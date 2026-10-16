"""Audit360 synthetic export tests: scoped, bounded and never operational."""
import hashlib
import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import audit360, agency_sync_store
from app.intelligence_store import DEMO_AGENCY

CASE = UUID("22222222-2222-4222-8222-222222222222")
client = TestClient(app)


def fixtures():
    case = {
        "source": "synthetic_exercise",
        "operational_actions_enabled": False,
        "incident": {"id": str(CASE), "hazard_type": "SIMULATION: urban flooding"},
        "timeline": [{"id": "a1000000-0000-4000-8000-000000000001", "synthetic": True}],
        "evidence": [{"id": "b2000000-0000-4000-8000-000000000001", "synthetic": True}],
    }
    assessment = {
        "source": "synthetic_exercise",
        "incident_id": str(CASE),
        "operational_actions_enabled": False,
        "real_world_risk_probability": None,
    }
    board = {
        "source": "synthetic_exercise",
        "outbound_messages_sent": False,
        "operational_actions_enabled": False,
        "acknowledgements_are_scripted": True,
        "tasks": [{"id": "f6000000-0000-4000-8000-000000000001", "synthetic": True}],
    }
    events = [{
        "id": "f7000000-0000-4000-8000-000000000001",
        "task_id": "f6000000-0000-4000-8000-000000000001",
        "summary": "SIMULATION: scripted, no real activity",
        "synthetic": True,
    }]
    return case, assessment, board, events


@pytest.fixture()
def sources(monkeypatch):
    data = fixtures()
    monkeypatch.setattr(audit360, "incident_workspace", lambda *_: data[0])
    monkeypatch.setattr(audit360, "exercise_readiness", lambda *_a, **_kw: data[1])
    monkeypatch.setattr(audit360, "agency_task_board", lambda **_kw: data[2])
    monkeypatch.setattr(audit360, "agency_task_events_for_incident", lambda *_: data[3])
    return data


def test_export_has_bounded_provenance_and_no_private_audit(sources):
    bundle = audit360.export_exercise_case(CASE)
    assert bundle is not None
    assert bundle["source"] == "synthetic_exercise"
    assert bundle["bundle_version"] == "aegis.exercise.audit360.v1"
    assert bundle["contains_real_agency_records"] is False
    assert bundle["outbound_messages_sent"] is False
    assert bundle["operational_actions_enabled"] is False
    assert len(bundle["scripted_task_events"]) == 1
    assert bundle["playbook_ref"] == agency_sync_store.PLAYBOOK_VERSION
    assert bundle["ingestion_contract_ref"] == "aegis.exercise.observation.v1"
    assert bundle["offline_synthetic_model_card_ref"] == "aegis.exercise.logistic-baseline.v1"
    assert bundle["incident_forecast_model_attached"] is False
    assert bundle["policy_profile_ref"] == "aegis.exercise.policy.v1"
    assert len(bundle["manifest_sha256"]) == 64
    assert "Unsigned" in bundle["integrity_note"]


def test_manifest_is_sha256_of_unmodified_bundle_fields(sources):
    result = audit360.export_exercise_case(CASE)
    assert result is not None
    payload = {key: value for key, value in result.items()
               if key not in ("manifest_sha256", "integrity_note", "exported_at")}
    text = json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    assert result["manifest_sha256"] == hashlib.sha256(text.encode("utf-8")).hexdigest()


def test_missing_case_returns_none(monkeypatch):
    monkeypatch.setattr(audit360, "incident_workspace", lambda *_: None)
    assert audit360.export_exercise_case(CASE) is None


def test_real_case_cannot_be_exported(sources):
    sources[0]["source"] = "operational_records"
    with pytest.raises(ValueError, match="non-exercise"):
        audit360.export_exercise_case(CASE)


def test_cross_incident_assessment_blocked(sources):
    sources[1]["incident_id"] = "33333333-3333-4333-8333-333333333333"
    with pytest.raises(ValueError, match="Unsafe exercise assessment"):
        audit360.export_exercise_case(CASE)


def test_real_department_message_claim_blocked(sources):
    sources[2]["outbound_messages_sent"] = True
    with pytest.raises(ValueError, match="Unsafe department task"):
        audit360.export_exercise_case(CASE)


def test_non_synthetic_task_blocked(sources):
    sources[2]["tasks"][0]["synthetic"] = False
    with pytest.raises(ValueError, match="Unsafe department task"):
        audit360.export_exercise_case(CASE)


def test_too_many_task_events_blocked(sources):
    sources[3].extend([dict(sources[3][0]) for _ in range(201)])
    with pytest.raises(ValueError, match="Unexpected exercise audit"):
        audit360.export_exercise_case(CASE)


def test_synthetic_audit_route_get_only(sources):
    response = client.get("/v1/exercise/incidents/" + str(CASE) + "/audit")
    assert response.status_code == 200
    assert response.json()["contains_real_agency_records"] is False
    assert client.get("/v1/exercise/incidents/not-a-uuid/audit").status_code == 422
    assert client.post("/v1/exercise/incidents/" + str(CASE) + "/audit", json={}).status_code == 405


class Cursor:
    def __init__(self, executed): self.executed=executed
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, args): self.executed.append((sql,args))
    def fetchall(self): return []

class Connection:
    def __init__(self, executed): self.executed=executed
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.executed)


def test_agency_events_export_is_demo_only_scoped_sql(monkeypatch):
    statements = []
    monkeypatch.setenv("DATABASE_URL", "postgresql://invalid.test/demo")
    monkeypatch.setattr(agency_sync_store.psycopg, "connect",
                        lambda *_a, **_kw: Connection(statements))
    assert agency_sync_store.agency_task_events_for_incident(CASE) == []
    assert len(statements) == 1
    sql, params = statements[0]
    assert "i.agency_id=%s" in sql
    assert "i.is_exercise_fixture IS TRUE" in sql
    assert "t.synthetic IS TRUE AND e.synthetic IS TRUE" in sql
    assert "LIMIT 200" in sql
    assert params == (str(CASE), str(DEMO_AGENCY))
