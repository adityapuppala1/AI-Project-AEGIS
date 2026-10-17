"""Private proposal-linked tabletop receipts. No transport or real recipients."""
from datetime import datetime, timedelta, timezone

from app.governance import DecisionError

PLAYBOOK = "AEGIS-URBAN-FLOOD-EXERCISE-v0.1"


def simulation_receipt(proposal_id: str, status: str, draft: dict | None) -> dict:
    if status != "approved":
        raise DecisionError("Independent approval is required before task simulation")
    if not draft or draft.get("playbook", {}).get("version") != PLAYBOOK:
        raise DecisionError("Create a new evidence-linked response draft before simulation")
    if draft.get("operational_actions_enabled") is not False:
        raise DecisionError("Only synthetic response drafts can be simulated")
    now = datetime.now(timezone.utc).isoformat()
    return {
        "version": "aegis.proposal.simulation.v1",
        "proposal_id": proposal_id,
        "synthetic": True,
        "outbound_messages_sent": False,
        "acknowledgements_are_scripted": True,
        "operational_actions_enabled": False,
        "generated_at": now,
        "playbook_ref": PLAYBOOK,
        "tasks": [
            {"department": department, "playbook_step": step,
             "summary": "SIMULATION: " + summary, "state": "closed",
             "events": [
                 {"kind": kind, "occurred_at": now, "scripted": True}
                 for kind in ("prepared", "acknowledged", "closed")
             ]}
            for department, step, summary in (
                ("Fictional control room", "URB-01", "Review evidence and uncertainty"),
                ("Fictional infrastructure desk", "URB-03", "Review infrastructure-check draft"),
                ("Fictional communications desk", "URB-05", "Review communications draft; never send"),
            )
        ],
    }


TASK_IDS = ("control_room", "infrastructure", "communications")
TASK_SLA_MINUTES = {"control_room": 15, "infrastructure": 30, "communications": 45}


def prepare_task_receipt(proposal_id: str, status: str, draft: dict | None,
                         *, now: datetime | None = None) -> dict:
    """Staged rehearsal; preserve the legacy one-shot simulation contract."""
    receipt = simulation_receipt(proposal_id, status, draft)
    prepared_at = now or datetime.now(timezone.utc)
    receipt["version"] = "aegis.proposal.simulation.v3"
    receipt["sla_policy"] = "aegis.exercise.department-sla.v1"
    for task_id, task in zip(TASK_IDS, receipt["tasks"]):
        task["id"] = task_id
        task["state"] = "prepared"
        task["sla_minutes"] = TASK_SLA_MINUTES[task_id]
        task["due_at"] = (prepared_at + timedelta(minutes=TASK_SLA_MINUTES[task_id])).isoformat()
        task["sla_status"] = "awaiting_scripted_acknowledgement"
        task["events"] = [{"kind": "prepared", "occurred_at": prepared_at.isoformat(),
                           "scripted": True}]
    return receipt


def advance_task(receipt: dict | None, task_id: str, operation: str,
                 actor: str, rationale: str, *, now: datetime | None = None) -> tuple[dict, bool]:
    from copy import deepcopy
    if (not receipt or receipt.get("version") not in
            {"aegis.proposal.simulation.v2", "aegis.proposal.simulation.v3"} or
            receipt.get("synthetic") is not True or
            receipt.get("outbound_messages_sent") is not False or
            receipt.get("operational_actions_enabled") is not False or
            receipt.get("acknowledgements_are_scripted") is not True):
        raise DecisionError("Prepare staged exercise tasks on a new approved proposal")
    if task_id not in TASK_IDS or operation not in {"acknowledge_task", "close_task"}:
        raise DecisionError("Unknown scripted task operation")
    reason = rationale.strip()
    if not 10 <= len(reason) <= 2000:
        raise DecisionError("Record a task rationale between 10 and 2000 characters")
    result = deepcopy(receipt)
    task = next((item for item in result["tasks"] if item.get("id") == task_id), None)
    if task is None:
        raise DecisionError("Scripted task not found in this receipt")
    target = "acknowledged" if operation == "acknowledge_task" else "closed"
    if any(event["kind"] == target for event in task["events"]):
        return result, False  # Retries never add another event or rewrite an actor.
    expected = "prepared" if target == "acknowledged" else "acknowledged"
    if task["state"] != expected:
        raise DecisionError("Acknowledge the scripted task before closing it")
    event_time = now or datetime.now(timezone.utc)
    task["state"] = target
    event = {"kind": target, "occurred_at": event_time.isoformat(),
             "scripted": True, "actor_subject": actor, "rationale": reason}
    if target == "acknowledged" and receipt["version"] == "aegis.proposal.simulation.v3":
        due_at = datetime.fromisoformat(task["due_at"].replace("Z", "+00:00"))
        task["sla_status"] = "within_synthetic_target" if event_time <= due_at else "synthetic_target_elapsed"
        event["sla_status"] = task["sla_status"]
        event["due_at"] = task["due_at"]
    task["events"].append(event)
    return result, True
