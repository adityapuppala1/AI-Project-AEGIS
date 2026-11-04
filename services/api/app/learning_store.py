"""Persistence for A8 post-event learning and A9 exercise drills (db/migrations/016_learning_drills.sql).

PgStore is the real store; MemoryStore is the offline double used by unit tests and never selected by
configuration. Every read and write of a window, proposal or drill is scoped by the caller's verified agency:
another agency's record is indistinguishable from a missing one. Audits are append-only. Applied trigger
config versions are platform-wide (the engine is shared) and written only by `apply_proposal`.
"""
import json
import os
import threading
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


PROPOSAL_COLUMNS = ("id", "agency_id", "window_id", "base_version", "new_version", "diff", "rationale", "status",
                    "maker_subject", "checker_subject", "decision_rationale", "applied_version", "applied_by",
                    "applied_at", "created_at", "updated_at")
WINDOW_COLUMNS = ("id", "agency_id", "hazard", "window_start", "window_end", "source", "basis", "config_version",
                  "observed_events", "stats", "closed_by", "closed_at")


def _clean(row: dict) -> dict:
    return {k: (str(v) if k in {"id", "agency_id", "window_id", "proposal_id"} and v is not None else _iso(v))
            for k, v in row.items()}


class PgStore:
    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, connect_timeout=4)

    @staticmethod
    def _audit(cur, agency_id, kind, subject_id, action, actor, detail):
        from psycopg.types.json import Jsonb
        cur.execute("""INSERT INTO learning_audit (id, agency_id, subject_kind, subject_id, action, actor, detail)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    (str(uuid4()), str(agency_id), kind, str(subject_id), action, actor, Jsonb(detail)))

    # --- windows ---------------------------------------------------------------------------------
    def create_window(self, row: dict, action: str) -> dict:
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO learning_windows (id, agency_id, hazard, window_start, window_end, source, basis,
                           config_version, observed_events, stats, closed_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (row["id"], str(row["agency_id"]), row["hazard"], row["window_start"], row["window_end"],
                         row["source"], row["basis"], row["config_version"], Jsonb(row["observed_events"]),
                         Jsonb(row["stats"]), row["closed_by"]))
            self._audit(cur, row["agency_id"], "window", row["id"], action, row["closed_by"],
                        {"source": row["source"], "basis": row["basis"], "hazard": row["hazard"]})
        return self.get_window(row["id"], row["agency_id"])

    def get_window(self, window_id, agency_id) -> dict | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT {', '.join(WINDOW_COLUMNS)} FROM learning_windows WHERE id=%s AND agency_id=%s",
                        (str(window_id), str(agency_id)))
            row = cur.fetchone()
        return _clean(dict(row)) if row else None

    def list_windows(self, agency_id, limit=50) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(f"""SELECT {', '.join(WINDOW_COLUMNS)} FROM learning_windows WHERE agency_id=%s
                            ORDER BY closed_at DESC, id LIMIT %s""", (str(agency_id), limit))
            return [_clean(dict(r)) for r in cur.fetchall()]

    def triggers_between(self, hazard, start, end, limit=5000) -> list[dict]:
        """Read-only: stored trigger events of one hazard whose fired_at day (UTC) lies in [start, end]."""
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id::text, trigger_id, config_version, state, fired_at FROM hazard_trigger_events
                           WHERE hazard=%s AND (fired_at AT TIME ZONE 'UTC')::date BETWEEN %s AND %s
                           ORDER BY fired_at, id LIMIT %s""", (hazard, start, end, limit))
            return [dict(r) for r in cur.fetchall()]

    # --- proposals -------------------------------------------------------------------------------
    def create_proposal(self, row: dict) -> dict:
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO threshold_proposals (id, agency_id, window_id, base_version, new_version, diff,
                           rationale, status, maker_subject) VALUES (%s,%s,%s,%s,%s,%s,%s,'draft',%s)""",
                        (row["id"], str(row["agency_id"]), row["window_id"], row["base_version"], row["new_version"],
                         Jsonb(row["diff"]), Jsonb(row["rationale"]), row["maker_subject"]))
            self._audit(cur, row["agency_id"], "proposal", row["id"], "create", row["maker_subject"],
                        {"new_version": row["new_version"], "window_id": row["window_id"]})
        return self.get_proposal(row["id"], row["agency_id"])

    def get_proposal(self, proposal_id, agency_id) -> dict | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT {', '.join(PROPOSAL_COLUMNS)} FROM threshold_proposals WHERE id=%s AND agency_id=%s",
                        (str(proposal_id), str(agency_id)))
            row = cur.fetchone()
        return _clean(dict(row)) if row else None

    def list_proposals(self, agency_id, limit=50) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(f"""SELECT {', '.join(PROPOSAL_COLUMNS)} FROM threshold_proposals WHERE agency_id=%s
                            ORDER BY created_at DESC, id LIMIT %s""", (str(agency_id), limit))
            return [_clean(dict(r)) for r in cur.fetchall()]

    def update_proposal(self, proposal_id, agency_id, mutate, actor) -> tuple[dict, bool]:
        """Row-locked transition; `mutate(row) -> (changes, action, detail)` commits with its audit row.
        `changes` None means an idempotent retry (no write, no audit)."""
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(f"""SELECT {', '.join(PROPOSAL_COLUMNS)} FROM threshold_proposals WHERE id=%s AND agency_id=%s
                            FOR UPDATE""", (str(proposal_id), str(agency_id)))
            row = cur.fetchone()
            if row is None:
                raise KeyError("proposal_not_found")
            changes, action, detail = mutate(_clean(dict(row)))
            if changes is None:
                return _clean(dict(row)), False
            sets = ", ".join(f"{key}=%s" for key in changes)
            cur.execute(f"UPDATE threshold_proposals SET {sets}, updated_at=now() WHERE id=%s",
                        (*changes.values(), str(proposal_id)))
            self._audit(cur, agency_id, "proposal", proposal_id, action, actor, detail)
        return self.get_proposal(proposal_id, agency_id), True

    def apply_proposal(self, proposal_id, agency_id, version_row: dict, actor, detail) -> dict:
        """One transaction: lock the approved proposal, insert the config version, mark it applied, audit."""
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT status, applied_version FROM threshold_proposals WHERE id=%s AND agency_id=%s
                           FOR UPDATE""", (str(proposal_id), str(agency_id)))
            row = cur.fetchone()
            if row is None:
                raise KeyError("proposal_not_found")
            if row["status"] != "approved" or row["applied_version"] is not None:
                raise ValueError("proposal_not_applicable")
            # Serialise concurrent applies (also when no version exists yet), so a stale base can never win.
            cur.execute("LOCK TABLE trigger_config_versions IN SHARE ROW EXCLUSIVE MODE")
            cur.execute("SELECT version_id FROM trigger_config_versions ORDER BY applied_at DESC, version_id LIMIT 1")
            latest = cur.fetchone()
            if (latest["version_id"] if latest else None) != version_row["expected_current"]:
                raise ValueError("base_version_stale")
            cur.execute("""INSERT INTO trigger_config_versions (version_id, base_version, overrides, proposal_id, applied_by)
                           VALUES (%s,%s,%s,%s,%s)""",
                        (version_row["version_id"], version_row["base_version"], Jsonb(version_row["overrides"]),
                         str(proposal_id), actor))
            cur.execute("""UPDATE threshold_proposals SET applied_version=%s, applied_by=%s, applied_at=now(), updated_at=now()
                           WHERE id=%s""", (version_row["version_id"], actor, str(proposal_id)))
            self._audit(cur, agency_id, "config", version_row["version_id"], "apply", actor, detail)
        return self.get_proposal(proposal_id, agency_id)

    def latest_config_version(self) -> dict | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT version_id, base_version, overrides, proposal_id::text, applied_by, applied_at
                           FROM trigger_config_versions ORDER BY applied_at DESC, version_id LIMIT 1""")
            row = cur.fetchone()
        return _clean(dict(row)) if row else None

    def list_config_versions(self, limit=20) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT version_id, base_version, overrides, proposal_id::text, applied_by, applied_at
                           FROM trigger_config_versions ORDER BY applied_at DESC, version_id LIMIT %s""", (limit,))
            return [_clean(dict(r)) for r in cur.fetchall()]

    def audit_for(self, subject_ids, agency_id) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT subject_kind, subject_id, action, actor, detail, at FROM learning_audit
                           WHERE agency_id=%s AND subject_id = ANY(%s) ORDER BY at, id""",
                        (str(agency_id), [str(s) for s in subject_ids]))
            return [_clean(dict(r)) for r in cur.fetchall()]

    # --- drills ----------------------------------------------------------------------------------
    def create_drill(self, drill_id, agency_id, scenario_id, state, actor, detail) -> None:
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO exercise_drills (id, agency_id, exercise, scenario_id, state, created_by)
                           VALUES (%s,%s,true,%s,%s,%s)""", (drill_id, str(agency_id), scenario_id, Jsonb(state), actor))
            cur.execute("""INSERT INTO exercise_drill_audit (id, drill_id, action, actor, sim_minute, detail)
                           VALUES (%s,%s,'create',%s,0,%s)""", (str(uuid4()), drill_id, actor, Jsonb(detail)))

    def get_drill(self, drill_id, agency_id) -> dict | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT state FROM exercise_drills WHERE id=%s AND agency_id=%s AND exercise",
                        (str(drill_id), str(agency_id)))
            row = cur.fetchone()
        return row["state"] if row else None

    def list_drills(self, agency_id, limit=30) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT state FROM exercise_drills WHERE agency_id=%s AND exercise
                           ORDER BY created_at DESC, id LIMIT %s""", (str(agency_id), limit))
            return [r["state"] for r in cur.fetchall()]

    def update_drill(self, drill_id, agency_id, mutate, actor) -> tuple[dict, bool]:
        from psycopg.types.json import Jsonb
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT state FROM exercise_drills WHERE id=%s AND agency_id=%s AND exercise FOR UPDATE",
                        (str(drill_id), str(agency_id)))
            row = cur.fetchone()
            if row is None:
                raise KeyError("drill_not_found")
            state, changed, action, detail = mutate(row["state"])
            if changed:
                cur.execute("UPDATE exercise_drills SET state=%s, updated_at=now() WHERE id=%s", (Jsonb(state), str(drill_id)))
                cur.execute("""INSERT INTO exercise_drill_audit (id, drill_id, action, actor, sim_minute, detail)
                               VALUES (%s,%s,%s,%s,%s,%s)""",
                            (str(uuid4()), str(drill_id), action, actor, int(state.get("sim_minute", 0)), Jsonb(detail)))
        return state, changed

    def drill_audit(self, drill_id) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT action, actor, sim_minute, detail, at FROM exercise_drill_audit WHERE drill_id=%s ORDER BY at, id",
                        (str(drill_id),))
            return [_clean(dict(r)) for r in cur.fetchall()]


class MemoryStore:
    """Offline double with PgStore semantics: agency scoping, row-level transitions, append-only audits and the
    016 CHECK constraints (checker differs from maker, no system: subjects, apply only when approved)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.windows: dict = {}
        self.proposals: dict = {}
        self.versions: list = []
        self.audit: list = []
        self.drills: dict = {}
        self.drill_agency: dict = {}
        self.drill_audits: list = []
        self.trigger_rows: list = []  # test helper: rows returned by triggers_between

    def _add_audit(self, agency_id, kind, subject_id, action, actor, detail):
        self.audit.append({"subject_kind": kind, "subject_id": str(subject_id), "action": action, "actor": actor,
                           "agency_id": str(agency_id), "detail": json.loads(json.dumps(detail)), "at": _now().isoformat()})

    @staticmethod
    def _check_subject(subject):
        if subject is not None and str(subject).lower().startswith("system:"):
            raise ValueError("check_violation_system_subject")

    def create_window(self, row, action) -> dict:
        self._check_subject(row["closed_by"])
        with self.lock:
            stored = {**json.loads(json.dumps({k: _iso(v) for k, v in row.items()}, default=str)), "agency_id": str(row["agency_id"]),
                      "closed_at": _now().isoformat()}
            self.windows[row["id"]] = stored
            self._add_audit(row["agency_id"], "window", row["id"], action, row["closed_by"],
                            {"source": row["source"], "basis": row["basis"], "hazard": row["hazard"]})
        return deepcopy(stored)

    def get_window(self, window_id, agency_id):
        row = self.windows.get(str(window_id))
        return deepcopy(row) if row and row["agency_id"] == str(agency_id) else None

    def list_windows(self, agency_id, limit=50):
        rows = [deepcopy(r) for r in self.windows.values() if r["agency_id"] == str(agency_id)]
        return sorted(rows, key=lambda r: r["closed_at"], reverse=True)[:limit]

    def triggers_between(self, hazard, start, end, limit=5000):
        out = [deepcopy(r) for r in self.trigger_rows if r.get("hazard", hazard) == hazard
               and start <= r["fired_at"].date() <= end]
        return sorted(out, key=lambda r: (r["fired_at"], r["id"]))[:limit]

    def create_proposal(self, row) -> dict:
        self._check_subject(row["maker_subject"])
        with self.lock:
            stored = {**json.loads(json.dumps(row, default=str)), "agency_id": str(row["agency_id"]), "status": "draft",
                      "checker_subject": None, "decision_rationale": None, "applied_version": None, "applied_by": None,
                      "applied_at": None, "created_at": _now().isoformat(), "updated_at": _now().isoformat()}
            self.proposals[row["id"]] = stored
            self._add_audit(row["agency_id"], "proposal", row["id"], "create", row["maker_subject"],
                            {"new_version": row["new_version"], "window_id": row["window_id"]})
        return deepcopy(stored)

    def get_proposal(self, proposal_id, agency_id):
        row = self.proposals.get(str(proposal_id))
        return deepcopy(row) if row and row["agency_id"] == str(agency_id) else None

    def list_proposals(self, agency_id, limit=50):
        rows = [deepcopy(r) for r in self.proposals.values() if r["agency_id"] == str(agency_id)]
        return sorted(rows, key=lambda r: r["created_at"], reverse=True)[:limit]

    def update_proposal(self, proposal_id, agency_id, mutate, actor):
        with self.lock:
            row = self.get_proposal(proposal_id, agency_id)
            if row is None:
                raise KeyError("proposal_not_found")
            changes, action, detail = mutate(deepcopy(row))
            if changes is None:
                return row, False
            merged = {**row, **changes}
            self._check_subject(merged.get("checker_subject"))
            if merged.get("checker_subject") is not None and merged["checker_subject"] == merged["maker_subject"]:
                raise ValueError("check_violation_same_subject")
            merged["updated_at"] = _now().isoformat()
            self.proposals[str(proposal_id)] = merged
            self._add_audit(agency_id, "proposal", proposal_id, action, actor, detail)
        return deepcopy(merged), True

    def apply_proposal(self, proposal_id, agency_id, version_row, actor, detail):
        self._check_subject(actor)
        with self.lock:
            row = self.get_proposal(proposal_id, agency_id)
            if row is None:
                raise KeyError("proposal_not_found")
            if row["status"] != "approved" or row["applied_version"] is not None:
                raise ValueError("proposal_not_applicable")
            latest = self.versions[-1]["version_id"] if self.versions else None
            if latest != version_row["expected_current"]:
                raise ValueError("base_version_stale")
            if any(v["version_id"] == version_row["version_id"] for v in self.versions):
                raise ValueError("version_exists")
            self.versions.append({"version_id": version_row["version_id"], "base_version": version_row["base_version"],
                                  "overrides": deepcopy(version_row["overrides"]), "proposal_id": str(proposal_id),
                                  "applied_by": actor, "applied_at": _now().isoformat()})
            row.update(applied_version=version_row["version_id"], applied_by=actor, applied_at=_now().isoformat())
            self.proposals[str(proposal_id)] = row
            self._add_audit(agency_id, "config", version_row["version_id"], "apply", actor, detail)
        return deepcopy(row)

    def latest_config_version(self):
        return deepcopy(self.versions[-1]) if self.versions else None

    def list_config_versions(self, limit=20):
        return deepcopy(list(reversed(self.versions))[:limit])

    def audit_for(self, subject_ids, agency_id):
        wanted = {str(s) for s in subject_ids}
        return [deepcopy(r) for r in self.audit if r["subject_id"] in wanted and r["agency_id"] == str(agency_id)]

    def create_drill(self, drill_id, agency_id, scenario_id, state, actor, detail):
        self._check_subject(actor)
        if state.get("exercise") is not True:
            raise ValueError("check_violation_exercise")
        with self.lock:
            self.drills[drill_id] = deepcopy(state)
            self.drill_agency[drill_id] = str(agency_id)
            self.drill_audits.append({"drill_id": drill_id, "action": "create", "actor": actor, "sim_minute": 0,
                                      "detail": deepcopy(detail), "at": _now().isoformat()})

    def get_drill(self, drill_id, agency_id):
        return deepcopy(self.drills[str(drill_id)]) if self.drill_agency.get(str(drill_id)) == str(agency_id) else None

    def list_drills(self, agency_id, limit=30):
        rows = [deepcopy(s) for d, s in self.drills.items() if self.drill_agency.get(d) == str(agency_id)]
        return sorted(rows, key=lambda s: s.get("created_at") or "", reverse=True)[:limit]

    def update_drill(self, drill_id, agency_id, mutate, actor):
        with self.lock:
            if self.drill_agency.get(str(drill_id)) != str(agency_id):
                raise KeyError("drill_not_found")
            state, changed, action, detail = mutate(deepcopy(self.drills[str(drill_id)]))
            if changed:
                if state.get("exercise") is not True:
                    raise ValueError("check_violation_exercise")
                self.drills[str(drill_id)] = deepcopy(state)
                self.drill_audits.append({"drill_id": str(drill_id), "action": action, "actor": actor,
                                          "sim_minute": int(state.get("sim_minute", 0)), "detail": deepcopy(detail),
                                          "at": _now().isoformat()})
        return state, changed

    def drill_audit(self, drill_id):
        return [deepcopy(r) for r in self.drill_audits if r["drill_id"] == str(drill_id)]


_store = None


def get_store():
    global _store
    if _store is None:
        _store = PgStore()
    return _store


def set_store(store) -> None:
    global _store
    _store = store
