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
