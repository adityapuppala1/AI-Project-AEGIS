"""Private proposal-linked tabletop receipts. No transport or real recipients."""
from datetime import datetime, timezone

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
