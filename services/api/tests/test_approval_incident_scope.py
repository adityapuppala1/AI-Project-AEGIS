"""Prevent agency leakage in the verified approval incident selector."""
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.security import Operator, get_operator
from app import exercise_workflows, workflow_store

client = TestClient(app)
AGENCY = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


class Cursor:
    def __init__(self, statements):
        self.statements = statements
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, params):
        self.statements.append((sql, params))
    def fetchall(self): return []

class Connection:
    def __init__(self, statements): self.statements = statements
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.statements)


def test_eligible_incidents_sql_is_scoped_and_bounded(monkeypatch):
    statements = []
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit.invalid/test")
    monkeypatch.setattr(workflow_store.psycopg, "connect",
                        lambda *_a, **_kw: Connection(statements))
    assert workflow_store.list_agency_exercise_incidents(OTHER) == []
    assert len(statements) == 1
    sql, params = statements[0]
    assert "agency_id=%s AND is_exercise_fixture IS TRUE" in sql
    assert "LIMIT 100" in sql
    assert params == (str(OTHER),)


def test_anonymous_approval_incident_selector_stays_locked(monkeypatch):
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    assert client.get("/v1/exercise/proposals/incidents").status_code == 503


def test_verified_agency_and_role_passed_from_server_claims(monkeypatch):
    seen = []
    def fake_list(agency):
        seen.append(agency)
        return [{"id": "22222222-2222-4222-8222-222222222222",
                 "hazard_type": "Synthetic exercise", "status": "review"}]
    monkeypatch.setattr(exercise_workflows, "list_agency_exercise_incidents", fake_list)
    app.dependency_overrides[get_operator] = lambda: Operator(
        subject="signed-operator", agency_id=OTHER,
        roles=frozenset({"incident_operator"}),
    )
    try:
        response = client.get("/v1/exercise/proposals/incidents")
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert seen == [OTHER]
    finally:
        app.dependency_overrides.clear()


def test_no_agency_role_cannot_list_cases(monkeypatch):
    monkeypatch.setattr(exercise_workflows, "list_agency_exercise_incidents",
                        lambda *_: (_ for _ in ()).throw(AssertionError("must not query")))
    app.dependency_overrides[get_operator] = lambda: Operator(
        subject="signed-user", agency_id=AGENCY, roles=frozenset(),
    )
    try:
        assert client.get("/v1/exercise/proposals/incidents").status_code == 403
    finally:
        app.dependency_overrides.clear()
