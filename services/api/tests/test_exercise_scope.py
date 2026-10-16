"""Validate synthetic-only query constraints without requiring a running database."""
from app import db
from app.intelligence_store import DEMO_AGENCY


class DummyCursor:
    def __init__(self, executed):
        self.executed = executed

    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, params=None):
        self.executed.append((sql, params))
    def fetchone(self): return {"total": 0}
    def fetchall(self): return []


class DummyConnection:
    def __init__(self, executed): self.executed = executed
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return DummyCursor(self.executed)


def test_public_exercise_registry_uses_explicit_demo_scope(monkeypatch):
    statements = []
    monkeypatch.setattr(db.psycopg, "connect", lambda *_args, **_kwargs: DummyConnection(statements))
    assert db.list_incidents() == []
    assert len(statements) == 1
    sql, values = statements[0]
    assert "agency_id = %s" in sql
    assert "is_exercise_fixture IS TRUE" in sql
    assert values == (str(DEMO_AGENCY),)


def test_server_filter_keeps_fixture_scope_and_binds_search(monkeypatch):
    statements = []
    monkeypatch.setattr(db.psycopg, "connect", lambda *_args, **_kwargs: DummyConnection(statements))
    result = db.query_incidents(search="100%_rain", status="review", sort="status", direction="asc")
    assert result["source"] == "synthetic_exercise"
    assert result["total"] == 0
    assert len(statements) == 2
    for sql, values in statements:
        assert "agency_id = %s" in sql
        assert "is_exercise_fixture IS TRUE" in sql
        assert values[0] == str(DEMO_AGENCY)
        assert "100\\%\\_rain" in values[1]
    assert "ORDER BY status ASC, id ASC" in statements[-1][0]
