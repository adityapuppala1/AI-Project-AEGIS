"""Network-free AgencySync unit and API tests: fictional task isolation only."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import agency_sync_store
from app.main import app
from app.intelligence_store import DEMO_AGENCY

CASE = UUID("22222222-2222-4222-8222-222222222222")
TASK = UUID("f6000000-0000-4000-8000-000000000001")
NOW = datetime(2026, 10, 16, 17, 0, tzinfo=timezone.utc)
client = TestClient(app)


def fake_task(state="acknowledged"):
    return {
        "id": str(TASK), "incident_id": str(CASE),
        "agency_label": "Fictional drainage desk",
        "task_kind": "desk_review",
        "summary": "SIMULATION: scripted tabletop desk review, never sent.",
        "playbook_ref": agency_sync_store.PLAYBOOK_VERSION,
        "state": state,
        "prepared_at": NOW-timedelta(hours=3),
        "due_at": NOW+timedelta(hours=1),
        "acknowledged_at": NOW-timedelta(hours=2) if state != "prepared" else None,
        "closed_at": NOW-timedelta(hours=1) if state == "closed" else None,
    }


class Cursor:
    def __init__(self, state):
        self.state = state
        self.sql = ""
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, args):
        self.sql = sql
        self.state["executed"].append((sql, args))
    def fetchall(self):
        if "GROUP BY t.state" in self.sql:
            return [
                {"state": "prepared", "amount": 3},
                {"state": "acknowledged", "amount": 2},
                {"state": "closed", "amount": 2},
            ]
        if "exercise_agency_task_events" in self.sql:
            return [{
                "id": "f7000000-0000-4000-8000-000000000008",
                "kind": "acknowledged",
                "occurred_at": NOW-timedelta(hours=2),
                "actor_label": "Fictional desk",
                "summary": "SIMULATION: scripted acknowledgement, no real recipient.",
            }]
        return [fake_task()]
    def fetchone(self):
        return self.state.get("detail_task", fake_task())


class Connection:
    def __init__(self, state): self.state=state
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.state)


@pytest.fixture()
def capture(monkeypatch):
    record = {"executed": []}
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit.invalid/exercise")
    monkeypatch.setattr(agency_sync_store.psycopg, "connect",
                        lambda *_a, **_kw: Connection(record))
    return record


def test_board_is_demo_only_and_counted(capture):
    result = agency_sync_store.agency_task_board()
    assert result["source"] == "synthetic_exercise"
    assert result["outbound_messages_sent"] is False
    assert result["acknowledgements_are_scripted"] is True
    assert result["operational_actions_enabled"] is False
    assert result["total_in_scope"] == 7
    assert result["returned"] == 1
    assert result["tasks"][0]["synthetic"] is True
    assert len(capture["executed"]) == 2
    for sql, args in capture["executed"]:
        assert "i.agency_id=%s AND i.is_exercise_fixture IS TRUE" in sql
        assert "t.synthetic IS TRUE" in sql
        assert args[0] == str(DEMO_AGENCY)
    assert capture["executed"][-1][1][-1] == 50


def test_filter_is_parameterized_not_interpolated(capture):
    agency_sync_store.agency_task_board(incident_id=CASE, state="prepared", limit=5)
    group_sql, group_args = capture["executed"][0]
    list_sql, list_args = capture["executed"][1]
    assert group_args == [str(DEMO_AGENCY), str(CASE)]
    assert list_args == [str(DEMO_AGENCY), str(CASE), "prepared", 5]
    assert "i.id=%s" in group_sql
    assert "t.state=%s" in list_sql
    assert "prepared" not in list_sql


@pytest.mark.parametrize("limit,state", [(0,None),(51,None),(-1,None),(True,None),(5,"completed")])
def test_invalid_filters_rejected(limit, state):
    with pytest.raises(ValueError):
        agency_sync_store.agency_task_board(limit=limit, state=state)


def test_task_detail_scoped_and_bounded(capture):
    detail = agency_sync_store.agency_task_detail(TASK)
    assert detail["task"]["id"] == str(TASK)
    assert detail["outbound_messages_sent"] is False
    assert len(detail["events"]) == 1
    assert detail["events"][0]["synthetic"] is True
    assert len(capture["executed"]) == 2
    sql, params = capture["executed"][0]
    assert "i.agency_id=%s AND i.is_exercise_fixture IS TRUE" in sql
    assert params == (str(TASK), str(DEMO_AGENCY))
    sql, params = capture["executed"][1]
    assert "synthetic IS TRUE" in sql
    assert "LIMIT 40" in sql
    assert params == (str(TASK),)


def test_unknown_task_returns_no_private_details(capture):
    capture["detail_task"] = None
    assert agency_sync_store.agency_task_detail(TASK) is None
    assert len(capture["executed"]) == 1


def test_http_task_routes_validate_uuid_and_filters():
    assert client.get("/v1/exercise/agency-tasks?limit=0").status_code == 422
    assert client.get("/v1/exercise/agency-tasks?limit=51").status_code == 422
    assert client.get("/v1/exercise/agency-tasks?state=live").status_code == 422
    assert client.get("/v1/exercise/agency-tasks?incident_id=invalid").status_code == 422
    assert client.get("/v1/exercise/agency-tasks/not-a-uuid").status_code == 422


def test_http_task_board_and_missing_detail(monkeypatch):
    monkeypatch.setattr(agency_sync_store, "agency_task_board",
                        lambda **_kw: {"source": "synthetic_exercise", "tasks": [],
                                       "outbound_messages_sent": False,
                                       "operational_actions_enabled": False})
    response = client.get("/v1/exercise/agency-tasks")
    assert response.status_code == 200
    assert response.json()["outbound_messages_sent"] is False
    monkeypatch.setattr(agency_sync_store, "agency_task_detail", lambda *_args: None)
    assert client.get("/v1/exercise/agency-tasks/" + str(TASK)).status_code == 404


def test_task_endpoints_have_no_mutating_network_route():
    assert client.post("/v1/exercise/agency-tasks", json={}).status_code == 405
    assert client.post("/v1/exercise/agency-tasks/" + str(TASK), json={}).status_code == 405
    assert client.post("/v1/live/public-warning").status_code == 403
