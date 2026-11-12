"""Transactional storage for the team response loop (docs/RESPONSE_LOOP.md). Exercise only; no transport.

Scope (agency, department, team, actor) always comes from the verified operator via the router. Every write is
one transaction: lock, check scope and state, then write request, report, incident timeline line and audit event
together. Team capacity is serialised with a per-team transaction advisory lock.
"""
import json
import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

from app import response_loop as rules
from app.governance import DecisionError

SIM_VERSIONS = ("aegis.proposal.simulation.v2", "aegis.proposal.simulation.v3")
_ACTIVE_SQL = "('requested','accepted','en_route','on_site')"
_LIMIT = 100


def task_has_active_requests(cur, proposal_id: str, task_id: str) -> bool:
    """Used by workflow_store.transition (close_task) inside its locked transaction."""
    cur.execute(f"SELECT 1 FROM exercise_team_requests WHERE proposal_id=%s AND task_id=%s AND state IN {_ACTIVE_SQL} LIMIT 1",
                (proposal_id, task_id))
    return cur.fetchone() is not None


def _team_lock(cur, agency_id: UUID, team_id: str) -> None:
    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"aegis-team-capacity:{agency_id}:{team_id}",))


def _valid_receipt(receipt) -> bool:
    return (isinstance(receipt, dict) and receipt.get("version") in SIM_VERSIONS and receipt.get("synthetic") is True
            and receipt.get("outbound_messages_sent") is False and receipt.get("operational_actions_enabled") is False
            and receipt.get("acknowledgements_are_scripted") is True)


def _task_for_department(row: dict, task_id: str, department_id: str) -> dict:
    """Approved-only gate plus the desk's own task. Another desk's task is reported as not found."""
    if row["status"] != "approved":
        raise DecisionError("Independent approval is required before requesting a team")
    receipt = row["proposal"].get("simulation")
    if not _valid_receipt(receipt):
        raise DecisionError("Prepare staged exercise tasks on a new approved proposal")
    task = next((t for t in receipt.get("tasks", []) if t.get("id") == task_id), None)
    if task is None or task.get("assigned_department", task_id) != department_id:
        raise LookupError("Exercise task not found")
    return task


def _active_counts(cur, agency_id: UUID) -> dict[str, int]:
    cur.execute(f"""SELECT team_id, COUNT(*) AS n FROM exercise_team_requests
                    WHERE agency_id=%s AND state IN {_ACTIVE_SQL} GROUP BY team_id""", (str(agency_id),))
    return {r["team_id"]: int(r["n"]) for r in cur.fetchall()}


def _proposal_row(cur, proposal_id: str, agency_id: UUID, lock: bool) -> dict:
    cur.execute(
        """SELECT p.id::text, p.incident_id::text, p.status, p.proposal, i.hazard_type,
                  ST_Y(i.location) AS lat, ST_X(i.location) AS lon
           FROM action_proposals AS p JOIN incidents AS i ON i.id = p.incident_id
           WHERE p.id=%s AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE""" + (" FOR UPDATE OF p" if lock else ""),
        (proposal_id, str(agency_id)))
    row = cur.fetchone()
    if row is None:
        raise LookupError("Exercise task not found")
    return row


def _point(row: dict) -> dict | None:
    lat, lon = row.get("lat"), row.get("lon")
    return {"lat": float(lat), "lon": float(lon)} if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) else None


def team_options(agency_id: UUID, department_id: str, proposal_id: str, task_id: str,
                 *, now: datetime | None = None) -> dict:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        row = _proposal_row(cur, proposal_id, agency_id, lock=False)
        task = _task_for_department(row, task_id, department_id)
        if task.get("state") != "acknowledged":
            raise rules.ResponseError("Acknowledge the task before requesting a team", 409)
        suggestion = rules.suggest_teams(row["hazard_type"], _point(row), _active_counts(cur, agency_id),
                                         now or datetime.now(timezone.utc))
    return {**suggestion, "proposal_id": proposal_id, "task_id": task_id, "incident_id": row["incident_id"],
            "exercise_only": True, "outbound_messages_sent": False}


def _timeline(cur, incident_id: str, kind: str, team_label: str, code: str | None, event_type: str, authority: str):
    summary = rules.timeline_summary(kind, team_label, code)
    if summary is None:
        return
    actor_label = "Synthetic response team" if authority == "team" else "Department desk (exercise)"
    if authority == "department_relay":
        actor_label = "Department desk, relayed for the team (exercise)"
    cur.execute("""INSERT INTO exercise_incident_events (id, incident_id, event_type, occurred_at, summary, actor_label)
                   VALUES (%s,%s,%s,NOW(),%s,%s)""", (str(uuid4()), incident_id, event_type, summary, actor_label))


def _audit(cur, actor: str, action: str, proposal_id: str, details: dict):
    cur.execute("""INSERT INTO audit_events(id, actor_subject, action, resource_type, resource_id, details)
                   VALUES (%s,%s,%s,'exercise_proposal',%s,%s::jsonb)""",
                (str(uuid4()), actor, action, proposal_id,
                 json.dumps({**details, "exercise_only": True, "outbound_messages_sent": False})))


def _insert_report(cur, request_id: str, kind: str, code, note: str, authority: str, actor: str):
    cur.execute("""INSERT INTO exercise_team_reports (id, request_id, kind, code, note, authority, actor_subject)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""", (str(uuid4()), request_id, kind, code, note, authority, actor))


def create_request(agency_id: UUID, department_id: str, actor: str, proposal_id: str, task_id: str, team_id: str,
                   expected_assignment_version: int, note: str, *, now: datetime | None = None) -> tuple[dict, bool]:
    """Returns (request, created). An exact repeat of the creating write returns the existing request."""
    note = rules.clean_note(note)
    teams = rules.team_index()
    if team_id not in teams or task_id not in rules.TASK_IDS:
        raise rules.ResponseError("Unknown synthetic team", 422)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn, conn.cursor() as cur:
        row = _proposal_row(cur, proposal_id, agency_id, lock=True)
        task = _task_for_department(row, task_id, department_id)
        if task.get("assignment_version", 0) != expected_assignment_version:
            raise DecisionError("Task assignment changed; refresh before retrying")
        if task.get("state") != "acknowledged":
            raise rules.ResponseError("Acknowledge the task before requesting a team", 409)
        _team_lock(cur, agency_id, team_id)
        cur.execute(f"""SELECT r.id::text, r.requested_by, rep.note FROM exercise_team_requests r
                        JOIN exercise_team_reports rep ON rep.request_id=r.id AND rep.kind='requested'
                        WHERE r.proposal_id=%s AND r.task_id=%s AND r.team_id=%s AND r.state IN {_ACTIVE_SQL}""",
                    (proposal_id, task_id, team_id))
        existing = cur.fetchone()
        if existing is not None:
            if existing["requested_by"] == actor and existing["note"] == note:
                return _load_one(cur, existing["id"], agency_id, actor, team_view=False), False
            raise rules.ResponseError("This team already has an active request for this task", 409)
        suggestion = rules.suggest_teams(row["hazard_type"], _point(row), _active_counts(cur, agency_id),
                                         now or datetime.now(timezone.utc))
        rules.check_request_allowed(suggestion, team_id)
        request_id = str(uuid4())
        label = teams[team_id]["label"]
        cur.execute("""INSERT INTO exercise_team_requests (id, proposal_id, incident_id, agency_id, task_id, department_id,
                         team_id, team_label, state, version, needs_attention, requested_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'requested',0,FALSE,%s)""",
                    (request_id, proposal_id, row["incident_id"], str(agency_id), task_id, department_id,
                     team_id, label, actor))
        _insert_report(cur, request_id, "requested", None, note, "department", actor)
        _timeline(cur, row["incident_id"], "requested", label, None, "coordination", "department")
        _audit(cur, actor, "team_requested", proposal_id, {
            "agency_id": str(agency_id), "request_id": request_id, "team_id": team_id, "task_id": task_id,
            "department_id": department_id, "kind": "requested", "state": "requested", "version": 0,
            "authority": "department", "code": None, "note": note,
            "capability_basis": suggestion["capability_basis"]})
        return _load_one(cur, request_id, agency_id, actor, team_view=False), True


def record_report(agency_id: UUID, actor: str, request_id: str, *, caller: str, scope_value: str, kind: str,
                  expected_version: int, note: str, code: str | None) -> dict:
    """caller 'team' (scope_value = signed team id) or 'department' (scope_value = signed department id)."""
    column = {"team": "team_id", "department": "department_id"}.get(caller)
    if column is None:
        raise rules.ResponseError("Insufficient response scope", 403)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute(f"""SELECT r.id::text, r.proposal_id::text, r.incident_id::text, r.task_id, r.department_id,
                              r.team_id, r.team_label, r.state, r.version, r.needs_attention
                       FROM exercise_team_requests r JOIN incidents i ON i.id=r.incident_id
                       WHERE r.id=%s AND r.agency_id=%s AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                         AND r.{column}=%s
                       FOR UPDATE OF r""", (request_id, str(agency_id), str(agency_id), scope_value))
        request = cur.fetchone()
        if request is None:
            raise LookupError("Team request not found")
        cur.execute("""SELECT kind, code, note, actor_subject FROM exercise_team_reports WHERE request_id=%s
                       ORDER BY occurred_at DESC, id DESC LIMIT 1""", (request_id,))
        change = rules.apply_report(request, cur.fetchone(), kind=kind, code=code, note=note, actor=actor,
                                    caller=caller, expected_version=expected_version)
        if change is None:
            return _load_one(cur, request_id, agency_id, actor, team_view=caller == "team")
        cur.execute("""UPDATE exercise_team_requests SET state=%s, version=%s, needs_attention=%s, updated_at=NOW()
                       WHERE id=%s""", (change["state"], change["version"], change["needs_attention"], request_id))
        _insert_report(cur, request_id, kind, change["code"], change["note"], change["authority"], actor)
        event_type = "coordination"
        if change["state"] in rules.TERMINAL and change["state_changed"]:
            cur.execute(f"""SELECT COUNT(*) FILTER (WHERE state IN {_ACTIVE_SQL}) AS active,
                                  COUNT(*) FILTER (WHERE state='completed') AS completed
                           FROM exercise_team_requests WHERE incident_id=%s AND agency_id=%s""",
                        (request["incident_id"], str(agency_id)))
            counts = cur.fetchone()
            if counts["active"] == 0 and counts["completed"] > 0:
                event_type = "resolution"
        _timeline(cur, request["incident_id"], kind, request["team_label"], change["code"], event_type, change["authority"])
        _audit(cur, actor, "team_report_recorded", request["proposal_id"], {
            "agency_id": str(agency_id), "request_id": request_id, "team_id": request["team_id"],
            "task_id": request["task_id"], "department_id": request["department_id"], "kind": kind,
            "state": change["state"], "version": change["version"], "authority": change["authority"],
            "code": change["code"], "note": change["note"], "needs_attention": change["needs_attention"]})
        return _load_one(cur, request_id, agency_id, actor, team_view=caller == "team")


_SELECT = """SELECT r.id::text, r.proposal_id::text, r.incident_id::text, i.hazard_type, r.task_id, r.department_id,
                    r.team_id, r.team_label, r.state, r.version, r.needs_attention, r.requested_at, r.updated_at,
                    p.proposal->'simulation'->'tasks' AS tasks
             FROM exercise_team_requests r
             JOIN incidents i ON i.id=r.incident_id
             JOIN action_proposals p ON p.id=r.proposal_id
             WHERE r.agency_id=%s AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE"""


def _shape(cur, rows: list[dict], actor: str, team_view: bool) -> list[dict]:
    if not rows:
        return []
    teams = rules.team_index()
    cur.execute("""SELECT request_id::text, kind, code, note, authority, actor_subject, occurred_at
                   FROM exercise_team_reports WHERE request_id = ANY(%s::uuid[]) ORDER BY occurred_at, id""",
                ([r["id"] for r in rows],))
    reports: dict[str, list] = {}
    for rep in cur.fetchall():
        reports.setdefault(rep["request_id"], []).append({
            "kind": rep["kind"], "occurred_at": rep["occurred_at"].isoformat(), "authority": rep["authority"],
            "code": rep["code"], "note": rep["note"], "mine": rep["actor_subject"] == actor})
    shaped = []
    for r in rows:
        task = next((t for t in (r["tasks"] or []) if isinstance(t, dict) and t.get("id") == r["task_id"]), {})
        item = {"id": r["id"], "incident": {"id": r["incident_id"], "hazard_label": r["hazard_type"]},
                "task": {"id": r["task_id"], "summary": task.get("summary"), "department": r["department_id"]},
                "team": {"id": r["team_id"], "label": r["team_label"], "kind": teams.get(r["team_id"], {}).get("kind")},
                "state": r["state"], "version": r["version"], "needs_attention": r["needs_attention"],
                "requested_at": r["requested_at"].isoformat(), "updated_at": r["updated_at"].isoformat(),
                "reports": reports.get(r["id"], []), "exercise_only": True, "outbound_messages_sent": False}
        if not team_view:
            item["proposal_id"] = r["proposal_id"]  # A team caller never receives the proposal id.
        shaped.append(item)
    return shaped


def _load_one(cur, request_id: str, agency_id: UUID, actor: str, team_view: bool) -> dict:
    cur.execute(_SELECT + " AND r.id=%s", (str(agency_id), str(agency_id), request_id))
    return _shape(cur, cur.fetchall(), actor, team_view)[0]


def list_requests(agency_id: UUID, actor: str, *, view: str, scope_value: str | None = None,
                  incident_id: str | None = None) -> list[dict]:
    """view 'team' | 'department' | 'reader'. Team and desk views are filtered in SQL by their signed scope."""
    sql, params = _SELECT, [str(agency_id), str(agency_id)]
    if view == "team":
        sql += " AND r.team_id=%s"
        params.append(scope_value)
    elif view == "department":
        sql += " AND r.department_id=%s"
        params.append(scope_value)
    elif view != "reader":
        raise rules.ResponseError("Insufficient response scope", 403)
    if incident_id is not None:
        sql += " AND r.incident_id=%s"
        params.append(incident_id)
    sql += f" ORDER BY r.updated_at DESC, r.id LIMIT {_LIMIT}"
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        cur.execute(sql, params)
        return _shape(cur, cur.fetchall(), actor, view == "team")


def alert_count(agency_id: UUID, *, view: str, scope_value: str | None) -> int:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn, conn.cursor() as cur:
        if view == "team":
            cur.execute("""SELECT COUNT(*) AS n FROM exercise_team_requests r JOIN incidents i ON i.id=r.incident_id
                           WHERE r.agency_id=%s AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                             AND r.team_id=%s AND r.state='requested'""",
                        (str(agency_id), str(agency_id), scope_value))
            return int(cur.fetchone()["n"])
        if view == "department":
            cur.execute("""SELECT COUNT(*) AS n FROM exercise_team_requests r JOIN incidents i ON i.id=r.incident_id
                           WHERE r.agency_id=%s AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                             AND r.department_id=%s AND r.needs_attention IS TRUE""",
                        (str(agency_id), str(agency_id), scope_value))
            flagged = int(cur.fetchone()["n"])
        else:
            return 0
    from app.workflow_store import list_department_tasks
    prepared = sum(1 for row in list_department_tasks(agency_id, scope_value or "")
                   if (row.get("task") or {}).get("state") == "prepared")
    return flagged + prepared
