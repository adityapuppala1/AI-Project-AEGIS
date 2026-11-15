"""Persistence for the Network Identifier Master (db/migrations/021_network_registry.sql).

PgStore is the real store; MemoryStore is an offline double with the same contract, used only by unit tests and never
selected by configuration. Every write is one transaction: an optimistic version check on the row plus one append-only
audit row holding field names only. Credential ciphertext is stored here but never returned by `view`.
"""
import os
import threading
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4


class VersionConflict(Exception):
    """The row changed since the caller read it."""


class NotFound(Exception):
    pass


class Duplicate(Exception):
    """The provider code is already used."""


PROVIDER_COLUMNS = ("code", "display_name", "kind", "orbit_class", "constellation_group", "mcc_mnc", "asn", "bands",
                    "monogram", "colour_token", "logo_key", "notes", "doc_link_id", "enabled", "is_reference",
                    "rehearsal_state", "rehearsal_capacity_kbps", "credential_ciphertext", "credential_nonce",
                    "credential_fingerprint", "deleted_at")
ASSET_COLUMNS = ("provider_id", "asset_type", "label", "norad_id", "latitude", "longitude", "enabled", "deleted_at")
TABLES = {"provider": ("network_provider", PROVIDER_COLUMNS), "asset": ("network_asset", ASSET_COLUMNS)}
SECRET_COLUMNS = frozenset({"credential_ciphertext", "credential_nonce"})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def view(row: dict) -> dict:
    """What leaves the API: never the credential ciphertext or nonce; dates as ISO text; numbers as JSON numbers."""
    out = {}
    for key, value in row.items():
        if key in SECRET_COLUMNS:
            continue
        if isinstance(value, datetime):
            value = value.isoformat()
        elif isinstance(value, Decimal):
            value = float(value)
        elif isinstance(value, UUID):
            value = str(value)
        out[key] = value
    if "credential_fingerprint" in row:
        out["has_credential"] = row.get("credential_fingerprint") is not None
    return out


def _audit(entity: str, entity_id, action: str, from_version, to_version: int, fields, actor: str, agency: str) -> dict:
    return {"id": str(uuid4()), "actor": actor, "agency_id": agency, "entity": entity, "entity_id": str(entity_id),
            "action": action, "from_version": from_version, "to_version": to_version,
            "changed_fields": sorted(f for f in fields if f not in SECRET_COLUMNS)}


_AUDIT_INSERT = """INSERT INTO network_registry_audit (id, actor, agency_id, entity, entity_id, action, from_version,
                   to_version, changed_fields) VALUES (%(id)s,%(actor)s,%(agency_id)s,%(entity)s,%(entity_id)s,
                   %(action)s,%(from_version)s,%(to_version)s,%(changed_fields)s)"""


class PgStore:
    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)

    def list_rows(self, entity: str, include_deleted: bool) -> list[dict]:
        table, _ = TABLES[entity]
        order = "kind, display_name" if entity == "provider" else "asset_type, label"
        where = "" if include_deleted else " WHERE deleted_at IS NULL"
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT * FROM {table}{where} ORDER BY {order}")
            return [dict(r) for r in cur.fetchall()]

    def get(self, entity: str, row_id: str) -> dict:
        table, _ = TABLES[entity]
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT * FROM {table} WHERE id=%s", (row_id,))
            row = cur.fetchone()
        if row is None:
            raise NotFound()
        return dict(row)

    def create(self, entity: str, values: dict, actor: str, agency: str) -> dict:
        import psycopg
        table, columns = TABLES[entity]
        values = {k: v for k, v in values.items() if k in columns}
        row_id = str(uuid4())
        names = ", ".join(["id", *values, "updated_by"])
        marks = ", ".join(["%s"] * (len(values) + 2))
        try:
            with self._connect() as conn, conn.cursor() as cur:
                if entity == "asset":
                    cur.execute("SELECT 1 FROM network_provider WHERE id=%s AND deleted_at IS NULL", (values["provider_id"],))
                    if cur.fetchone() is None:
                        raise NotFound()
                cur.execute(f"INSERT INTO {table} ({names}) VALUES ({marks}) RETURNING *", (row_id, *values.values(), actor))
                row = dict(cur.fetchone())
                cur.execute(_AUDIT_INSERT, _audit(entity, row_id, "create", None, 1, values, actor, agency))
                return row
        except psycopg.errors.UniqueViolation:
            raise Duplicate() from None

    def patch(self, entity: str, row_id: str, changes: dict, expected_version: int, action: str, actor: str,
              agency: str) -> dict:
        import psycopg
        table, columns = TABLES[entity]
        changes = {k: v for k, v in changes.items() if k in columns}
        sets = ", ".join(f"{k}=%s" for k in changes)
        sets = (sets + ", " if sets else "") + "version=version+1, updated_at=now(), updated_by=%s"
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute(f"UPDATE {table} SET {sets} WHERE id=%s AND version=%s RETURNING *",
                            (*changes.values(), actor, row_id, expected_version))
                row = cur.fetchone()
                if row is None:
                    cur.execute(f"SELECT 1 FROM {table} WHERE id=%s", (row_id,))
                    missing = cur.fetchone() is None
                    conn.rollback()
                    raise NotFound() if missing else VersionConflict()
                cur.execute(_AUDIT_INSERT, _audit(entity, row_id, action, expected_version, row["version"], changes,
                                                  actor, agency))
                return dict(row)
        except psycopg.errors.UniqueViolation:
            raise Duplicate() from None

    def list_audit(self, limit: int) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id::text, at, actor, entity, entity_id::text, action, from_version, to_version,
                                  changed_fields FROM network_registry_audit ORDER BY at DESC LIMIT %s""", (limit,))
            return [dict(r) for r in cur.fetchall()]


PROVIDER_DEFAULTS = {"orbit_class": None, "constellation_group": None, "mcc_mnc": [], "asn": [], "bands": [],
                     "logo_key": None, "notes": None, "doc_link_id": None, "enabled": False, "is_reference": False,
                     "rehearsal_state": "up", "rehearsal_capacity_kbps": 400, "credential_ciphertext": None,
                     "credential_nonce": None, "credential_fingerprint": None, "deleted_at": None}
ASSET_DEFAULTS = {"norad_id": None, "latitude": None, "longitude": None, "synthetic": True, "enabled": True,
                  "deleted_at": None}


class MemoryStore:
    """Offline double for tests. Same contract as PgStore; never selected by configuration."""

    def __init__(self):
        self.rows: dict[str, dict[str, dict]] = {"provider": {}, "asset": {}}
        self.audit: list[dict] = []
        self.fail = False
        self._lock = threading.Lock()

    def _check(self):
        if self.fail:
            raise RuntimeError("store unavailable")

    def list_rows(self, entity, include_deleted):
        self._check()
        rows = [dict(r) for r in self.rows[entity].values() if include_deleted or r["deleted_at"] is None]
        key = (lambda r: (r["kind"], r["display_name"])) if entity == "provider" else (lambda r: (r["asset_type"], r["label"]))
        return sorted(rows, key=key)

    def get(self, entity, row_id):
        self._check()
        row = self.rows[entity].get(str(row_id))
        if row is None:
            raise NotFound()
        return dict(row)

    def create(self, entity, values, actor, agency):
        self._check()
        _, columns = TABLES[entity]
        values = {k: v for k, v in values.items() if k in columns}
        with self._lock:
            if entity == "provider" and any(r["code"] == values["code"] for r in self.rows["provider"].values()):
                raise Duplicate()
            if entity == "asset":
                parent = self.rows["provider"].get(str(values["provider_id"]))
                if parent is None or parent["deleted_at"] is not None:
                    raise NotFound()
            row_id = str(uuid4())
            row = {**(PROVIDER_DEFAULTS if entity == "provider" else ASSET_DEFAULTS), **values, "id": row_id,
                   "version": 1, "created_at": _now(), "updated_at": _now(), "updated_by": actor}
            self.rows[entity][row_id] = row
            self.audit.append({**_audit(entity, row_id, "create", None, 1, values, actor, agency), "at": _now()})
            return dict(row)

    def patch(self, entity, row_id, changes, expected_version, action, actor, agency):
        self._check()
        _, columns = TABLES[entity]
        changes = {k: v for k, v in changes.items() if k in columns}
        with self._lock:
            row = self.rows[entity].get(str(row_id))
            if row is None:
                raise NotFound()
            if row["version"] != expected_version:
                raise VersionConflict()
            if entity == "provider" and "code" in changes and any(
                    r["code"] == changes["code"] and r["id"] != row["id"] for r in self.rows["provider"].values()):
                raise Duplicate()
            row.update(changes, version=expected_version + 1, updated_at=_now(), updated_by=actor)
            self.audit.append({**_audit(entity, row_id, action, expected_version, row["version"], changes, actor,
                                        agency), "at": _now()})
            return dict(row)

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
