"""Persistence for the opt-in proactive watch (db/migrations/012_proactive.sql, 013_proactive_run_agency.sql).

PgStore is the real store. MemoryStore is an offline double with the same contract used by
unit tests; it is never selected by configuration. Evidence, triggers and audits are append-only.
Run reads and writes are scoped by the operator's verified agency: a NULL (legacy) agency_id never
matches, so pre-013 runs are invisible to every scoped route.
"""
import json
import os
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4


class VersionConflict(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _month_start() -> datetime:
    now = _now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class PgStore:
    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)

    def list_configs(self) -> dict:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT connector_id, enabled, settings, version, updated_at, updated_by FROM connector_config")
            configs = {row["connector_id"]: dict(row) for row in cur.fetchall()}
            cur.execute("SELECT connector_id, key_name, fingerprint FROM connector_secrets")
            secrets: dict = {}
            for row in cur.fetchall():
                secrets.setdefault(row["connector_id"], {})[row["key_name"]] = row["fingerprint"]
            cur.execute("""SELECT DISTINCT ON (connector_id) connector_id, ok, detail, at FROM connector_audit
                           WHERE action='test' AND NOT (detail ? 'input_tokens') ORDER BY connector_id, at DESC""")
            tests = {row["connector_id"]: dict(row) for row in cur.fetchall()}
        return {"configs": configs, "secrets": secrets, "tests": tests}

    def get_secret(self, connector_id: str, key_name: str):
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT ciphertext, nonce FROM connector_secrets WHERE connector_id=%s AND key_name=%s",
                        (connector_id, key_name))
            row = cur.fetchone()
        return (bytes(row["ciphertext"]), bytes(row["nonce"])) if row else None

    def save_connector(self, connector_id, expected_version, enabled, settings, secret_ops, actor, audits) -> None:
        """One transaction: optimistic config update, secret writes/clears and their audit rows."""
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT version FROM connector_config WHERE connector_id=%s FOR UPDATE", (connector_id,))
            row = cur.fetchone()
            current = row["version"] if row else 0
            if current != expected_version:
                raise VersionConflict("version_mismatch")
            cur.execute("""INSERT INTO connector_config (connector_id, enabled, settings, version, updated_at, updated_by)
                           VALUES (%s,%s,%s,%s,now(),%s)
                           ON CONFLICT (connector_id) DO UPDATE SET enabled=EXCLUDED.enabled, settings=EXCLUDED.settings,
                           version=EXCLUDED.version, updated_at=now(), updated_by=EXCLUDED.updated_by""",
                        (connector_id, enabled, Jsonb(settings), current + 1, actor))
            for name, op in secret_ops.items():
                if op is None:
                    cur.execute("DELETE FROM connector_secrets WHERE connector_id=%s AND key_name=%s", (connector_id, name))
                else:
                    ciphertext, nonce, fp, key_version = op
                    cur.execute("""INSERT INTO connector_secrets (connector_id, key_name, ciphertext, nonce, key_version,
                                   fingerprint, updated_at, updated_by) VALUES (%s,%s,%s,%s,%s,%s,now(),%s)
                                   ON CONFLICT (connector_id, key_name) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,
                                   nonce=EXCLUDED.nonce, key_version=EXCLUDED.key_version, fingerprint=EXCLUDED.fingerprint,
                                   updated_at=now(), updated_by=EXCLUDED.updated_by""",
                                (connector_id, name, ciphertext, nonce, key_version, fp, actor))
            for action, ok, detail in audits:
                cur.execute("INSERT INTO connector_audit (id, connector_id, action, ok, detail, actor) VALUES (%s,%s,%s,%s,%s,%s)",
                            (str(uuid4()), connector_id, action, ok, Jsonb(detail), actor))

    def add_audit(self, connector_id, action, ok, detail, actor) -> None:
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO connector_audit (id, connector_id, action, ok, detail, actor) VALUES (%s,%s,%s,%s,%s,%s)",
                        (str(uuid4()), connector_id, action, ok, Jsonb(detail), actor))

    def list_audit(self, connector_id, limit=50) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id::text, connector_id, action, ok, detail, actor, at FROM connector_audit
                           WHERE connector_id=%s ORDER BY at DESC, id LIMIT %s""", (connector_id, limit))
            return [{**row, "at": row["at"].isoformat()} for row in cur.fetchall()]

    def monthly_input_tokens(self, connector_id) -> int:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT COALESCE(SUM((detail->>'input_tokens')::bigint),0) AS n FROM connector_audit
                           WHERE connector_id=%s AND at >= %s AND detail ? 'input_tokens'""", (connector_id, _month_start()))
            return int(cur.fetchone()["n"])

    def insert_evidence(self, rows: list[dict]) -> int:
        from psycopg.types.json import Jsonb
        added = 0
        with self._connect() as conn, conn.cursor() as cur:
            for row in rows:
                cur.execute("""INSERT INTO hazard_evidence (id, connector_id, hazard, observed_at, lat, lon, value, unit,
                               payload, sha256, source_url) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                               ON CONFLICT (sha256) DO NOTHING RETURNING id""",
                            (row["id"], row["connector_id"], row["hazard"], row["observed_at"], row["lat"], row["lon"],
                             row["value"], row["unit"], Jsonb(row.get("payload") or {}), row["sha256"], row.get("source_url")))
                added += cur.fetchone() is not None
        return added

    def evidence_by_sha(self, digests: list[str]) -> dict:
        if not digests:
            return {}
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT id::text, sha256 FROM hazard_evidence WHERE sha256 = ANY(%s)", (digests,))
            return {row["sha256"]: row["id"] for row in cur.fetchall()}

    def list_evidence(self, limit=500, ids=None) -> list[dict]:
        sql = """SELECT id::text, connector_id, hazard, observed_at, lat, lon, value, unit, payload, retrieved_at, sha256
                 FROM hazard_evidence"""
        with self._connect() as conn, conn.cursor() as cur:
            if ids is not None:
                cur.execute(sql + " WHERE id = ANY(%s::uuid[]) ORDER BY retrieved_at DESC LIMIT %s", (list(ids), limit))
            else:
                cur.execute(sql + " ORDER BY retrieved_at DESC, id LIMIT %s", (limit,))
            return [dict(row) for row in cur.fetchall()]

    def insert_trigger(self, row: dict) -> None:
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO hazard_trigger_events (id, trigger_id, config_version, hazard, state, fired_at,
                           lat, lon, score, evidence_ids, rationale) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::uuid[],%s)""",
                        (row["id"], row["trigger_id"], row["config_version"], row["hazard"], row["state"], row["fired_at"],
                         row["lat"], row["lon"], row["score"], row["evidence_ids"], Jsonb(row["rationale"])))

    def _trigger_rows(self, cur) -> list[dict]:
        return [{**row, "evidence_ids": [str(v) for v in row["evidence_ids"] or []]} for row in cur.fetchall()]

    def list_triggers(self, limit=200) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT DISTINCT ON (trigger_id) id::text, trigger_id, config_version, hazard, state, fired_at,
                           lat, lon, score, evidence_ids, rationale FROM hazard_trigger_events
                           WHERE fired_at > now() - interval '2 days' ORDER BY trigger_id, fired_at DESC LIMIT %s""", (limit,))
            return self._trigger_rows(cur)

    def get_trigger(self, trigger_event_id) -> dict | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id::text, trigger_id, config_version, hazard, state, fired_at, lat, lon, score,
                           evidence_ids, rationale FROM hazard_trigger_events WHERE id=%s""", (str(trigger_event_id),))
            rows = self._trigger_rows(cur)
        return rows[0] if rows else None

    def trigger_history(self, days: int) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT to_char(date_trunc('day', fired_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, hazard, state,
                           COUNT(*)::int AS count FROM hazard_trigger_events WHERE fired_at > now() - make_interval(days => %s)
                           GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""", (days,))
            return [dict(row) for row in cur.fetchall()]

    def create_run(self, run_id, trigger_event_id, state, actor, audit_detail, agency_id) -> None:
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO proactive_runs (id, trigger_event_id, state, created_by, agency_id) VALUES (%s,%s,%s,%s,%s)",
                        (run_id, str(trigger_event_id), Jsonb(state), actor, str(agency_id)))
            cur.execute("INSERT INTO proactive_run_audit (id, run_id, step, actor, detail) VALUES (%s,%s,'start',%s,%s)",
                        (str(uuid4()), run_id, actor, Jsonb(audit_detail)))

    def get_run(self, run_id, agency_id) -> dict | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT state FROM proactive_runs WHERE id=%s AND agency_id=%s", (str(run_id), str(agency_id)))
            row = cur.fetchone()
        return row["state"] if row else None

    def list_runs(self, agency_id, limit=50) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT state FROM proactive_runs WHERE agency_id=%s ORDER BY created_at DESC, id LIMIT %s",
                        (str(agency_id), limit))
            return [row["state"] for row in cur.fetchall()]

    def update_run(self, run_id, mutate, actor, agency_id) -> tuple[dict, bool]:
        """Row-locked read-modify-write; `mutate(state) -> (state, changed, step, detail)` and the audit commit together."""
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT state FROM proactive_runs WHERE id=%s AND agency_id=%s FOR UPDATE",
                        (str(run_id), str(agency_id)))
            row = cur.fetchone()
            if row is None:
                raise KeyError("run_not_found")
            state, changed, step, detail = mutate(row["state"])
            if changed:
                cur.execute("UPDATE proactive_runs SET state=%s, updated_at=now() WHERE id=%s", (Jsonb(state), str(run_id)))
                cur.execute("INSERT INTO proactive_run_audit (id, run_id, step, actor, detail) VALUES (%s,%s,%s,%s,%s)",
                            (str(uuid4()), str(run_id), step, actor, Jsonb(detail)))
        return state, changed

    def run_audit(self, run_id) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT step, actor, at, detail FROM proactive_run_audit WHERE run_id=%s ORDER BY at, id", (str(run_id),))
            return [{**row, "at": row["at"].isoformat()} for row in cur.fetchall()]

    def get_pause(self) -> dict:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT paused, reason, updated_at, updated_by FROM proactive_pause WHERE id")
            row = cur.fetchone()
        if row is None:
            raise RuntimeError("pause_row_missing")
        return dict(row)

    def set_pause(self, paused, reason, actor) -> dict:
        """Kill-switch change and its audit row commit together."""
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE proactive_pause SET paused=%s, reason=%s, updated_at=now(), updated_by=%s WHERE id
                           RETURNING paused, reason, updated_at, updated_by""", (paused, reason, actor))
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("pause_row_missing")
            cur.execute("INSERT INTO proactive_pause_audit (id, paused, reason, actor) VALUES (%s,%s,%s,%s)",
                        (str(uuid4()), paused, reason, actor))
        return dict(row)

    def pause_audit(self, limit=20) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT paused, reason, actor, at FROM proactive_pause_audit ORDER BY at DESC, id LIMIT %s", (limit,))
            return [{**row, "at": row["at"].isoformat()} for row in cur.fetchall()]


class MemoryStore:
    """Offline test double with PgStore semantics (optimistic versions, sha256 dedupe, append-only audit)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.configs: dict = {}
        self.secrets: dict = {}
        self.audit: list = []
        self.evidence: list = []
        self.triggers: list = []
        self.runs: dict = {}
        self.run_agency: dict = {}
        self.run_audits: list = []
        self.pause = {"paused": False, "reason": None, "updated_at": _now(), "updated_by": None}
        self.pause_audits: list = []

    def list_configs(self) -> dict:
        tests = {}
        for row in self.audit:
            if row["action"] == "test" and "input_tokens" not in row["detail"]:
                tests[row["connector_id"]] = row
        return {"configs": deepcopy(self.configs),
                "secrets": {cid: {k: v[2] for k, v in items.items()} for cid, items in self.secrets.items()},
                "tests": deepcopy(tests)}

    def get_secret(self, connector_id, key_name):
        value = self.secrets.get(connector_id, {}).get(key_name)
        return (value[0], value[1]) if value else None

    def save_connector(self, connector_id, expected_version, enabled, settings, secret_ops, actor, audits) -> None:
        with self.lock:
            current = self.configs.get(connector_id, {}).get("version", 0)
            if current != expected_version:
                raise VersionConflict("version_mismatch")
            self.configs[connector_id] = {"connector_id": connector_id, "enabled": enabled, "settings": deepcopy(settings),
                                          "version": current + 1, "updated_at": _now(), "updated_by": actor}
            for name, op in secret_ops.items():
                if op is None:
                    self.secrets.get(connector_id, {}).pop(name, None)
                else:
                    self.secrets.setdefault(connector_id, {})[name] = (op[0], op[1], op[2])
            for action, ok, detail in audits:
                self.add_audit(connector_id, action, ok, detail, actor)

    def add_audit(self, connector_id, action, ok, detail, actor) -> None:
        if action not in {"save", "clear_secret", "test", "enable", "disable"}:
            raise ValueError("invalid audit action")
        self.audit.append({"id": str(uuid4()), "connector_id": connector_id, "action": action, "ok": ok,
                           "detail": json.loads(json.dumps(detail)), "actor": actor, "at": _now()})

    def list_audit(self, connector_id, limit=50) -> list[dict]:
        rows = [r for r in reversed(self.audit) if r["connector_id"] == connector_id][:limit]
        return [{**r, "at": r["at"].isoformat()} for r in rows]

    def monthly_input_tokens(self, connector_id) -> int:
        start = _month_start()
        return sum(int(r["detail"]["input_tokens"]) for r in self.audit
                   if r["connector_id"] == connector_id and r["at"] >= start and "input_tokens" in r["detail"])

    def insert_evidence(self, rows) -> int:
        known = {r["sha256"] for r in self.evidence}
        added = 0
        for row in rows:
            if row["sha256"] in known:
                continue
            known.add(row["sha256"])
            self.evidence.append({**deepcopy(row), "retrieved_at": row.get("retrieved_at") or _now()})
            added += 1
        return added

    def evidence_by_sha(self, digests) -> dict:
        wanted = set(digests)
        return {r["sha256"]: r["id"] for r in self.evidence if r["sha256"] in wanted}

    def list_evidence(self, limit=500, ids=None) -> list[dict]:
        rows = sorted(self.evidence, key=lambda r: r["retrieved_at"], reverse=True)
        if ids is not None:
            wanted = set(ids)
            rows = [r for r in rows if r["id"] in wanted]
        return deepcopy(rows[:limit])

    def insert_trigger(self, row) -> None:
        self.triggers.append(deepcopy(row))

    def list_triggers(self, limit=200) -> list[dict]:
        latest: dict = {}
        for row in self.triggers:
            if row["trigger_id"] not in latest or row["fired_at"] >= latest[row["trigger_id"]]["fired_at"]:
                latest[row["trigger_id"]] = row
        return deepcopy(list(latest.values())[:limit])

    def get_trigger(self, trigger_event_id):
        return next((deepcopy(r) for r in self.triggers if r["id"] == str(trigger_event_id)), None)

    def trigger_history(self, days) -> list[dict]:
        cutoff = _now() - timedelta(days=days)
        counts: dict = {}
        for row in self.triggers:
            if row["fired_at"] > cutoff:
                key = (row["fired_at"].strftime("%Y-%m-%d"), row["hazard"], row["state"])
                counts[key] = counts.get(key, 0) + 1
        return [{"day": d, "hazard": h, "state": s, "count": n} for (d, h, s), n in sorted(counts.items())]

    def create_run(self, run_id, trigger_event_id, state, actor, audit_detail, agency_id) -> None:
        self.runs[run_id] = deepcopy(state)
        self.run_agency[run_id] = str(agency_id)
        self.run_audits.append({"run_id": run_id, "step": "start", "actor": actor, "at": _now().isoformat(),
                                "detail": deepcopy(audit_detail)})

    def _visible(self, run_id, agency_id) -> bool:
        # A missing (legacy NULL) agency never matches, mirroring `agency_id=%s` in SQL.
        owner = self.run_agency.get(str(run_id))
        return str(run_id) in self.runs and owner is not None and owner == str(agency_id)

    def get_run(self, run_id, agency_id):
        return deepcopy(self.runs[str(run_id)]) if self._visible(run_id, agency_id) else None

    def list_runs(self, agency_id, limit=50) -> list[dict]:
        rows = [deepcopy(s) for rid, s in self.runs.items() if self._visible(rid, agency_id)]
        return sorted(rows, key=lambda s: s.get("created_at") or "", reverse=True)[:limit]

    def update_run(self, run_id, mutate, actor, agency_id):
        with self.lock:
            if not self._visible(run_id, agency_id):
                raise KeyError("run_not_found")
            state, changed, step, detail = mutate(deepcopy(self.runs[str(run_id)]))
            if changed:
                self.runs[str(run_id)] = deepcopy(state)
                self.run_audits.append({"run_id": str(run_id), "step": step, "actor": actor,
                                        "at": _now().isoformat(), "detail": deepcopy(detail)})
        return state, changed

    def run_audit(self, run_id) -> list[dict]:
        return [deepcopy(r) for r in self.run_audits if r["run_id"] == str(run_id)]

    def get_pause(self) -> dict:
        return deepcopy(self.pause)

    def set_pause(self, paused, reason, actor) -> dict:
        if not 10 <= len(reason) <= 500:
            raise ValueError("invalid pause reason")
        with self.lock:
            self.pause = {"paused": paused, "reason": reason, "updated_at": _now(), "updated_by": actor}
            self.pause_audits.append({"paused": paused, "reason": reason, "actor": actor, "at": _now().isoformat()})
        return deepcopy(self.pause)

    def pause_audit(self, limit=20) -> list[dict]:
        return deepcopy(list(reversed(self.pause_audits))[:limit])


_store = None


def get_store():
    global _store
    if _store is None:
        _store = PgStore()
    return _store


def set_store(store) -> None:
    global _store
    _store = store
