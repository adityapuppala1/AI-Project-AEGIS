"""A7 shift-handover brief: deterministic, cited, read-only.

Assembles what changed for the operator's verified agency since a bounded time (1-72 h, default 12 h).
Every line cites record ids. Only allowlisted fields are copied from records; free text (rationales,
pause reasons, proposal bodies, subjects) is never echoed. Nothing is written or persisted: this module
calls store *read* functions only (enforced by tests/test_operator_copilot.py).
Synthetic SLA targets are rehearsal targets, not contractual SLAs. Nothing here is a forecast.
"""
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app import connectors, proactive_store
from app.security import Operator, get_operator, require_role

VERSION = "aegis.exercise.shift-handover.v1"
DEFAULT_HOURS = 12
MIN_HOURS, MAX_HOURS = 1, 72
MAX_ITEMS = 50
MAX_REFS = 20
READ_ROLES = {"incident_operator", "incident_checker", "incident_auditor", "platform_admin"}
TASK_IDS = ("control_room", "infrastructure", "communications")
SAFE_ID = re.compile(r"^[a-z][a-z0-9_.-]{0,79}$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
PROPOSAL_STATUSES = ("draft", "submitted", "approved", "rejected")
RUN_STATUSES = ("running", "review_ready", "cancelled")
FLAGS = ("strengthened", "weakened", "contradicted", "stale")
NOTE = ("Deterministic template over agency-scoped exercise records. Synthetic thresholds and SLA targets are "
        "rehearsal values only; this brief is not a forecast, warning, approval or dispatch, and nothing was sent.")


def _uuid(value) -> str | None:
    text = str(value).lower() if value is not None else ""
    return text if UUID_RE.match(text) else None


def _uuids(values) -> list[str]:
    out = []
    for value in values or []:
        item = _uuid(value)
        if item and item not in out:
            out.append(item)
    return out[:MAX_REFS]


def _safe(value) -> str | None:
    return value if isinstance(value, str) and SAFE_ID.match(value) else None


def _time(value) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _iso(value) -> str | None:
    parsed = _time(value)
    return parsed.isoformat() if parsed else None


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _section(status: str, code: str | None = None, **items) -> dict:
    return {"status": status, "code": code, **items}


# --- section readers (read-only store calls only) ---------------------------------------------

def _watch(store, since: datetime) -> dict:
    triggers = []
    for row in store.list_triggers(200):
        fired = _time(row.get("fired_at"))
        if row.get("state") not in {"watch", "candidate"} or fired is None or fired < since:
            continue
        trigger_id = _uuid(row.get("id"))
        if not trigger_id:
            continue
        triggers.append({"trigger_event_id": trigger_id, "trigger_id": _safe(row.get("trigger_id")),
                         "hazard": _safe(row.get("hazard")), "state": row["state"], "score": _number(row.get("score")),
                         "fired_at": fired.isoformat(), "evidence_ids": _uuids(row.get("evidence_ids"))})
    triggers.sort(key=lambda t: (t["state"] != "candidate", t["fired_at"]))
    return _section("ok", triggers=triggers[:MAX_ITEMS])


def _runs(store, agency_id: UUID, since: datetime) -> tuple[dict, dict]:
    runs, changes = [], []
    for state in store.list_runs(agency_id, 200):
        run_id = _uuid(state.get("id"))
        status = state.get("status") if state.get("status") in RUN_STATUSES else None
        if not run_id or status is None:
            continue
        updated = _time(state.get("updated_at")) or _time(state.get("created_at"))
        flags = []
        for flag in state.get("sentinel_flags") or []:
            at = _time(flag.get("at"))
            if flag.get("flag") in FLAGS and at is not None and at >= since:
                item = {"run_id": run_id, "flag": flag["flag"], "at": at.isoformat(),
                        "trigger_event_id": _uuid(flag.get("trigger_event_id")),
                        "evidence_ids": _uuids(flag.get("evidence_ids"))}
                flags.append(item)
                changes.append(item)
        if status != "running" and (updated is None or updated < since):
            continue
        origin = "scheduler" if state.get("origin") == "scheduler" else "operator"
        next_step = _safe(state.get("next_step"))
        runs.append({"run_id": run_id, "status": status, "origin": origin, "next_step": next_step,
                     "trigger_event_id": _uuid(state.get("trigger_event_id")),
                     "updated_at": updated.isoformat() if updated else None,
                     "awaiting_handoff": status == "running" and origin == "scheduler" and next_step == "hand_to_human",
                     "sentinel_flags": flags[-10:]})
    runs.sort(key=lambda r: r["updated_at"] or "", reverse=True)
    changes.sort(key=lambda c: c["at"], reverse=True)
    return _section("ok", runs=runs[:MAX_ITEMS]), _section("ok", changes=changes[:MAX_ITEMS])


def _scheduler(store, agency_id: UUID, since: datetime) -> tuple[dict, list[dict]]:
    from app.proactive_scheduler import ERROR_CODES
    try:
        pause = store.get_pause()
        paused = pause.get("paused") if isinstance(pause.get("paused"), bool) else None
        pause_view = {"paused": paused, "updated_at": _iso(pause.get("updated_at"))}
    except Exception:
        pause_view = {"paused": None, "updated_at": None}
    ticks, failures = [], []
    for row in store.list_ticks(agency_id, 50):
        started = _time(row.get("started_at"))
        tick_id = _uuid(row.get("id"))
        if started is None or started < since or not tick_id:
            continue
        errors = [code for code in (row.get("errors") or []) if code in ERROR_CODES]
        outcome = row.get("outcome") if row.get("outcome") in {"completed", "skipped_paused", "skipped_locked", "failed"} else None
        ticks.append({"tick_id": tick_id, "started_at": started.isoformat(), "outcome": outcome,
                      "runs_started": _number(row.get("runs_started")), "flags_recorded": _number(row.get("flags_recorded")),
                      "errors": errors})
        failures.extend({"source": "scheduler_tick", "ref": tick_id, "code": code, "at": started.isoformat()} for code in errors)
    ticks.sort(key=lambda t: t["started_at"], reverse=True)
    return _section("ok", **pause_view, ticks=ticks[:10]), failures


def _connector_failures(store, since: datetime) -> list[dict]:
    data = store.list_configs()
    out = []
    for connector_id, test in sorted((data.get("tests") or {}).items()):
        at = _time((test or {}).get("at"))
        if connector_id in connectors.REGISTRY and test and test.get("ok") is False and at is not None and at >= since:
            out.append({"source": "connector_test", "ref": connector_id, "code": "connector_test_failed", "at": at.isoformat()})
    return out


def _proposals(agency_id: UUID, now: datetime, since: datetime) -> tuple[dict, dict]:
    from app import workflow_store
    rows = workflow_store.list_proposals(agency_id)
    counts = {status: 0 for status in PROPOSAL_STATUSES}
    pending, overdue = [], []
    for row in rows:
        proposal_id, incident_id = _uuid(row.get("id")), _uuid(row.get("incident_id"))
        status = row.get("status")
        if not proposal_id or status not in counts:
            continue
        counts[status] += 1
        if status == "submitted":
            pending.append({"proposal_id": proposal_id, "incident_id": incident_id, "submitted_at": _iso(row.get("updated_at"))})
        simulation = ((row.get("proposal") or {}).get("simulation") or {}) if isinstance(row.get("proposal"), dict) else {}
        if status != "approved" or simulation.get("version") != "aegis.proposal.simulation.v3" or simulation.get("synthetic") is not True:
            continue
        for task in simulation.get("tasks") or []:
            if not isinstance(task, dict) or task.get("id") not in TASK_IDS:
                continue
            due = _time(task.get("due_at"))
            if due is None:
                continue
            if task.get("state") == "prepared" and due < now:
                overdue.append({"proposal_id": proposal_id, "incident_id": incident_id, "task_id": task["id"],
                                "due_at": due.isoformat(), "sla_status": "synthetic_target_elapsed_unacknowledged"})
            elif task.get("sla_status") == "synthetic_target_elapsed" and due >= since:
                overdue.append({"proposal_id": proposal_id, "incident_id": incident_id, "task_id": task["id"],
                                "due_at": due.isoformat(), "sla_status": "acknowledged_after_synthetic_target"})
    pending.sort(key=lambda p: p["submitted_at"] or "")
    overdue.sort(key=lambda o: o["due_at"])
    return (_section("ok", counts=counts, pending=pending[:MAX_ITEMS]),
            _section("ok", tasks=overdue[:MAX_ITEMS], sla_policy="aegis.exercise.department-sla.v1"))


# --- lines (fixed templates; every line cites ids) ---------------------------------------------

def _lines(brief: dict) -> list[dict]:
    lines = []

    def add(section, code, text, refs):
        if refs:
            lines.append({"section": section, "code": code, "text": text, "refs": refs[:MAX_REFS]})

    for t in brief["watch"].get("triggers", []):
        add("watch", f"trigger_{t['state']}", f"{t['hazard'] or 'hazard'} trigger is {t['state']} (synthetic threshold, score {t['score']}).",
            [t["trigger_event_id"], *t["evidence_ids"]])
    for r in brief["runs"].get("runs", []):
        if r["awaiting_handoff"]:
            add("runs", "run_awaiting_handoff", "Scheduler-prepared draft run awaits human hand-off review.", [r["run_id"]])
        else:
            add("runs", f"run_{r['status']}", f"Proactive run is {r['status']} (next step {r['next_step'] or 'none'}).", [r["run_id"]])
    for c in brief["evidence_changes"].get("changes", []):
        add("evidence_changes", f"sentinel_{c['flag']}", f"Sentinel flagged evidence as {c['flag']} on a run.", [c["run_id"], *c["evidence_ids"]])
    for p in brief["approvals"].get("pending", []):
        add("approvals", "proposal_awaiting_checker", "Proposal awaits an independent checker decision.",
            [p["proposal_id"], *([p["incident_id"]] if p["incident_id"] else [])])
    for o in brief["sla"].get("tasks", []):
        add("sla", o["sla_status"], f"Department task {o['task_id']}: synthetic SLA target elapsed (rehearsal target, not contractual).",
            [o["proposal_id"]])
    for f in brief["failures"].get("items", []):
        add("failures", f["code"], f"{f['source']} reported {f['code']}.", [f["ref"]])
    for t in brief["scheduler"].get("ticks", [])[:3]:
        add("scheduler", f"tick_{t['outcome']}", f"Scheduler tick {t['outcome']}: {t['runs_started']} draft runs prepared.", [t["tick_id"]])
    return lines


def build_brief(operator: Operator, hours: int = DEFAULT_HOURS, now: datetime | None = None) -> dict:
    if not MIN_HOURS <= hours <= MAX_HOURS:
        raise ValueError("hours_out_of_range")
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)
    agency = operator.agency_id
    disabled = _section("disabled", "proactive_disabled")
    brief = {"watch": disabled, "runs": disabled, "evidence_changes": disabled, "scheduler": disabled,
             "failures": _section("ok", items=[])}
    failures: list[dict] = []
    if connectors.proactive_enabled():
        store = proactive_store.get_store()
        try:
            brief["watch"] = _watch(store, since)
        except Exception:
            brief["watch"] = _section("unavailable", "proactive_store_unavailable")
        try:
            brief["runs"], brief["evidence_changes"] = _runs(store, agency, since)
        except Exception:
            brief["runs"] = brief["evidence_changes"] = _section("unavailable", "proactive_store_unavailable")
        try:
            brief["scheduler"], tick_failures = _scheduler(store, agency, since)
            failures.extend(tick_failures)
        except Exception:
            brief["scheduler"] = _section("unavailable", "proactive_store_unavailable")
        try:
            failures.extend(_connector_failures(store, since))
        except Exception:
            brief["failures"] = _section("unavailable", "proactive_store_unavailable", items=[])
    try:
        brief["approvals"], brief["sla"] = _proposals(agency, now, since)
    except Exception:
        brief["approvals"] = brief["sla"] = _section("unavailable", "workflow_store_unavailable")
    if brief["failures"]["status"] == "ok":
        brief["failures"]["items"] = sorted(failures, key=lambda f: f["at"], reverse=True)[:MAX_ITEMS]
    return {"version": VERSION, "source": "synthetic_exercise", "generated_at": now.isoformat(),
            "since": since.isoformat(), "hours": hours, **brief, "lines": _lines(brief),
            "generated_by": "deterministic_template_no_model", "read_only": True,
            "operational_actions_enabled": False, "needs_accountable_human_review": True, "note": NOTE}


router = APIRouter(prefix="/v1/exercise", tags=["Shift handover"])


@router.get("/handover")
def get_handover(hours: int = Query(default=DEFAULT_HOURS, ge=MIN_HOURS, le=MAX_HOURS), operator: Operator = Depends(get_operator)):
    require_role(operator, READ_ROLES)
    # Agency comes only from the verified token; there is no agency parameter.
    return build_brief(operator, hours)
