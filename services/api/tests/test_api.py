from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    assert client.get('/health').json()['mode'] == 'exercise'

def test_risk_score():
    payload = {'source_id':'sim-1','rainfall_mm_hour':75,'water_index':55,'drainage_condition':'limited','observed_at':datetime.now(timezone.utc).isoformat()}
    data = client.post('/v1/exercise/risk', json=payload)
    assert data.status_code == 200
    assert data.json()['kind'] == 'synthetic_rule_demo'
    assert data.json()['requires_human_verification'] is True

def test_no_live_warning():
    assert client.post('/v1/live/public-warning').status_code == 403

def test_telemetry_is_labeled_synthetic():
    response = client.get("/v1/exercise/telemetry")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "synthetic_fixture"
    assert len(body["points"]) == 12
    assert body["points"][-1]["label"] == "now"
