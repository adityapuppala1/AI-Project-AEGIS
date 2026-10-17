from datetime import datetime, timedelta, timezone

import pytest
from app.governance import DecisionError
from app.proposal_simulation import PLAYBOOK, simulation_receipt


def draft():
    return {"playbook": {"version": PLAYBOOK}, "operational_actions_enabled": False}


@pytest.mark.parametrize("state", ["draft", "submitted", "rejected"])
def test_no_simulated_tasks_before_independent_approval(state):
    with pytest.raises(DecisionError, match="approval"):
        simulation_receipt("id", state, draft())


@pytest.mark.parametrize("context", [None, {}, {"playbook": {"version": "unknown"}},
                                     {"playbook": {"version": PLAYBOOK}, "operational_actions_enabled": True}])
def test_missing_legacy_or_unsafe_snapshot_cannot_simulate(context):
    with pytest.raises(DecisionError):
        simulation_receipt("id", "approved", context)


def test_simulated_receipt_never_claims_real_acknowledgements():
    receipt = simulation_receipt("id", "approved", draft())
    assert receipt["outbound_messages_sent"] is False
    assert receipt["operational_actions_enabled"] is False
    assert receipt["acknowledgements_are_scripted"] is True
    for task in receipt["tasks"]:
        assert task["summary"].startswith("SIMULATION:")
        assert [event["kind"] for event in task["events"]] == ["prepared", "acknowledged", "closed"]
        assert all(event["scripted"] for event in task["events"])


def test_staged_tasks_require_acknowledgement_and_preserve_history():
    from app.proposal_simulation import prepare_task_receipt, advance_task
    receipt = prepare_task_receipt("id", "approved", draft())
    assert receipt["version"].endswith("v3")
    assert receipt["sla_policy"] == "aegis.exercise.department-sla.v1"
    assert [task["sla_minutes"] for task in receipt["tasks"]] == [15, 30, 45]
    assert all(t["state"] == "prepared" and len(t["events"]) == 1 for t in receipt["tasks"])
    with pytest.raises(DecisionError):
        advance_task(receipt, "control_room", "close_task", "operator", "SIMULATION: close too soon")
    acknowledged, changed = advance_task(receipt, "control_room", "acknowledge_task", "operator", "SIMULATION: desk review")
    assert changed and receipt["tasks"][0]["state"] == "prepared"
    again, changed = advance_task(acknowledged, "control_room", "acknowledge_task", "different", "SIMULATION: duplicate retry")
    assert not changed and again == acknowledged
    closed, changed = advance_task(acknowledged, "control_room", "close_task", "operator", "SIMULATION: review complete")
    assert changed
    assert [e["kind"] for e in closed["tasks"][0]["events"]] == ["prepared", "acknowledged", "closed"]
    assert closed["tasks"][0]["events"][1]["actor_subject"] == "operator"
    for operation in ("acknowledge_task", "close_task"):
        unchanged, changed = advance_task(closed, "control_room", operation, "different", "SIMULATION: retry after close")
        assert not changed and unchanged == closed
    assert all(t["state"] == "prepared" for t in closed["tasks"][1:])


def test_synthetic_sla_classification_is_deterministic_and_auditable():
    from app.proposal_simulation import prepare_task_receipt, advance_task
    started = datetime(2026, 10, 17, 10, 0, tzinfo=timezone.utc)
    receipt = prepare_task_receipt("id", "approved", draft(), now=started)
    on_time, _ = advance_task(receipt, "control_room", "acknowledge_task", "operator",
                              "SIMULATION: on-time desk review", now=started + timedelta(minutes=15))
    assert on_time["tasks"][0]["sla_status"] == "within_synthetic_target"
    assert on_time["tasks"][0]["events"][-1]["due_at"] == receipt["tasks"][0]["due_at"]
    late, _ = advance_task(receipt, "infrastructure", "acknowledge_task", "operator",
                           "SIMULATION: delayed desk review", now=started + timedelta(minutes=31))
    assert late["tasks"][1]["sla_status"] == "synthetic_target_elapsed"


def test_v2_staged_receipt_remains_advanceable_without_invented_sla():
    from app.proposal_simulation import prepare_task_receipt, advance_task
    receipt = prepare_task_receipt("id", "approved", draft())
    receipt["version"] = "aegis.proposal.simulation.v2"
    receipt.pop("sla_policy")
    for task in receipt["tasks"]:
        for key in ("sla_minutes", "due_at", "sla_status"):
            task.pop(key)
    advanced, changed = advance_task(receipt, "control_room", "acknowledge_task",
                                     "operator", "SIMULATION: compatible old receipt")
    assert changed is True
    assert "sla_status" not in advanced["tasks"][0]


@pytest.mark.parametrize("task_id,operation,reason", [("unknown", "acknowledge_task", "Long enough reason"),
    ("control_room", "unknown", "Long enough reason"), ("control_room", "acknowledge_task", "short"),
    ("control_room", "acknowledge_task", "x" * 2001)])
def test_invalid_task_writes_fail(task_id, operation, reason):
    from app.proposal_simulation import prepare_task_receipt, advance_task
    with pytest.raises(DecisionError):
        advance_task(prepare_task_receipt("id", "approved", draft()), task_id, operation, "operator", reason)


def test_legacy_and_unsafe_receipts_cannot_be_rewritten():
    from app.proposal_simulation import prepare_task_receipt, advance_task
    for receipt in (None, simulation_receipt("id", "approved", draft()),
                    {**prepare_task_receipt("id", "approved", draft()), "outbound_messages_sent": True}):
        with pytest.raises(DecisionError):
            advance_task(receipt, "control_room", "acknowledge_task", "operator", "SIMULATION: rejected write")
