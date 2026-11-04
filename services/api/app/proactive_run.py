"""Bounded proactive run: gather_evidence -> simulate_variants -> judge -> draft_cap -> hand_to_human.

Expected-step protection, cancellation with rationale and one audit row per step. review_ready
only hands the cited material to an accountable human; nothing is submitted, approved or sent.
"""
import hashlib
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

from app import connectors, hazard_watch, impact, jev_client, proactive_store
from app.proactive_cap import CapRefused, exercise_cap_xml
from app.security import Operator, get_operator, require_role

VERSION = "aegis.proactive.run.v1"
STEPS = ("gather_evidence", "simulate_variants", "judge", "draft_cap", "hand_to_human")
VARIANTS = (("threshold_minus_20", "Thresholds -20%", -0.2, False), ("threshold_baseline", "Thresholds as configured", 0.0, False),
            ("threshold_plus_20", "Thresholds +20%", 0.2, False), ("newest_evidence_only", "Newest evidence only", 0.0, True))


class RunError(RuntimeError):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status, self.code = status, code


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def decision_band(judgment: dict) -> str:
    playbook = (judgment.get("playbook_option") or {}).get("confidence", 0.0)
    citation = (judgment.get("citation_clean") or {}).get("noul", 0.0)
    staleness = (judgment.get("staleness_risk") or {}).get("noul", 1.0)
    if playbook < 0.5 or citation < 0.9:
        return "blocked"
    if playbook >= 0.9 and citation >= 0.9 and staleness < 0.5:
        return "recommended"
    return "needs_review"


def new_state(run_id: str, trigger: dict, actor: str) -> dict:
    now = _now()
    return {"version": VERSION, "id": run_id, "status": "running", "trigger_event_id": trigger["id"],
            "trigger_id": trigger.get("trigger_id"),
            "created_by": actor, "created_at": now, "updated_at": now, "evidence_ids": [], "impact": None, "variants": [],
            "judgment": None, "cap": None, "completed_steps": [], "next_step": STEPS[0],
            "needs_accountable_human_review": True, "operational_actions_enabled": False}


IMPACT_KEYS = ("config_version", "status", "state", "hazard_state", "matched_measure", "label", "data_basis",
               "people_exposed", "critical_facilities", "road_segments", "by_kind", "feature_count",
               "synthetic_count", "licensed_count", "licences", "footprint_radius_km", "exposure_feature_ids")
IMPACT_AUDIT_KEYS = ("config_version", "status", "state", "data_basis", "people_exposed", "critical_facilities",
                     "road_segments", "feature_count")


def impact_bundle(trigger: dict) -> dict | None:
    """The impact part of the run's evidence bundle: counts and cited exposure feature ids, copied
    from the trigger event (deterministic, computed at refresh time)."""
    block = (trigger.get("rationale") or {}).get("impact")
    if not isinstance(block, dict):
        return None
    return {k: block[k] for k in IMPACT_KEYS if k in block}


def _evidence(store, trigger) -> list[dict]:
    rows = store.list_evidence(500, ids=trigger.get("evidence_ids") or [])
    now = datetime.now(timezone.utc)
    for row in rows:
        retrieved = row.get("retrieved_at")
        row["stale"] = not isinstance(retrieved, datetime) or (now - retrieved).total_seconds() > hazard_watch.STALE_SECONDS
    return rows


def simulate(trigger: dict, evidence: list[dict]) -> list[dict]:
    variants = []
    for variant_id, label, delta, newest in VARIANTS:
        rows = evidence
        if newest and evidence:
            latest = max(r["observed_at"] for r in evidence)
            rows = [r for r in evidence if r["observed_at"] == latest]
        match = next((t for t in hazard_watch.evaluate_all(rows, scale=1 + delta) if t["trigger_id"] == trigger["trigger_id"]), None)
        # A3: the trigger's stored exposure counts and rules are re-applied to each variant's hazard state.
        resulting = impact.reclassify(match["state"], (trigger.get("rationale") or {}).get("impact")) if match else "clear"
        variants.append({"id": variant_id, "label": label, "threshold_delta": delta,
                         "resulting_state": resulting, "score": match["score"] if match else None})
    return variants


def advance(state: dict, expected_step: str, actor: str, store, transport=None) -> tuple[dict, bool, str, dict]:
    if state.get("status") == "cancelled":
        raise RunError(409, "run_cancelled")
    completed = list(state.get("completed_steps") or [])
    if state.get("status") == "review_ready" or expected_step in {c["step"] for c in completed}:
        return state, False, expected_step, {}
    if len(completed) >= len(STEPS) or state.get("next_step") != STEPS[len(completed)]:
        raise RunError(409, "run_state_invalid")
    step = STEPS[len(completed)]
    if expected_step != step:
        raise RunError(409, "step_stale_or_out_of_order")
    if step == "hand_to_human" and actor.startswith("system:"):
        # Only an accountable human takes the hand-off; the scheduler always stops before it.
        raise RunError(409, "system_actor_cannot_hand_off")
    trigger = store.get_trigger(state["trigger_event_id"])
    if trigger is None:
        raise RunError(409, "trigger_missing")
    state = dict(state)
    if step == "gather_evidence":
        rows = _evidence(store, trigger)
        state["evidence_ids"] = [r["id"] for r in rows]
        state["impact"] = impact_bundle(trigger)
        detail = {"evidence_count": len(rows), "stale_count": sum(1 for r in rows if r["stale"]),
                  "impact": {k: state["impact"].get(k) for k in IMPACT_AUDIT_KEYS} if state["impact"] else None}
    elif step == "simulate_variants":
        state["variants"] = simulate(trigger, _evidence(store, trigger))
        detail = {"variants": [{"id": v["id"], "resulting_state": v["resulting_state"]} for v in state["variants"]]}
    elif step == "judge":
        rows = [r for r in _evidence(store, trigger) if r["id"] in set(state["evidence_ids"])]
        jstate = jev_client.build_state(trigger, rows, state["variants"])
        try:
            judgment = jev_client.judge(jstate, actor, transport=transport)
            judgment.pop("input_tokens", None)
            judgment["decision_band"] = decision_band(judgment)
        except jev_client.JevError as error:
            judgment = {"provider": "unavailable", "model": None, "error": str(error), "playbook_option": None,
                        "citation_clean": None, "severity_band": None, "staleness_risk": None, "decision_band": "blocked"}
        state["judgment"] = judgment
        detail = {"provider": judgment["provider"], "decision_band": judgment["decision_band"], "error": judgment.get("error")}
    elif step == "draft_cap":
        if (state.get("judgment") or {}).get("decision_band") == "blocked":
            state["cap"] = None
            detail = {"cap": "skipped_blocked"}
        else:
            score = ((state["judgment"].get("severity_band") or {}).get("score"))
            judged = {**state, "judgment": {**state["judgment"], "severity_band": {
                **state["judgment"]["severity_band"], "score": int(round(score))}}} if isinstance(score, (int, float)) else state
            try:
                xml = exercise_cap_xml(judged, trigger)
            except CapRefused:
                raise RunError(409, "cap_refused") from None
            state["cap"] = {"sha256": hashlib.sha256(xml).hexdigest(), "generated_at": _now()}
            state["cap_xml"] = xml.decode()
            detail = {"cap_sha256": state["cap"]["sha256"]}
    else:
        detail = {"handed_to_human": True, "submission_performed": False, "notification_sent": False}
    completed.append({"step": step, "completed_at": _now(), "completed_by": actor})
    state.update(completed_steps=completed, updated_at=_now())
    if len(completed) == len(STEPS):
        state.update(status="review_ready", next_step=None)
    else:
        state["next_step"] = STEPS[len(completed)]
    return state, True, step, detail


def cancel(state: dict, rationale: str, actor: str) -> tuple[dict, bool, str, dict]:
    if state.get("status") in {"cancelled", "review_ready"}:
        return state, False, "cancel", {}
    if len(rationale.strip()) < 10:
        raise RunError(422, "rationale_too_short")
    return ({**state, "status": "cancelled", "next_step": None, "updated_at": _now(),
             "cancelled_by": actor, "cancellation_rationale": rationale.strip()},
            True, "cancel", {"rationale": rationale.strip()})


def view(state: dict) -> dict:
    return {k: v for k, v in state.items() if k != "cap_xml"}


# --- routes -------------------------------------------------------------------------------------

router = APIRouter(prefix="/v1/proactive", tags=["proactive"], dependencies=[Depends(connectors.require_proactive)])


def _operator(operator: Operator = Depends(get_operator)) -> Operator:
    require_role(operator, {"incident_operator"})
    return operator


class StartRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trigger_event_id: UUID


class AdvanceRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_step: str = Field(min_length=1, max_length=40)


class CancelRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rationale: str = Field(min_length=10, max_length=1000)


def _call(fn, *args):
    try:
        return fn(*args)
    except RunError as error:
        raise HTTPException(status_code=error.status, detail=error.code) from None
    except KeyError:
        raise HTTPException(status_code=404, detail="run_not_found") from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="proactive_store_unavailable") from None


def _start(trigger_event_id, operator):
    store = proactive_store.get_store()
    trigger = store.get_trigger(trigger_event_id)
    if trigger is None:
        raise RunError(404, "trigger_not_found")
    if trigger["state"] == "clear":
        raise RunError(409, "trigger_clear")
    run_id = str(uuid4())
    state = new_state(run_id, trigger, operator.subject)
    # Agency comes only from the verified token; the request body cannot carry one (extra="forbid").
    store.create_run(run_id, trigger["id"], state, operator.subject, {"trigger_event_id": trigger["id"]}, operator.agency_id)
    return state


# Every run route is scoped to the operator's verified agency. A run in another agency, or a legacy
# row with NULL agency_id, is reported as run_not_found (404) so existence never leaks across agencies.

@router.post("/runs", status_code=201)
def start_run(body: StartRun, operator: Operator = Depends(_operator)):
    connectors.require_not_paused()
    return view(_call(_start, body.trigger_event_id, operator))


@router.get("/runs")
def list_runs(operator: Operator = Depends(_operator)):
    return {"runs": [view(s) for s in _call(proactive_store.get_store().list_runs, operator.agency_id, 50)]}


@router.post("/runs/{run_id}/advance")
def advance_run(run_id: UUID, body: AdvanceRun, operator: Operator = Depends(_operator)):
    connectors.require_not_paused()
    store = proactive_store.get_store()
    state, _ = _call(store.update_run, run_id, lambda s: advance(s, body.expected_step, operator.subject, store),
                     operator.subject, operator.agency_id)
    return view(state)


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: UUID, body: CancelRun, operator: Operator = Depends(_operator)):
    # Cancellation stays available while paused: stopping work is never blocked.
    store = proactive_store.get_store()
    state, _ = _call(store.update_run, run_id, lambda s: cancel(s, body.rationale, operator.subject), operator.subject,
                     operator.agency_id)
    return view(state)


def _scoped(run_id: UUID, operator: Operator) -> dict:
    state = _call(proactive_store.get_store().get_run, run_id, operator.agency_id)
    if state is None:
        raise HTTPException(status_code=404, detail="run_not_found")
    return state


@router.get("/runs/{run_id}")
def get_run(run_id: UUID, operator: Operator = Depends(_operator)):
    state = _scoped(run_id, operator)
    return {**view(state), "audit": _call(proactive_store.get_store().run_audit, run_id)}


@router.get("/runs/{run_id}/cap.xml")
def get_run_cap(run_id: UUID, operator: Operator = Depends(_operator)):
    state = _scoped(run_id, operator)
    if not state.get("cap") or not state.get("cap_xml"):
        raise HTTPException(status_code=409, detail="cap_not_drafted")
    xml = state["cap_xml"].encode()
    return Response(content=xml, media_type="application/xml",
                    headers={"X-Content-SHA256": hashlib.sha256(xml).hexdigest(),
                             "Content-Disposition": f'attachment; filename="aegis-exercise-{run_id}.xml"'})
