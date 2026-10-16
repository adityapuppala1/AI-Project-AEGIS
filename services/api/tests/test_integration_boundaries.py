"""DB boundary unit tests for integration readiness and exercise governance.

This does not replace PostgreSQL container tests: it checks SQL predicates,
bound parameters and absent/misconfigured schema handling with fake cursors.
"""
from uuid import UUID

import pytest

from app import doctor, workflow_store
from app.intelligence_store import DEMO_AGENCY


class Cursor:
    def __init__(self, state):
        self.state = state
        self.last_sql = ""
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, statement, parameters=None):
        self.last_sql = statement
        self.state["queries"].append((statement, parameters))
    def fetchone(self):
        if "to_regclass" in self.last_sql:
            return {"relation": "public.exists"}
        if "information_schema.columns" in self.last_sql:
            return {"present": True}
        if "COUNT(*) AS n" in self.last_sql:
            for name, statement in doctor.COUNTS.items():
                if statement == self.last_sql:
                    return {"n": doctor.MINIMUM_FIXTURES[name]}
        return None
    def fetchall(self): return []


class Connection:
    def __init__(self, state): self.state = state
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.state)


@pytest.fixture()
def sql_records(monkeypatch):
    state = {"queries": []}
    monkeypatch.setenv("DATABASE_URL", "postgresql://example.invalid/test")
    monkeypatch.setattr(doctor.psycopg, "connect",
                        lambda *_a, **_kw: Connection(state))
    return state


def test_readiness_database_inspection_has_bound_names_and_counts(sql_records):
    result = doctor.inspect_stack()
    assert result["status"] == "ready"
    queries = sql_records["queries"]
    assert len(queries) == (
        len(doctor.REQUIRED_RELATIONS) +
        sum(len(columns) for columns in doctor.REQUIRED_COLUMNS.values()) +
        len(doctor.MINIMUM_FIXTURES)
    )
    for sql, params in queries:
        if "to_regclass" in sql:
            assert params[0].startswith("public.")
        if "COUNT(*) AS n" in sql:
            assert params == (str(DEMO_AGENCY),)


def test_gov_creation_rejects_out_of_demo_incident(sql_records):
    with pytest.raises(LookupError, match="Exercise incident not found"):
        workflow_store.create_proposal(
            "22222222-2222-4222-8222-222222222222", DEMO_AGENCY,
            "verified-maker", __import__("app.governance", fromlist=["Action"]).Action.INTERNAL_TRIAGE,
            "This is a synthetic triage exercise",
        )
    statement, params = sql_records["queries"][-1]
    assert "agency_id=%s AND is_exercise_fixture IS TRUE" in statement
    assert params[1] == str(DEMO_AGENCY)


def test_gov_transition_requires_synthetic_incident_scope(sql_records):
    with pytest.raises(LookupError, match="Exercise proposal not found"):
        workflow_store.transition(
            "11111111-1111-4111-8111-111111111112", DEMO_AGENCY,
            "verified-maker", "submit",
        )
    statement, params = sql_records["queries"][-1]
    assert "i.agency_id=%s AND i.is_exercise_fixture IS TRUE" in statement
    assert "FOR UPDATE OF p" in statement
    assert params[1] == str(DEMO_AGENCY)


def test_gov_list_filters_non_demo_incidents(sql_records):
    assert workflow_store.list_proposals(DEMO_AGENCY) == []
    statement, params = sql_records["queries"][-1]
    assert "i.agency_id=%s AND i.is_exercise_fixture IS TRUE" in statement
    assert "LIMIT 100" in statement
    assert params == (str(DEMO_AGENCY),)
