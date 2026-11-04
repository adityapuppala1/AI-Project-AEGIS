"""A9 exercise generator and coach: tabletop drills on a simulated clock.

A drill is built from a scenario in app/fixtures/exercise_scenarios.v1.json (catalogue dates from
research/real-data/catalogue/known_events.csv, or purely synthetic). Its injections are replayed through the
existing pure evaluation path (hazard_watch.evaluate) as exercise-labelled rows that live only inside the
drill state: nothing is written to hazard_evidence, hazard_trigger_events, runs, proposals, tasks or CAP.

The clock never follows wall time. An operator advances it explicitly (with expected-minute retry
protection) and every response is stamped with the simulated minute, so a drill is fully deterministic.
Timeliness is scored against synthetic SLA v3 targets (proposal_simulation.TASK_SLA_MINUTES): rehearsal
targets, never contractual SLAs. Create, clock and respond are blocked while the kill switch is engaged.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import connectors, hazard_watch, learning, learning_store
from app.proposal_simulation import TASK_SLA_MINUTES
from app.security import Operator, get_operator, require_role

VERSION = "aegis.exercise.drill.v1"
REPORT_VERSION = "aegis.exercise.drill-report.v1"
ACTIONS = ("acknowledge_watch", "take_handoff", "submit", "approve")
MAX_ADVANCE = 240
RANK = {"clear": 0, "watch": 1, "candidate": 2}
COACH = {
    "within_synthetic_target": "Within the synthetic rehearsal target. Keep the same cue and hand-off routine.",
    "synthetic_target_elapsed": "The synthetic rehearsal target elapsed. Review what delayed this step and rehearse it again.",
    "not_taken": "This step was not taken before the drill ended. Rehearse recognising its cue.",
    "not_applicable": "The scenario never reached this step's cue; nothing to score.",
}


class DrillError(RuntimeError):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status, self.code = status, code


def targets() -> dict:
    spec = learning.load_scenarios()["sla_targets"]["actions"]
    return {action: {"anchor": spec[action]["anchor"], "sla_task": spec[action]["sla_task"],
                     "target_minutes": TASK_SLA_MINUTES[spec[action]["sla_task"]]} for action in ACTIONS}


def _sim_epoch(found: dict) -> datetime:
    days = found["daily"]["event_days"] or [found["daily"]["start"]]
    return datetime.combine(date.fromisoformat(days[0]), time(), timezone.utc)


def _row(drill_id: str, found: dict, index: int, injection: dict) -> dict:
    return {"id": str(uuid5(NAMESPACE_URL, f"aegis-drill:{drill_id}:{index}")), "connector_id": "exercise_drill",
            "hazard": found["hazard"], "observed_at": _sim_epoch(found) + timedelta(minutes=injection["minute"]),
            "lat": found["lat"], "lon": found["lon"], "value": float(injection["value"]), "unit": "drill",
            "payload": {"point_id": found["point_id"], "exercise": True, "drill_id": drill_id}}


def _inject(state: dict, found: dict, up_to: int) -> None:
    """Apply every scheduled injection with minute <= up_to that is not yet applied, in order."""
    applied = {item["index"] for item in state["injected"]}
    config = hazard_watch.effective_config()
    rows = [_row(state["id"], found, item["index"], found["injections"][item["index"]]) for item in state["injected"]]
    for index, injection in enumerate(found["injections"]):
        if index in applied or injection["minute"] > up_to:
            continue
        row = _row(state["id"], found, index, injection)
        rows.append(row)
        match = next((t for t in hazard_watch.evaluate(rows, config) if t["hazard"] == found["hazard"]), None)
        trigger_state = match["state"] if match else "clear"
        state["injected"].append({"index": index, "evidence_id": row["id"], "minute": injection["minute"],
                                  "value": injection["value"], "trigger_state": trigger_state})
        state["trigger_state"] = trigger_state
        state["config_version"] = config["version"]
        if trigger_state != "clear" and state["first_watch_minute"] is None:
            state["first_watch_minute"] = injection["minute"]
        if trigger_state == "candidate" and state["first_candidate_minute"] is None:
            state["first_candidate_minute"] = injection["minute"]


def new_drill(scenario_id: str, actor: str, drill_id: str | None = None, created_at: str | None = None) -> dict:
    found = learning.scenario(scenario_id)
    if found is None:
        raise DrillError(404, "scenario_not_found")
    drill_id = drill_id or str(uuid4())
    state = {"version": VERSION, "id": drill_id, "exercise": True, "label": "EXERCISE DRILL - simulated clock",
             "scenario_id": found["id"], "title": found["title"], "scenario_source": found["source"],
             "event_ref": found["event_ref"], "hazard": found["hazard"], "point_id": found["point_id"],
             "sim_epoch": _sim_epoch(found).isoformat(), "sim_minute": 0, "end_minute": int(found["end_minute"]),
             "status": "running", "injected": [], "trigger_state": "clear", "config_version": None,
             "first_watch_minute": None, "first_candidate_minute": None, "actions": {},
             "created_by": actor, "created_at": created_at or datetime.now(timezone.utc).isoformat(),
             "operational_actions_enabled": False, "notifications_sent": False, "writes_operational_data": False}
    _inject(state, found, 0)
    return state


def advance_clock(state: dict, expected_minute: int, minutes: int) -> tuple[dict, bool, str, dict]:
    if state.get("exercise") is not True:
        raise DrillError(409, "not_an_exercise")
    if state["status"] != "running":
        raise DrillError(409, "drill_completed")
    if expected_minute != state["sim_minute"]:
        raise DrillError(409, "clock_stale")
    if not 1 <= minutes <= MAX_ADVANCE:
        raise DrillError(422, "invalid_advance")
    found = learning.scenario(state["scenario_id"])
    state = dict(state, injected=list(state["injected"]))
    target = min(state["sim_minute"] + minutes, state["end_minute"])
    before = len(state["injected"])
    _inject(state, found, target)
    state["sim_minute"] = target
    if target >= state["end_minute"]:
        state["status"] = "completed"
    return state, True, "clock", {"to_minute": target, "injections": len(state["injected"]) - before,
                                  "trigger_state": state["trigger_state"]}


def respond(state: dict, action: str, actor: str, roles: frozenset) -> tuple[dict, bool, str, dict]:
    if state.get("exercise") is not True:
        raise DrillError(409, "not_an_exercise")
    if action not in ACTIONS:
        raise DrillError(422, "unknown_action")
    if actor.lower().startswith("system:"):
        raise DrillError(409, "system_actor_cannot_respond")
    if action in state["actions"]:
        return state, False, action, {}  # retries never add a second response
    if state["status"] != "running":
        raise DrillError(409, "drill_completed")
    done = state["actions"]
    if action == "acknowledge_watch" and state["first_watch_minute"] is None:
        raise DrillError(409, "no_watch_yet")
    if action == "take_handoff" and (state["first_candidate_minute"] is None or "acknowledge_watch" not in done):
        raise DrillError(409, "handoff_not_ready")
    if action == "submit" and "take_handoff" not in done:
        raise DrillError(409, "submit_not_ready")
    if action == "approve":
        if "submit" not in done:
            raise DrillError(409, "approve_not_ready")
        # Rehearsal of independent approval: a different identified checker, never the submitter.
        if "incident_checker" not in roles or done["submit"]["actor"] == actor:
            raise DrillError(409, "independent_checker_required")
    elif "incident_operator" not in roles:
        raise DrillError(403, "operator_role_required")
    state = dict(state, actions={**done, action: {"minute": state["sim_minute"], "actor": actor}})
    if action == "approve":
        state["status"] = "completed"
    return state, True, action, {"sim_minute": state["sim_minute"]}


def _anchor(state: dict, anchor: str) -> int | None:
    if anchor == "first_watch":
        return state["first_watch_minute"]
    if anchor == "first_candidate":
        return state["first_candidate_minute"]
    taken = state["actions"].get(anchor)
    return taken["minute"] if taken else None


def report(state: dict) -> dict:
    """Deterministic coach report from the drill state only. Cites the catalogue event and injection ids."""
    rows, counts = [], {key: 0 for key in COACH}
    for action, spec in targets().items():
        anchor = _anchor(state, spec["anchor"])
        taken = state["actions"].get(action)
        if anchor is None:
            status, elapsed = "not_applicable", None
        elif taken is None:
            status, elapsed = "not_taken", None
        else:
            elapsed = taken["minute"] - anchor
            status = "within_synthetic_target" if elapsed <= spec["target_minutes"] else "synthetic_target_elapsed"
        counts[status] += 1
        rows.append({"action": action, "sla_task": spec["sla_task"], "target_minutes": spec["target_minutes"],
                     "anchor": spec["anchor"], "anchor_minute": anchor, "response_minute": taken["minute"] if taken else None,
                     "elapsed_minutes": elapsed, "status": status, "coach_note": COACH[status],
                     "cited_ids": [i["evidence_id"] for i in state["injected"]
                                   if anchor is not None and i["minute"] <= (taken["minute"] if taken else state["sim_minute"])][:20]})
    return {"version": REPORT_VERSION, "drill_id": state["id"], "exercise": True, "scenario_id": state["scenario_id"],
            "event_ref": state["event_ref"], "sla_policy": learning.load_scenarios()["sla_targets"]["policy"],
            "sim_minute": state["sim_minute"], "status": state["status"], "actions": rows, "counts": counts,
            "cited_event_ids": [ref for ref in [state["event_ref"]] if ref] + [i["evidence_id"] for i in state["injected"]],
            "note": ("Exercise drill on a simulated clock. Synthetic SLA targets are rehearsal targets, not contractual "
                     "SLAs. This score is operator timeliness in a rehearsal, not forecasting accuracy."),
            "operational_actions_enabled": False}


# --- routes -------------------------------------------------------------------------------------

router = APIRouter(prefix="/v1/proactive/drills", tags=["drills"], dependencies=[Depends(connectors.require_proactive)])


class StartDrill(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str = Field(pattern=r"^[a-z0-9_.-]{1,80}$")


class Clock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_minute: int = Field(ge=0, le=100000, strict=True)
    minutes: int = Field(ge=1, le=MAX_ADVANCE, strict=True)


class Respond(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str = Field(pattern=r"^[a-z_]{1,40}$")


def _call(fn, *args):
    try:
        return fn(*args)
    except DrillError as error:
        raise HTTPException(status_code=error.status, detail=error.code) from None
    except KeyError:
        raise HTTPException(status_code=404, detail="drill_not_found") from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="drill_store_unavailable") from None


def _reader(operator: Operator = Depends(get_operator)) -> Operator:
    require_role(operator, {"incident_operator", "incident_checker", "incident_auditor", "platform_admin"})
    return operator


def _create(scenario_id: str, operator: Operator) -> dict:
    state = new_drill(scenario_id, operator.subject)
    learning_store.get_store().create_drill(state["id"], operator.agency_id, state["scenario_id"], state, operator.subject,
                                            {"scenario_id": state["scenario_id"], "event_ref": state["event_ref"]})
    return state


def _scoped(drill_id: UUID, operator: Operator) -> dict:
    state = _call(learning_store.get_store().get_drill, drill_id, operator.agency_id)
    if state is None:
        raise HTTPException(status_code=404, detail="drill_not_found")
    return state


@router.get("/scenarios")
def get_scenarios(operator: Operator = Depends(_reader)):
    data = learning.load_scenarios()
    return {"version": data["version"], "note": data["note"], "targets": targets(),
            "scenarios": [{k: s[k] for k in ("id", "title", "source", "event_ref", "hazard", "end_minute")}
                          for s in data["scenarios"]]}


@router.get("")
def list_drills(operator: Operator = Depends(_reader)):
    return {"drills": _call(learning_store.get_store().list_drills, operator.agency_id, 30)}


@router.post("", status_code=201)
def start_drill(body: StartDrill, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator"})
    connectors.require_not_paused()
    return _call(_create, body.scenario_id, operator)


@router.get("/{drill_id}")
def get_drill(drill_id: UUID, operator: Operator = Depends(_reader)):
    state = _scoped(drill_id, operator)
    return {**state, "audit": _call(learning_store.get_store().drill_audit, drill_id)}


@router.post("/{drill_id}/clock")
def post_clock(drill_id: UUID, body: Clock, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator"})
    connectors.require_not_paused()
    store = learning_store.get_store()
    return _call(store.update_drill, drill_id, operator.agency_id,
                 lambda s: advance_clock(s, body.expected_minute, body.minutes), operator.subject)[0]


@router.post("/{drill_id}/respond")
def post_respond(drill_id: UUID, body: Respond, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator", "incident_checker"})
    connectors.require_not_paused()
    store = learning_store.get_store()
    return _call(store.update_drill, drill_id, operator.agency_id,
                 lambda s: respond(s, body.action, operator.subject, operator.roles), operator.subject)[0]


@router.get("/{drill_id}/report")
def get_report(drill_id: UUID, operator: Operator = Depends(_reader)):
    return report(_scoped(drill_id, operator))
