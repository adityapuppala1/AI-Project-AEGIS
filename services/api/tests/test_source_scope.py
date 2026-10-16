"""Ensure anonymous exercise source APIs cannot query unscoped data."""
from datetime import datetime, timezone
from uuid import UUID
from app import source_store
from app.intelligence_store import DEMO_AGENCY

NOW = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
SID = UUID("c3000000-0000-4000-8000-000000000001")


class Cursor:
    def __init__(self, statements, rows):
        self.statements = statements
        self.rows = rows
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, params=None):
        self.statements.append((sql, params))
    def fetchall(self): return self.rows
    def fetchone(self): return self.rows[0] if self.rows else None


class Connection:
    def __init__(self, statements, rows):
        self.statements = statements
        self.rows = rows
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.statements, self.rows)


def test_public_source_registry_scoped_to_demo_agency(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit-test.invalid/test")
    statements = []
    monkeypatch.setattr(source_store.psycopg, "connect",
        lambda *_a, **_kw: Connection(statements, []))
    overview = source_store.list_exercise_sources()
    assert overview["sources"] == []
    assert overview["source"] == "synthetic_exercise"
    assert overview["real_connectors_enabled"] is False
    assert len(statements) == 1
    sql, values = statements[0]
    assert "s.agency_id=%s AND s.synthetic IS TRUE" in sql
    assert "x.synthetic IS TRUE" in sql
    assert values == (str(DEMO_AGENCY),)


def test_unknown_history_source_scoped_before_reading_rows(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit-test.invalid/test")
    statements = []
    monkeypatch.setattr(source_store.psycopg, "connect",
        lambda *_a, **_kw: Connection(statements, []))
    assert source_store.source_history(SID, 24) is None
    assert len(statements) == 1
    sql, values = statements[0]
    assert "agency_id=%s AND synthetic IS TRUE" in sql
    assert values == (str(SID), str(DEMO_AGENCY))
