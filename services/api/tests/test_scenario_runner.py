"""ReplayLab CLI checks: opt-in, scope, freshness and idempotent UUID rows."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from app import scenario_runner
from app.intelligence_store import DEMO_AGENCY

NOW = datetime(2026, 10, 16, 17, 0, tzinfo=timezone.utc)
RUN_ID = UUID("e8000000-0000-4000-8000-000000000001")


class Cursor:
    def __init__(self, state):
        self.state = state
        self.sql = ""
        self.insert_id = None
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, params=None):
        self.sql = sql
        self.state["statements"].append((sql,params))
        if "INSERT INTO exercise_source_samples" in sql:
            assert params[1] in self.state["registered"]
            self.insert_id = params[0]
            self.state["seen_params"].append(params)
    def fetchall(self):
        if self.state.get("missing"):
            return []
        return [{"id": key, "metric_unit": val} for key,val in self.state["registered"].items()]
    def fetchone(self):
        assert self.insert_id is not None
        value = self.insert_id
        self.insert_id = None
        if value in self.state["stored"]:
            return None
        self.state["stored"].add(value)
        return {"id": value}


class Connection:
    def __init__(self, state): self.state=state
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.state)


@pytest.fixture()
def db(monkeypatch):
    state = {
        "registered": {entry[0]: entry[1] for entry in scenario_runner.SAMPLES},
        "statements": [], "seen_params": [], "stored": set(),
    }
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit.invalid/exercise")
    monkeypatch.setattr(scenario_runner.psycopg, "connect",
                        lambda *_a, **_kw: Connection(state))
    return state


def test_first_run_produces_all_four_truthful_source_states(db):
    output = scenario_runner.replay_tabletop(RUN_ID, as_of=NOW)
    assert output["source"] == "synthetic_exercise"
    assert output["accepted_samples"] == 3
    assert output["duplicate_samples"] == 0
    assert output["deliberately_unreported_sources"] == 1
    assert output["real_sensor_connections"] is False
    assert output["outbound_messages_sent"] is False
    assert output["operational_actions_enabled"] is False
    assert len(db["stored"]) == 3
    assert len(db["seen_params"]) == 3
    assert db["statements"][1][1] == (
        str(DEMO_AGENCY), [entry[0] for entry in scenario_runner.SAMPLES],
    )
    for params, fixture in zip(db["seen_params"], scenario_runner.SAMPLES):
        _uid, source_id, observed, ingested, value, quality = params
        assert source_id == fixture[0]
        assert observed == NOW - timedelta(minutes=fixture[2])
        assert ingested - observed == timedelta(minutes=fixture[3])
        assert quality == fixture[5]


def test_same_run_id_is_idempotent_with_stored_observations(db):
    scenario_runner.replay_tabletop(RUN_ID, as_of=NOW)
    result = scenario_runner.replay_tabletop(RUN_ID, as_of=NOW+timedelta(hours=1))
    assert result["accepted_samples"] == 0
    assert result["duplicate_samples"] == 3
    assert len(db["stored"]) == 3


def test_distinct_run_ids_produce_new_rows_without_deletion(db):
    scenario_runner.replay_tabletop(RUN_ID, as_of=NOW)
    new = UUID("e8000000-0000-4000-8000-000000000002")
    result = scenario_runner.replay_tabletop(new, as_of=NOW+timedelta(hours=1))
    assert result["accepted_samples"] == 3
    assert len(db["stored"]) == 6
    assert not any("DELETE FROM" in sql.upper() or "TRUNCATE" in sql.upper()
                   for sql, _ in db["statements"])


def test_missing_or_wrong_agency_registry_prevents_insertion(db):
    db["missing"] = True
    with pytest.raises(ValueError, match="Required synthetic registry"):
        scenario_runner.replay_tabletop(RUN_ID, as_of=NOW)
    assert len(db["stored"]) == 0


def test_bad_time_and_run_id_fail_before_db():
    with pytest.raises(ValueError, match="run identifier"):
        scenario_runner.replay_tabletop("not-a-uuid", as_of=NOW)
    with pytest.raises(ValueError, match="timezone"):
        scenario_runner.replay_tabletop(RUN_ID, as_of=NOW.replace(tzinfo=None))


def test_cli_needs_confirmation_before_writing(monkeypatch):
    monkeypatch.setattr("sys.argv", ["app.scenario_runner"])
    with pytest.raises(SystemExit) as err:
        scenario_runner.main()
    assert err.value.code == 2
