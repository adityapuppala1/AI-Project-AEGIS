"""Run observability (roadmap cross-cutting item): a step graph derived from existing run state and audit.

No new store. Each audit row of a proactive run (start, steps, sentinel flags, cancel) becomes one
event with its actor, outcome and timings; the fixed step sequence becomes the graph nodes with
budget used/remaining. Step compute time (duration_ms) comes from the started_at recorded in
run state by proactive_run.advance; runs created before that only report the wait since the
previous event. Scheduler ticks (agency-scoped, 014) are summarised with duration and outcome.
Read-only: nothing here writes, advances, submits or notifies.
"""
from datetime import datetime

from app import proactive_run

MAX_EVENTS = 200
MAX_REASON = 300
SENTINEL_FLAGS = ("strengthened", "weakened", "contradicted", "stale")


def _parse(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _iso(value):
    parsed = _parse(value)
    return parsed.isoformat() if parsed else None


def _ms(start, end) -> int | None:
    a, b = _parse(start), _parse(end)
    if a is None or b is None:
        return None
    return max(0, int(round((b - a).total_seconds() * 1000)))


def _actor_kind(actor: str) -> str:
    return "system" if str(actor).startswith("system:") else "human"


def _outcome(step: str, detail: dict) -> str:
    detail = detail if isinstance(detail, dict) else {}
    if step == "start":
        return "started"
    if step == "cancel":
        return "cancelled"
    if step == "sentinel_flag":
        flag = detail.get("flag")
        return f"flag_{flag}" if flag in SENTINEL_FLAGS else "flag"
    if step == "judge":
        band = detail.get("decision_band")
        return band if band in {"recommended", "needs_review", "blocked"} else "completed"
    if step == "draft_cap":
        return "skipped_blocked" if detail.get("cap") == "skipped_blocked" else "drafted"
    if step == "plan_prepositioning":
        return "planned" if detail.get("plan_status") == "planned" else "abstained"
    if step == "hand_to_human":
        return "handed_to_human"
    return "completed"


def tick_view(row: dict) -> dict:
    return {"id": str(row["id"]), "started_at": _iso(row.get("started_at")), "finished_at": _iso(row.get("finished_at")),
            "duration_ms": _ms(row.get("started_at"), row.get("finished_at")), "outcome": row.get("outcome"),
            "runs_started": int(row.get("runs_started") or 0), "flags_recorded": int(row.get("flags_recorded") or 0)}


def build(state: dict, audit: list[dict], ticks: list[dict] | None) -> dict:
    steps = proactive_run.run_steps(state)
    budget = int(state.get("step_budget") or len(steps))
    completed = {c["step"]: c for c in (state.get("completed_steps") or []) if isinstance(c, dict)}
    events, previous, used = [], _iso(state.get("created_at")), 0
    for row in audit[:MAX_EVENTS]:
        step, at = row.get("step"), _iso(row.get("at"))
        is_step = step in steps
        if is_step:
            used += 1
        record = completed.get(step) if is_step else None
        started = _iso(record.get("started_at")) if record else None
        events.append({"step": step, "kind": "step" if is_step else step if step in {"start", "cancel", "sentinel_flag"} else "other",
                       "started_at": started or previous, "finished_at": at,
                       "duration_ms": record.get("duration_ms") if record and isinstance(record.get("duration_ms"), int) else None,
                       "wait_ms": _ms(previous, started or at), "actor": str(row.get("actor", ""))[:120],
                       "actor_kind": _actor_kind(row.get("actor", "")), "outcome": _outcome(step, row.get("detail")),
                       "budget_used": used, "budget_remaining": max(0, budget - used)})
        previous = at or previous
    status = state.get("status")
    nodes = []
    for index, step in enumerate(steps):
        record = completed.get(step)
        node_status = "done" if record else "next" if state.get("next_step") == step and status == "running" \
            else "blocked" if status == "cancelled" else "pending"
        event = next((e for e in events if e["step"] == step), None)
        nodes.append({"index": index, "step": step, "status": node_status,
                      "actor_kind": _actor_kind(record.get("completed_by", "")) if record else None,
                      "outcome": event["outcome"] if event else None,
                      "duration_ms": event["duration_ms"] if event else None, "finished_at": event["finished_at"] if event else None})
    flags = {name: 0 for name in SENTINEL_FLAGS}
    for flag in state.get("sentinel_flags") or []:
        if isinstance(flag, dict) and flag.get("flag") in flags:
            flags[flag["flag"]] += 1
    cancellation = None
    if status == "cancelled":
        cancellation = {"by_kind": _actor_kind(state.get("cancelled_by", "")),
                        "reason": str(state.get("cancellation_rationale") or "")[:MAX_REASON]}
    done = len([s for s in steps if s in completed])
    return {"version": "aegis.proactive.observability.v1", "run_id": state.get("id"), "status": status,
            "origin": state.get("origin") or "operator", "step_budget": budget, "budget_used": done,
            "budget_remaining": max(0, budget - done), "next_step": state.get("next_step"), "nodes": nodes, "events": events,
            "total_step_ms": sum(n["duration_ms"] or 0 for n in nodes), "sentinel_flags": flags, "cancellation": cancellation,
            "scheduler_ticks": None if ticks is None else [tick_view(t) for t in ticks[:10]],
            "note": "Derived from run state and audit. Read-only; timings are local wall-clock measurements."}
