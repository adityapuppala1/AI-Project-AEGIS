from uuid import UUID
from fastapi.testclient import TestClient
from app import intelligence_store
from app.main import app

client = TestClient(app)
INCIDENT_ID = "22222222-2222-4222-8222-222222222222"


def example():
    return {
        "incident": {
            "id": INCIDENT_ID, "hazard_type": "Urban waterlogging",
            "status": "review", "lat": 17.4065, "lon": 78.4483,
            "created_at": "2026-10-16T10:00:00+00:00",
        },
        "timeline": [{
            "id": "a1000000-0000-4000-8000-000000000001",
            "event_type": "observation",
            "occurred_at": "2026-10-16T10:00:00+00:00",
            "recorded_at": "2026-10-16T10:01:00+00:00",
            "summary": "SIMULATION: test observation",
            "actor_label": "Exercise feed", "synthetic": True,
        }],
        "evidence": [{
            "id": "b2000000-0000-4000-8000-000000000001",
            "source_label": "Synthetic gauge",
            "source_kind": "exercise_sensor",
            "summary": "SIMULATION: no real observation",
            "observed_at": "2026-10-16T10:00:00+00:00",
            "ingested_at": "2026-10-16T10:05:00+00:00",
            "quality_status": "synthetic_curated",
            "ingest_lag_seconds": 300, "synthetic": True,
        }],
        "source": "synthetic_exercise",
        "operational_actions_enabled": False,
        "assessment": {"status": "not_assessed", "model_version": None,
                       "calibrated_probability": None, "prediction_horizon": None,
                       "message": "No trained model"},
        "generated_at": "2026-10-16T12:00:00+00:00",
    }


def test_detail_returns_labeled_exercise_only(monkeypatch):
    observed = []
    def fake_workspace(incident_id):
        observed.append(incident_id)
        return example()
    monkeypatch.setattr(intelligence_store, "incident_workspace", fake_workspace)
    result = client.get("/v1/exercise/incidents/" + INCIDENT_ID)
    assert result.status_code == 200
    assert observed == [UUID(INCIDENT_ID)]
    assert result.json()["source"] == "synthetic_exercise"
    assert result.json()["operational_actions_enabled"] is False
    assert result.json()["assessment"]["calibrated_probability"] is None
    assert result.json()["evidence"][0]["synthetic"] is True


def test_bad_incident_id_does_not_reach_database(monkeypatch):
    monkeypatch.setattr(intelligence_store, "incident_workspace",
                        lambda *_: (_ for _ in ()).throw(AssertionError("Should not query")))
    assert client.get("/v1/exercise/incidents/not-a-uuid").status_code == 422


def test_unlisted_incident_returns_404(monkeypatch):
    monkeypatch.setattr(intelligence_store, "incident_workspace", lambda *_: None)
    result = client.get("/v1/exercise/incidents/" + INCIDENT_ID)
    assert result.status_code == 404


def test_detail_route_does_not_capture_query_route():
    # Query route remains accessible before /{incident_id} dispatch.
    response = client.get("/v1/exercise/incidents/query?page_size=0")
    assert response.status_code == 422
