"""Unit tests for read-only P0 readiness gates. No Docker/network needed."""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import doctor
from app.main import app

client = TestClient(app)
NOW = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)

READY_COUNTS = {
    "incidents": 5, "sources": 4, "source_samples": 24,
    "timeline_events": 7, "evidence": 5, "geo_assets": 5,
}


def test_all_checks_present_and_clean():
    result = doctor.summarize(
        missing_relations=[], missing_columns=[],
        counts=READY_COUNTS, as_of=NOW,
    )
    assert result["status"] == "ready"
    assert result["checks"]["read_only"] is True
    assert result["checks"]["real_integrations_connected"] is False
    assert result["checks"]["operational_actions_enabled"] is False
    assert result["fixture_counts"] == READY_COUNTS


@pytest.mark.parametrize("field", sorted(READY_COUNTS))
def test_each_missing_fixture_blocks_readiness(field):
    counts = dict(READY_COUNTS)
    counts[field] -= 1
    result = doctor.summarize(
        missing_relations=[], missing_columns=[],
        counts=counts, as_of=NOW,
    )
    assert result["status"] == "not_ready"
    assert field in result["incomplete_fixtures"]


def test_missing_migration_or_column_is_not_ready():
    report = doctor.summarize(
        missing_relations=["exercise_geo_assets"],
        missing_columns=["incidents.is_exercise_fixture"],
        counts=None, as_of=NOW,
    )
    assert report["status"] == "not_ready"
    assert report["checks"]["schema"] is False
    assert report["checks"]["fixtures"] is False
    assert set(report["incomplete_fixtures"]) == set(READY_COUNTS)


def test_readiness_api_reports_success_without_secrets(monkeypatch):
    payload = doctor.summarize(
        missing_relations=[], missing_columns=[], counts=READY_COUNTS, as_of=NOW,
    )
    monkeypatch.setattr(doctor, "inspect_stack", lambda: payload)
    response = client.get("/v1/exercise/system/readiness")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert "DATABASE_URL" not in response.text
    assert "password" not in response.text.lower()


def test_readiness_api_returns_503_when_database_missing(monkeypatch):
    payload = doctor.summarize(
        missing_relations=["exercise_ingestion_ledger"],
        missing_columns=[], counts=None, as_of=NOW,
    )
    monkeypatch.setattr(doctor, "inspect_stack", lambda: payload)
    response = client.get("/v1/exercise/system/readiness")
    assert response.status_code == 503
    assert response.json()["detail"]["missing_relations"] == ["exercise_ingestion_ledger"]


def test_readiness_api_returns_503_if_not_configured(monkeypatch):
    def fail():
        raise KeyError("DATABASE_URL")
    monkeypatch.setattr(doctor, "inspect_stack", fail)
    response = client.get("/v1/exercise/system/readiness")
    assert response.status_code == 503
    assert "database is unavailable" in response.json()["detail"]
    assert "DATABASE_URL" not in response.text


def test_no_mutating_readiness_api():
    assert client.post("/v1/exercise/system/readiness", json={}).status_code == 405
    assert client.post("/v1/live/public-warning").status_code == 403
