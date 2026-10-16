import pytest
from app.governance import Action, DecisionError, Proposal, Status, may_execute_live_action, review, submit


def example() -> Proposal:
    return Proposal("proposal-1", "incident-1", "operator-1", Action.PREPARE_WARNING)


def test_valid_independent_checker_transition():
    pending = submit(example(), "operator-1")
    assert pending.status is Status.SUBMITTED
    approved = review(pending, "supervisor-2", True, "Exercise SOP evidence checked")
    assert approved.status is Status.APPROVED
    assert approved.checker_subject == "supervisor-2"
    assert approved.decision_reason == "Exercise SOP evidence checked"


def test_maker_cannot_self_approve():
    with pytest.raises(DecisionError, match="separate"):
        review(submit(example(), "operator-1"), "operator-1", True, "I approve")


def test_no_double_approval_or_unsubmitted_review():
    with pytest.raises(DecisionError, match="submitted"):
        review(example(), "supervisor-2", True, "Okay")
    approved = review(submit(example(), "operator-1"), "supervisor-2", True, "Exercise verification")
    with pytest.raises(DecisionError, match="submitted"):
        review(approved, "supervisor-3", True, "Try again")


def test_reject_requires_rationale():
    with pytest.raises(DecisionError, match="rationale"):
        review(submit(example(), "operator-1"), "supervisor-2", False, " ")
    rejected = review(submit(example(), "operator-1"), "supervisor-2", False, "Incorrect jurisdiction")
    assert rejected.status is Status.REJECTED


def test_only_maker_can_submit():
    with pytest.raises(DecisionError, match="maker"):
        submit(example(), "other-user")


def test_live_action_denied_under_all_modes():
    for action in Action:
        assert may_execute_live_action(action=action) is False
