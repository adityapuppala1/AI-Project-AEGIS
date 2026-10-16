"""P0 migration preflight tests without a running Postgres instance."""
from datetime import datetime, timezone
from app import migration_audit

NOW = datetime(2026, 10, 16, 18, 0, tzinfo=timezone.utc)


def test_all_expected_constraints_are_ready():
    result = migration_audit.summarize_security_schema(
        extensions={"postgis", "pg_trgm"},
        indexes={name: True for name in migration_audit.EXPECTED_INDEXES},
        trigger_enabled=True, sampled_at=NOW,
    )
    assert result["status"] == "ready"
    assert result["real_operations_authorized"] is False


def test_missing_or_disabled_governance_guards_fail_closed():
    names = {name: True for name in migration_audit.EXPECTED_INDEXES}
    assert migration_audit.summarize_security_schema(
        extensions={"postgis", "pg_trgm"}, indexes=names,
        trigger_enabled=False, sampled_at=NOW,
    )["status"] == "not_ready"
    names["approvals_once_per_proposal"] = False
    result = migration_audit.summarize_security_schema(
        extensions={"postgis", "pg_trgm"}, indexes=names,
        trigger_enabled=True, sampled_at=NOW,
    )
    assert "approvals_once_per_proposal" in result["missing_or_nonunique_indexes"]
    assert result["status"] == "not_ready"


def test_missing_gis_extension_fails_closed():
    result = migration_audit.summarize_security_schema(
        extensions={"pg_trgm"},
        indexes={name: True for name in migration_audit.EXPECTED_INDEXES},
        trigger_enabled=True, sampled_at=NOW,
    )
    assert result["missing_extensions"] == ["postgis"]
    assert result["status"] == "not_ready"


class Cursor:
    def __init__(self, state):
        self.state = state
        self.sql = ""
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, sql, params):
        self.sql = sql
        self.state["calls"].append((sql, params))
    def fetchall(self):
        assert "pg_extension" in self.sql
        return [{"extname": "postgis"}, {"extname": "pg_trgm"}]
    def fetchone(self):
        if "pg_trigger" in self.sql: return {"enabled": "O"}
        if "pg_index" in self.sql:
            return {"valid": True, "ready": True, "unique_index": True}
        raise AssertionError("Unexpected SQL: " + self.sql)

class Connection:
    def __init__(self, state): self.state=state
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self, **_): return Cursor(self.state)


def test_sql_catalog_queries_are_parameterized(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://example.invalid/testing")
    state={"calls":[]}
    monkeypatch.setattr(migration_audit.psycopg, "connect",
                        lambda *_args, **_kwargs: Connection(state))
    result = migration_audit.inspect_security_schema()
    assert result["status"] == "ready"
    calls = state["calls"]
    assert len(calls) == len(migration_audit.EXPECTED_INDEXES) + 2
    assert calls[0][1] == (list(migration_audit.EXPECTED_EXTENSIONS),)
    assert calls[-1][1] == (migration_audit.EXPECTED_TRIGGER,)
    assert all("%s" in sql for sql, _ in calls)
