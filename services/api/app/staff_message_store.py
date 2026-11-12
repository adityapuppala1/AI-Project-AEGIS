"""Persistence for staff email notices (db/migrations/018_staff_messages.sql).

PgStore is the real store; MemoryStore is an offline double with the same contract, used only by unit tests and
never selected by configuration. The contact register holds an address only while a person is opted in. The message
log is append-only (a database trigger refuses UPDATE and DELETE) and never holds an address, provider body or key.
"""
import json
import os
import threading
from copy import deepcopy
from datetime import datetime, timezone
from uuid import UUID, uuid4

# Fixed advisory lock namespace for serialising one agency's cap count and queued-row insert (never the send).
SEND_LOCK_NAMESPACE = 7_311_402


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PgStore:
    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)

    def get_contact(self, subject: str) -> dict | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT subject, agency_id, email, roles, consent_at, opted_out_at, updated_at "
                        "FROM staff_contacts WHERE subject=%s", (subject,))
            row = cur.fetchone()
        return _contact(row) if row else None

    def save_contact(self, subject: str, agency_id: UUID, roles: list[str], email: str | None, *,
                     consent: bool | None) -> dict:
        """consent True opts in with `email`; False opts out (address removed); None refreshes roles and agency only."""
        with self._connect() as conn, conn.cursor() as cur:
            if consent is True:
                cur.execute(
                    """INSERT INTO staff_contacts (subject, agency_id, email, roles, consent_at, opted_out_at, updated_at)
                       VALUES (%s,%s,%s,%s,now(),NULL,now())
                       ON CONFLICT (subject) DO UPDATE SET agency_id=EXCLUDED.agency_id, email=EXCLUDED.email,
                         roles=EXCLUDED.roles, consent_at=now(), opted_out_at=NULL, updated_at=now()
                       RETURNING *""", (subject, str(agency_id), email, roles))
            elif consent is False:
                cur.execute(
                    """INSERT INTO staff_contacts (subject, agency_id, email, roles, consent_at, opted_out_at, updated_at)
                       VALUES (%s,%s,NULL,%s,NULL,now(),now())
                       ON CONFLICT (subject) DO UPDATE SET agency_id=EXCLUDED.agency_id, email=NULL,
                         roles=EXCLUDED.roles, consent_at=NULL, opted_out_at=now(), updated_at=now()
                       RETURNING *""", (subject, str(agency_id), roles))
            else:
                cur.execute(
                    """UPDATE staff_contacts SET agency_id=%s, roles=%s, email=CASE WHEN consent_at IS NULL THEN NULL ELSE %s END,
                         updated_at=now() WHERE subject=%s RETURNING *""", (str(agency_id), roles, email, subject))
            row = cur.fetchone()
        return _contact(row) if row else None

    def checker_contacts(self, agency_id: UUID, limit: int) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT subject, agency_id, email, roles, consent_at, opted_out_at, updated_at FROM staff_contacts
                   WHERE agency_id=%s AND consent_at IS NOT NULL AND opted_out_at IS NULL AND email IS NOT NULL
                     AND 'incident_checker' = ANY(roles)
                   ORDER BY subject LIMIT %s""", (str(agency_id), limit))
            return [_contact(row) for row in cur.fetchall()]

    def reserve(self, row: dict, *, hour_since: datetime, day_since: datetime, recipient_cap: int, agency_cap: int) -> str | None:
        """Short transaction: take the agency lock (2 s at most), count queued rows against both caps, insert the
        `queued` row and commit. Returns None when reserved, otherwise a fixed reason code. No provider call here."""
        import psycopg
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute("SET LOCAL lock_timeout = '2s'")
                cur.execute("SELECT pg_try_advisory_xact_lock(%s, hashtext(%s)) AS ok", (SEND_LOCK_NAMESPACE, str(row["agency_id"])))
                if not cur.fetchone()["ok"]:
                    return "send_lock_unavailable"
                base = "SELECT count(*) AS n FROM staff_message_log WHERE agency_id=%s AND state='queued' AND at >= %s"
                cur.execute(base + " AND recipient_subject=%s", (str(row["agency_id"]), hour_since, row["recipient_subject"]))
                if int(cur.fetchone()["n"]) >= recipient_cap:
                    return "recipient_cap"
                cur.execute(base, (str(row["agency_id"]), day_since))
                if int(cur.fetchone()["n"]) >= agency_cap:
                    return "agency_cap"
                _insert(cur, {**row, "state": "queued"})
        except psycopg.errors.LockNotAvailable:
            return "send_lock_unavailable"
        return None

    def add_log(self, row: dict) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            _insert(cur, row)

    def list_log(self, agency_id: UUID, limit: int) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT l.id::text, l.attempt_id::text, l.recipient_subject, l.template_id, l.params, l.state,
                          l.provider_status, l.reason, l.actor, l.at, c.email AS current_email
                   FROM staff_message_log l LEFT JOIN staff_contacts c ON c.subject=l.recipient_subject AND c.agency_id=l.agency_id
                   WHERE l.agency_id=%s ORDER BY l.at DESC LIMIT %s""", (str(agency_id), limit))
            return [dict(row) for row in cur.fetchall()]


def _insert(cur, row: dict) -> None:
    cur.execute(
        """INSERT INTO staff_message_log (id, attempt_id, agency_id, recipient_subject, template_id, params, state,
                                           provider_status, reason, actor)
           VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s)""",
        (str(uuid4()), str(row["attempt_id"]), str(row["agency_id"]), row["recipient_subject"], row["template_id"],
         json.dumps(row["params"]), row["state"], row.get("provider_status"), row.get("reason"), row["actor"]))


def _contact(row: dict) -> dict:
    return {**row, "agency_id": UUID(str(row["agency_id"])), "roles": list(row.get("roles") or [])}


class MemoryStore:
    """Offline double for tests. Same contract as PgStore; never selected by configuration."""

    def __init__(self):
        self.contacts: dict[str, dict] = {}
        self.log: list[dict] = []
        self._lock = threading.Lock()

    def get_contact(self, subject):
        row = self.contacts.get(subject)
        return deepcopy(row) if row else None

    def save_contact(self, subject, agency_id, roles, email, *, consent):
        now = _now()
        row = self.contacts.get(subject)
        if consent is None:
            if row is None:
                return None
            row.update(agency_id=agency_id, roles=list(roles), updated_at=now,
                       email=email if row["consent_at"] is not None else None)
        elif consent:
            row = {"subject": subject, "agency_id": agency_id, "roles": list(roles), "email": email,
                   "consent_at": now, "opted_out_at": None, "updated_at": now}
        else:
            row = {"subject": subject, "agency_id": agency_id, "roles": list(roles), "email": None,
                   "consent_at": None, "opted_out_at": now, "updated_at": now}
        if row["consent_at"] is not None and not row["email"]:
            raise ValueError("opted-in contact needs an address")
        self.contacts[subject] = row
        return deepcopy(row)

    def checker_contacts(self, agency_id, limit):
        rows = [r for r in self.contacts.values() if r["agency_id"] == agency_id and r["consent_at"] is not None
                and r["opted_out_at"] is None and r["email"] and "incident_checker" in r["roles"]]
        return deepcopy(sorted(rows, key=lambda r: r["subject"])[:limit])

    def reserve(self, row, *, hour_since, day_since, recipient_cap, agency_cap):
        if not self._lock.acquire(timeout=2):
            return "send_lock_unavailable"
        try:
            queued = [r for r in self.log if r["agency_id"] == row["agency_id"] and r["state"] == "queued"]
            if sum(1 for r in queued if r["at"] >= hour_since and r["recipient_subject"] == row["recipient_subject"]) >= recipient_cap:
                return "recipient_cap"
            if sum(1 for r in queued if r["at"] >= day_since) >= agency_cap:
                return "agency_cap"
            self.add_log({**row, "state": "queued"})
            return None
        finally:
            self._lock.release()

    def add_log(self, row):
        self.log.append({"id": str(uuid4()), "at": _now(), "provider_status": None, "reason": None, **deepcopy(row)})

    def list_log(self, agency_id, limit):
        rows = [r for r in reversed(self.log) if r["agency_id"] == agency_id][:limit]
        return [{**deepcopy(r), "current_email": (self.contacts.get(r["recipient_subject"]) or {}).get("email")} for r in rows]


_store = None


def get_store():
    global _store
    if _store is None:
        _store = PgStore()
    return _store


def set_store(store) -> None:
    global _store
    _store = store
