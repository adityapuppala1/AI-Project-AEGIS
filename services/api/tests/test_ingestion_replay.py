"""Replay integration logic tested against an in-memory SQL adapter (no DB/network)."""
import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from app.main import app
from app import ingestion_store
from app.replay import load_bundled_fixture

client = TestClient(app)
CLOCK = datetime(2026, 10, 16, 18, 0, tzinfo=timezone.utc)


class FakeCursor:
    def __init__(self, state):
        self.state = state
        self.current = None

    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, args=None):
        self.state["statements"].append(sql)
        if "pg_advisory_xact_lock" in sql:
            self.current = None
        elif "SELECT metric_unit FROM exercise_data_sources" in sql:
            source = str(args[0])
            self.current = {"metric_unit": self.state["units"][source]} if source in self.state["units"] else None
        elif "SELECT payload_sha256 FROM exercise_ingestion_ledger" in sql:
            self.current = self.state["ledger"].get(str(args[0]))
        elif "INSERT INTO exercise_ingestion_ledger" in sql:
            event_id, _source, digest = str(args[0]), str(args[1]), args[2]
            self.state["ledger"][event_id] = {"payload_sha256": digest}
            self.current = None
        elif "INSERT INTO exercise_source_samples" in sql:
            self.state["samples"].add(str(args[0]))
            self.current = None
        elif "INSERT INTO exercise_ingestion_quarantine" in sql:
            _id, digest, reason = args[:3]
            self.state["quarantine"].add((digest, reason))
            self.current = None
        else:
            raise AssertionError("Unexpected SQL: " + sql)
    def fetchone(self):
        return self.current


class FakeConnection:
    def __init__(self, state): self.state = state
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **kwargs): return FakeCursor(self.state)


def test_replay_accept_duplicate_quarantine_and_idempotency(monkeypatch):
    from app.intelligence_store import DEMO_AGENCY
    state = {
        "units": {
            "c3000000-0000-4000-8000-000000000001": "mm",
            "c3000000-0000-4000-8000-000000000002": "cm",
            "c3000000-0000-4000-8000-000000000003": "reports",
        },
        "ledger": {}, "samples": set(), "quarantine": set(), "statements": [],
    }
    monkeypatch.setenv("DATABASE_URL", "postgresql://invalid.local/test")
    monkeypatch.setattr(ingestion_store.psycopg, "connect", lambda *_a, **_kw: FakeConnection(state))
    records = load_bundled_fixture()
    first = ingestion_store.replay_records(records, as_of=CLOCK)
    assert first["mode"] == "synthetic_exercise"
    assert first["accepted"] == 3
    assert first["duplicate"] == 1
    assert first["quarantined"] == 5
    assert first["no_operational_actions"] is True
    assert len(state["ledger"]) == len(state["samples"]) == 3
    assert len(state["quarantine"]) == 5
    assert any("pg_advisory_xact_lock" in sql for sql in state["statements"])

    again = ingestion_store.replay_records(records, as_of=CLOCK)
    assert again["accepted"] == 0
    assert again["duplicate"] == 4
    assert again["quarantined"] == 5
    assert len(state["ledger"]) == len(state["samples"]) == 3
    assert len(state["quarantine"]) == 5


def test_read_only_status_endpoint(monkeypatch):
    monkeypatch.setattr(ingestion_store, "ingestion_overview", lambda: {
        "mode": "synthetic_exercise", "replay_trigger": "local_cli_only",
        "accepted_events": 3, "quarantine_records": 5,
        "quarantine_reasons": {"unit_mismatch": 1}, "generated_at": CLOCK.isoformat(),
        "live_ingestion_enabled": False, "no_operational_actions": True,
    })
    response = client.get("/v1/exercise/ingestion/status")
    assert response.status_code == 200
    assert response.json()["live_ingestion_enabled"] is False
    assert response.json()["accepted_events"] == 3


def test_no_network_replay_write_endpoint():
    for path in (
        "/v1/exercise/ingestion/replay",
        "/v1/exercise/ingestion/observations",
    ):
        assert client.post(path, json={}).status_code == 404
    assert client.post("/v1/live/public-warning").status_code == 403
