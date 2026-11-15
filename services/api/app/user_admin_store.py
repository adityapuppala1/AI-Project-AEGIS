"""Persistence for the user administration audit (db/migrations/020_user_admin_audit.sql).

PgStore is the real store; MemoryStore is an offline double with the same contract, used only by unit tests and never
selected by configuration. `bracket` opens one transaction, takes a transaction-scoped advisory lock so user
administration writes run one at a time (the last-administrator check cannot race), runs the identity provider call,
and only then inserts the audit row and commits. A provider call that raises leaves no row. Rows never hold a password
or an email address: changed fields are closed codes.
"""
import os
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4

ACTIONS = frozenset({"create", "update", "enable", "disable", "reset_password", "sign_out"})
OUTCOMES = frozenset({"done", "incomplete"})
CHANGE_CODES = frozenset({"first_name", "last_name", "email", "role", "department", "team"})
_LOCK_KEY = 7_424_020  # pg_advisory_xact_lock key for user administration writes


def audit_row(action: str, outcome: str, target_id: str, target_username: str, changed, role_after, actor: str) -> dict:
    if action not in ACTIONS or outcome not in OUTCOMES:
        raise ValueError("audit_code")
    changed = sorted(set(changed or ()))
    if not set(changed) <= CHANGE_CODES:
        raise ValueError("audit_code")
    return {"id": str(uuid4()), "action": action, "outcome": outcome, "target_id": target_id,
            "target_username": target_username, "changed": changed, "role_after": role_after, "actor": actor}


class _Recorder:
    """Handed to the bracketed call; it states what to record once the provider call has finished."""

    def __init__(self):
        self.row: dict | None = None

    def record(self, **fields) -> None:
        self.row = audit_row(**fields)


class PgStore:
    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, connect_timeout=5)

    @contextmanager
    def bracket(self):
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(%s)", (_LOCK_KEY,))
            recorder = _Recorder()
            yield recorder  # the provider call runs here; an exception rolls the transaction back
            if recorder.row is not None:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO user_admin_audit (id, action, outcome, target_id, target_username, changed,
                                                          role_after, actor)
                           VALUES (%(id)s,%(action)s,%(outcome)s,%(target_id)s,%(target_username)s,%(changed)s,
                                   %(role_after)s,%(actor)s)""", recorder.row)
            conn.commit()

    def list_audit(self, limit: int) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id::text, action, outcome, target_id, target_username, changed, role_after, actor, at
                           FROM user_admin_audit ORDER BY at DESC LIMIT %s""", (limit,))
            return [dict(row) for row in cur.fetchall()]


class MemoryStore:
    """Offline double for tests. Same contract as PgStore; never selected by configuration."""

    def __init__(self):
        self.rows: list[dict] = []
        self.fail = False
        self._lock = threading.Lock()

    @contextmanager
    def bracket(self):
        if self.fail:
            raise RuntimeError("store unavailable")
        with self._lock:
            recorder = _Recorder()
            yield recorder
            if recorder.row is not None:
                self.rows.append({**recorder.row, "at": datetime.now(timezone.utc)})

    def list_audit(self, limit: int) -> list[dict]:
        if self.fail:
            raise RuntimeError("store unavailable")
        return [dict(row) for row in reversed(self.rows)][:limit]


_store = None


def get_store():
    global _store
    if _store is None:
        _store = PgStore()
    return _store


def set_store(store) -> None:
    global _store
    _store = store
