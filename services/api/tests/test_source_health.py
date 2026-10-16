"""Deterministic source-freshness tests; no external data or physical devices."""
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import source_store
from app.source_health import classify_source

NOW = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
client = TestClient(app)
SID = "c3000000-0000-4000-8000-000000000001"


def classify(age, ingest_delay=30, **overrides):
    observed = NOW - timedelta(seconds=age)
    ingested = observed + timedelta(seconds=ingest_delay)
    return classify_source(
        observed_at=observed, ingested_at=ingested,
        as_of=NOW, expected_interval_seconds=600,
        warning_multiplier=1.5, stale_multiplier=4, **overrides,
    )


@pytest.mark.parametrize("age,status", [
    (10, "fresh"), (900, "fresh"), (901, "delayed"),
    (2400, "delayed"), (2401, "stale"), (10800, "stale")
])
def test_threshold_boundaries(age, status):
    result = classify(age)
    assert result["status"] == status
    assert result["age_seconds"] == age
    assert result["ingestion_lag_seconds"] == 30


def test_missing_reading_not_equivalent_to_healthy():
    result = classify_source(
        observed_at=None, ingested_at=None, as_of=NOW, expected_interval_seconds=600
    )
    assert result["status"] == "no_data"
    assert result["age_seconds"] is None


def test_late_ingestion_does_not_make_old_observation_fresh():
    result = classify(3000, ingest_delay=2990)
    assert result["status"] == "stale"
    assert result["age_seconds"] == 3000


@pytest.mark.parametrize("observed_delta,ingested_delta", [
    (300, 320), (-200, 300),
])
def test_future_clock_anomaly(observed_delta, ingested_delta):
    result = classify_source(
        observed_at=NOW + timedelta(seconds=observed_delta),
        ingested_at=NOW + timedelta(seconds=ingested_delta),
        as_of=NOW, expected_interval_seconds=600,
    )
    assert result["status"] == "clock_anomaly"


def test_naive_source_timestamp_is_clock_anomaly():
    assert classify_source(
        observed_at=NOW.replace(tzinfo=None), ingested_at=NOW,
        as_of=NOW, expected_interval_seconds=600,
    )["status"] == "clock_anomaly"


@pytest.mark.parametrize("expected,warning,stale", [(0,1.5,4),(600,0.5,4),(600,4,4)])
def test_invalid_threshold_configuration_rejected(expected,warning,stale):
    with pytest.raises(ValueError):
        classify_source(
            observed_at=None, ingested_at=None, as_of=NOW,
            expected_interval_seconds=expected,
            warning_multiplier=warning, stale_multiplier=stale,
        )


def test_exercise_sources_api(monkeypatch):
    monkeypatch.setattr(source_store, "list_exercise_sources", lambda: {
        "sources": [], "counts": {key: 0 for key in
            ("fresh", "delayed", "stale", "no_data", "clock_anomaly")},
        "source": "synthetic_exercise", "as_of": NOW.isoformat(),
        "real_connectors_enabled": False, "total": 0,
    })
    result = client.get("/v1/exercise/sources")
    assert result.status_code == 200
    assert result.json()["real_connectors_enabled"] is False


def test_history_id_and_page_limit_validated(monkeypatch):
    monkeypatch.setattr(source_store, "source_history",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("Must not query")))
    assert client.get("/v1/exercise/sources/no-uuid/history").status_code == 422
    assert client.get(f"/v1/exercise/sources/{SID}/history?limit=49").status_code == 422
    assert client.get(f"/v1/exercise/sources/{SID}/history?limit=0").status_code == 422


def test_missing_source_history_returns_404(monkeypatch):
    monkeypatch.setattr(source_store, "source_history", lambda *_: None)
    assert client.get(f"/v1/exercise/sources/{SID}/history").status_code == 404


def test_bounded_history_forwards_uuid(monkeypatch):
    observed = []
    def fake_history(source_id, limit):
        observed.append((str(source_id), limit))
        return {"id": str(source_id), "samples": [], "source": "synthetic_exercise", "real_connector": False}
    monkeypatch.setattr(source_store, "source_history", fake_history)
    result = client.get(f"/v1/exercise/sources/{SID}/history?limit=12")
    assert result.status_code == 200
    assert observed == [(SID, 12)]
    assert result.json()["real_connector"] is False
