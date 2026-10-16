"""Network-free spatial correlation and fail-closed API tests."""
from datetime import datetime, timedelta, timezone
from uuid import UUID
import pytest
from fastapi.testclient import TestClient
from app import spatial_store
from app.main import app
from app.intelligence_store import DEMO_AGENCY
from app.spatial_rules import distance_band, explanation, MAX_CANDIDATES

client = TestClient(app)
INCIDENT = "22222222-2222-4222-8222-222222222222"

class Cursor:
    def __init__(self, db):
        self.db = db
        self.index = 0
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, args=None):
        self.db["sql"].append((sql, args))
        self.index += 1
    def fetchone(self):
        return self.db["incident"] if self.index == 1 else None
    def fetchall(self):
        if self.index == 2: return self.db["sources"]
        if self.index == 3: return self.db["assets"]
        return []

class Connection:
    def __init__(self, db): self.db = db
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.db)

def fixture():
    now = datetime.now(timezone.utc)
    def source(uid, age, distance, label):
        observed = now - timedelta(seconds=age)
        return {
            "id": uid, "name": label, "source_kind": "rain_gauge",
            "metric_label": "Rainfall", "metric_unit": "mm",
            "expected_interval_seconds": 900,
            "warning_multiplier": 1.5, "stale_multiplier": 4.0,
            "distance_m": distance, "observed_at": observed,
            "ingested_at": observed + timedelta(seconds=60),
            "metric_value": 30, "quality_status": "synthetic_curated",
        }
    return {
        "sql": [],
        "incident": {"id": INCIDENT, "hazard_type": "Urban waterlogging",
                     "lat": 17.4065, "lon": 78.4483},
        "sources": [
            source("c3000000-0000-4000-8000-000000000001", 300, 380.53, "Fictional gauge"),
            source("c3000000-0000-4000-8000-000000000003", 86400, 2600.7, "Fictional report"),
        ],
        "assets": [{"id": "e5000000-0000-4000-8000-000000000001",
                    "asset_name": "Fictional care facility",
                    "asset_kind": "exercise_hospital", "distance_m": 425.6}],
    }

def test_analysis_never_claims_actual_impact(monkeypatch):
    data = fixture()
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit.test/demo")
    monkeypatch.setattr(spatial_store.psycopg, "connect",
                        lambda *_a, **_k: Connection(data))
    result = spatial_store.spatial_candidates(UUID(INCIDENT), radius_m=3000)
    assert result["analysis_kind"] == "geographic_proximity_only"
    assert result["source"] == "synthetic_exercise"
    assert result["validated_risk_model"] is False
    assert result["actual_asset_impact_known"] is False
    assert result["operational_actions_enabled"] is False
    assert result["nearby_sources"][0]["freshness"] == "fresh"
    assert result["nearby_sources"][1]["freshness"] == "stale"
    assert "not current" in result["nearby_sources"][1]["reason"]
    assert result["nearby_assets"][0]["impact_status"] == "not_assessed"

def test_postgis_query_scope_and_bound_parameters(monkeypatch):
    data = fixture()
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit.test/demo")
    monkeypatch.setattr(spatial_store.psycopg, "connect",
                        lambda *_a, **_k: Connection(data))
    spatial_store.spatial_candidates(UUID(INCIDENT), radius_m=5000)
    statements = data["sql"]
    assert len(statements) == 3
    assert "is_exercise_fixture IS TRUE" in statements[0][0]
    assert statements[0][1] == (INCIDENT, str(DEMO_AGENCY))
    for sql, params in statements[1:]:
        assert "synthetic IS TRUE" in sql
        assert "ST_DWithin" in sql
        assert "ST_Distance" in sql
        assert params[2] == str(DEMO_AGENCY)
        assert params[-2:] == (5000, MAX_CANDIDATES)

def test_missing_incident_does_not_query_candidates(monkeypatch):
    data = fixture()
    data["incident"] = None
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit.test/demo")
    monkeypatch.setattr(spatial_store.psycopg, "connect",
                        lambda *_a, **_k: Connection(data))
    assert spatial_store.spatial_candidates(UUID(INCIDENT)) is None
    assert len(data["sql"]) == 1

@pytest.mark.parametrize("radius", [0, 99, 5001, 10000])
def test_radius_bounds(radius):
    with pytest.raises(ValueError):
        spatial_store.spatial_candidates(UUID(INCIDENT), radius_m=radius)

def test_explanation_never_suggests_verified_causality():
    assert distance_band(1000) == "nearby"
    assert distance_band(1001) == "within_area"
    assert "Proximity does not establish" in explanation(distance_m=100, has_reading=True, stale=False)
    assert "cannot corroborate" in explanation(distance_m=100, has_reading=False, stale=False)
    with pytest.raises(ValueError):
        distance_band(-1)

def test_http_parameter_validation():
    assert client.get("/v1/exercise/incidents/not-uuid/correlation").status_code == 422
    assert client.get(f"/v1/exercise/incidents/{INCIDENT}/correlation?radius_m=6000").status_code == 422
    assert client.get(f"/v1/exercise/incidents/{INCIDENT}/correlation?radius_m=0").status_code == 422

def test_http_valid_and_missing_incident(monkeypatch):
    calls = []
    sample = {"source": "synthetic_exercise", "analysis_kind": "geographic_proximity_only",
              "validated_risk_model": False, "actual_asset_impact_known": False,
              "operational_actions_enabled": False, "nearby_sources": [], "nearby_assets": []}
    def match(identifier, radius_m):
        calls.append((str(identifier), radius_m))
        return sample
    monkeypatch.setattr(spatial_store, "spatial_candidates", match)
    response = client.get(f"/v1/exercise/incidents/{INCIDENT}/correlation?radius_m=1200")
    assert response.status_code == 200
    assert response.json()["validated_risk_model"] is False
    assert calls == [(INCIDENT, 1200)]
    monkeypatch.setattr(spatial_store, "spatial_candidates", lambda *_a, **_kw: None)
    assert client.get(f"/v1/exercise/incidents/{INCIDENT}/correlation").status_code == 404
