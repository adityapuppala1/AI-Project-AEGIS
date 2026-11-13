"""Persistence for brand settings (db/migrations/019_brand_settings.sql).

PgStore is the real store; MemoryStore is an offline double with the same contract, used only by unit tests and
never selected by configuration. Every write is one transaction: an optimistic version check on the single settings
row plus one append-only audit row. The audit never holds logo bytes, only size, media type and SHA-256.
"""
import hashlib
import os
import threading
from datetime import datetime, timezone
from uuid import uuid4


class VersionConflict(Exception):
    """The settings row changed since the caller read it."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit_row(action: str, from_version: int, name: str | None, logo: bytes | None, media_type: str | None,
               actor: str) -> dict:
    return {"id": str(uuid4()), "action": action, "from_version": from_version, "to_version": from_version + 1,
            "name_after": name, "logo_media_type": media_type, "logo_size": len(logo) if logo is not None else None,
            "logo_sha256": hashlib.sha256(logo).hexdigest() if logo is not None else None, "actor": actor}


_SETTINGS = "SELECT name, logo_media_type, (logo IS NOT NULL) AS has_logo, version, updated_at, updated_by FROM brand_settings WHERE id=1"


class PgStore:
    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)

    def get(self) -> dict:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(_SETTINGS)
            row = cur.fetchone()
        if row is None:
            return {"name": None, "logo_media_type": None, "has_logo": False, "version": 0,
                    "updated_at": None, "updated_by": None}
        return dict(row)

    def get_logo(self) -> tuple[bytes, str, int] | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT logo, logo_media_type, version FROM brand_settings WHERE id=1 AND logo IS NOT NULL")
            row = cur.fetchone()
        return (bytes(row["logo"]), row["logo_media_type"], row["version"]) if row else None

    def _write(self, assignments: str, params: tuple, expected_version: int, audit: dict) -> dict:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO brand_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
            cur.execute(f"UPDATE brand_settings SET {assignments}, version=version+1, updated_at=now(), updated_by=%s "
                        "WHERE id=1 AND version=%s RETURNING version", (*params, audit["actor"], expected_version))
            if cur.fetchone() is None:
                conn.rollback()
                raise VersionConflict()
            cur.execute(
                """INSERT INTO brand_audit (id, action, from_version, to_version, name_after, logo_media_type,
                                            logo_size, logo_sha256, actor)
                   VALUES (%(id)s,%(action)s,%(from_version)s,%(to_version)s,%(name_after)s,%(logo_media_type)s,
                           %(logo_size)s,%(logo_sha256)s,%(actor)s)""", audit)
            cur.execute(_SETTINGS)
            return dict(cur.fetchone())

    def set_name(self, name: str, expected_version: int, actor: str) -> dict:
        return self._write("name=%s", (name,), expected_version,
                           _audit_row("name_set", expected_version, name, None, None, actor))

    def set_logo(self, logo: bytes, media_type: str, expected_version: int, actor: str) -> dict:
        return self._write("logo=%s, logo_media_type=%s", (logo, media_type), expected_version,
                           _audit_row("logo_set", expected_version, None, logo, media_type, actor))

    def reset(self, expected_version: int, actor: str) -> dict:
        return self._write("name=NULL, logo=NULL, logo_media_type=NULL", (), expected_version,
                           _audit_row("reset", expected_version, None, None, None, actor))

    def list_audit(self, limit: int) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id::text, action, from_version, to_version, name_after, logo_media_type, logo_size,
                                  logo_sha256, actor, at FROM brand_audit ORDER BY at DESC LIMIT %s""", (limit,))
            return [dict(row) for row in cur.fetchall()]


class MemoryStore:
    """Offline double for tests. Same contract as PgStore; never selected by configuration."""

    def __init__(self):
        self.row = {"name": None, "logo": None, "logo_media_type": None, "version": 0, "updated_at": _now(),
                    "updated_by": None}
        self.audit: list[dict] = []
        self._lock = threading.Lock()
        self.fail = False

    def _check(self):
        if self.fail:
            raise RuntimeError("store unavailable")

    def get(self):
        self._check()
        r = self.row
        return {"name": r["name"], "logo_media_type": r["logo_media_type"], "has_logo": r["logo"] is not None,
                "version": r["version"], "updated_at": r["updated_at"], "updated_by": r["updated_by"]}

    def get_logo(self):
        self._check()
        r = self.row
        return (r["logo"], r["logo_media_type"], r["version"]) if r["logo"] is not None else None

    def _write(self, changes, expected_version, audit):
        self._check()
        with self._lock:
            if self.row["version"] != expected_version:
                raise VersionConflict()
            self.row.update(changes, version=expected_version + 1, updated_at=_now(), updated_by=audit["actor"])
            self.audit.append({**audit, "at": _now()})
        return self.get()

    def set_name(self, name, expected_version, actor):
        return self._write({"name": name}, expected_version, _audit_row("name_set", expected_version, name, None, None, actor))

    def set_logo(self, logo, media_type, expected_version, actor):
        return self._write({"logo": bytes(logo), "logo_media_type": media_type}, expected_version,
                           _audit_row("logo_set", expected_version, None, logo, media_type, actor))

    def reset(self, expected_version, actor):
        return self._write({"name": None, "logo": None, "logo_media_type": None}, expected_version,
                           _audit_row("reset", expected_version, None, None, None, actor))

    def list_audit(self, limit):
        self._check()
        return [dict(r) for r in reversed(self.audit)][:limit]


_store = None


def get_store():
    global _store
    if _store is None:
        _store = PgStore()
    return _store


def set_store(store) -> None:
    global _store
    _store = store
