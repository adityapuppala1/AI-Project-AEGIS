"""Bounded, durable exercise assistance state; never submits or approves."""
from datetime import datetime, timezone
from uuid import uuid4

from app.governance import DecisionError

VERSION = "aegis.exercise.assistance-run.v1"
STEPS = ("gather_references", "check_quality", "validate_draft")
PERMITTED_TOOLS = ("captured_response_draft", "saved_review_focus")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_run(payload: dict, actor: str) -> tuple[dict, bool]:
    existing = payload.get("assistance_run")
    if existing and existing.get("status") in {"running", "review_ready"}:
        return existing, False
    context = payload.get("response_draft") or {}
    fingerprint = context.get("context_fingerprint")
    if not fingerprint:
        raise DecisionError("A versioned response context is required before starting assistance")
    now = _now()
    return {
        "version": VERSION, "id": str(uuid4()), "status": "running",
        "created_by": actor, "created_at": now, "updated_at": now,
        "context_fingerprint": fingerprint, "permitted_tools": list(PERMITTED_TOOLS),
        "step_budget": len(STEPS), "completed_steps": [], "next_step": STEPS[0],
        "operational_actions_enabled": False, "needs_accountable_human_review": True,
    }, True


def advance_run(run: dict, payload: dict, actor: str, expected_step: str) -> tuple[dict, bool]:
    if not run:
        raise DecisionError("Start the assistance run before advancing it")
    if run.get("status") == "cancelled":
        raise DecisionError("Cancelled assistance cannot be resumed; start a new run")
    if run.get("status") == "review_ready":
        return run, False
    completed = list(run.get("completed_steps") or [])
    if expected_step in {item.get("step") for item in completed}:
        return run, False
    if len(completed) >= len(STEPS) or run.get("next_step") != STEPS[len(completed)]:
        raise DecisionError("Assistance run state is invalid")
    step = STEPS[len(completed)]
    if expected_step != step:
        raise DecisionError("Assistance step is stale or out of order; refresh the proposal")
    context = payload.get("response_draft") or {}
    brief = context.get("review_brief") or {}
    if step == "gather_references":
        result = {"evidence_ids": context.get("playbook", {}).get("synthetic_evidence_ids", []),
                  "finding_count": len(brief.get("findings") or [])}
    elif step == "check_quality":
        result = {"context_state": context.get("context_state"),
                  "limitations": list(brief.get("limitations") or []),
                  "unknowns": list(context.get("explicit_unknowns") or [])}
    else:
        result = {"recommendation_count": len(context.get("recommendation_draft") or []),
                  "playbook_version": context.get("playbook", {}).get("version"),
                  "saved_review_focus": payload.get("review_focus") is not None,
                  "submission_performed": False}
    completed.append({"step": step, "completed_at": _now(), "completed_by": actor, "result": result})
    updated = {**run, "completed_steps": completed, "updated_at": _now()}
    if len(completed) == len(STEPS):
        updated.update(status="review_ready", next_step=None)
    else:
        updated["next_step"] = STEPS[len(completed)]
    return updated, True


def cancel_run(run: dict, actor: str, reason: str) -> tuple[dict, bool]:
    if not run:
        raise DecisionError("No assistance run exists")
    if run.get("status") in {"cancelled", "review_ready"}:
        return run, False
    if len(reason.strip()) < 10:
        raise DecisionError("Cancellation rationale must contain at least 10 characters")
    now = _now()
    return {**run, "status": "cancelled", "next_step": None, "updated_at": now,
            "cancelled_at": now, "cancelled_by": actor, "cancellation_reason": reason.strip()}, True
