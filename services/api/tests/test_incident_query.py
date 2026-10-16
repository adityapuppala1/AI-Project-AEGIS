from fastapi.testclient import TestClient
from app.main import app
from app import db

client = TestClient(app)


def test_query_route_validates_sort_and_bounds():
    assert client.get("/v1/exercise/incidents/query?sort=DROP%20TABLE").status_code == 422
    assert client.get("/v1/exercise/incidents/query?page=0").status_code == 422
    assert client.get("/v1/exercise/incidents/query?page_size=1000").status_code == 422
    assert client.get("/v1/exercise/incidents/query?status=unknown").status_code == 422


def test_query_normalizes_and_forwards_search(monkeypatch):
    observed = {}
    def fake_query(**kwargs):
        observed.update(kwargs)
        return {"items": [], "total": 0, "page": 2, "page_size": 10, "total_pages": 1, "source": "synthetic_exercise"}
    monkeypatch.setattr(db, "query_incidents", fake_query)
    result = client.get("/v1/exercise/incidents/query?search=%20rain%20&status=review&sort=hazard_type&direction=asc&page=2")
    assert result.status_code == 200
    assert observed == {"search": "rain", "status": "review", "sort": "hazard_type", "direction": "asc", "page": 2, "page_size": 10}
    assert result.json()["source"] == "synthetic_exercise"


def test_sort_column_whitelist():
    assert set(db.INCIDENT_SORT_COLUMNS) == {"created_at", "hazard_type", "status"}
