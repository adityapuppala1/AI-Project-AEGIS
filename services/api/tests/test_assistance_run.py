"""Pure bounded-run tests; timestamps and IDs are intentionally opaque."""
import pytest

from app.assistance_run import advance_run, cancel_run, start_run
from app.governance import DecisionError


def payload():
    return {"response_draft": {"context_fingerprint": "sha256:test", "context_state": "limited",
            "explicit_unknowns": ["forecast"], "recommendation_draft": ["Review"],
            "playbook": {"version": "urban-v1", "synthetic_evidence_ids": ["e1"]},
            "review_brief": {"findings": [{"text": "f"}], "limitations": ["synthetic"]}},
            "review_focus": {"status": "template_fallback"}}


def test_run_is_bounded_resumable_and_stops_for_review():
    data = payload()
    run, changed = start_run(data, "maker")
    assert changed and run["step_budget"] == 3 and run["operational_actions_enabled"] is False
    same, changed = start_run({**data, "assistance_run": run}, "maker")
    assert same == run and changed is False
    for expected in ("gather_references", "check_quality", "validate_draft"):
        run, changed = advance_run(run, data, "maker", expected)
        assert changed and run["completed_steps"][-1]["step"] == expected
    assert run["status"] == "review_ready" and run["next_step"] is None
    assert run["completed_steps"][-1]["result"]["submission_performed"] is False
    assert advance_run(run, data, "maker", "validate_draft") == (run, False)


def test_cancel_is_durable_and_cannot_resume():
    data = payload()
    run, _ = start_run(data, "maker")
    with pytest.raises(DecisionError, match="10 characters"):
        cancel_run(run, "maker", "short")
    run, changed = cancel_run(run, "maker", "SIMULATION: operator stopped run")
    assert changed and run["status"] == "cancelled" and run["cancelled_by"] == "maker"
    assert cancel_run(run, "maker", "SIMULATION: retry cancellation") == (run, False)
    with pytest.raises(DecisionError, match="cannot be resumed"):
        advance_run(run, data, "maker", "gather_references")


def test_missing_or_corrupt_state_fails_closed():
    with pytest.raises(DecisionError, match="versioned"):
        start_run({}, "maker")
    with pytest.raises(DecisionError, match="Start"):
        advance_run(None, payload(), "maker", "gather_references")
    run, _ = start_run(payload(), "maker")
    run["next_step"] = "invent_action"
    with pytest.raises(DecisionError, match="invalid"):
        advance_run(run, payload(), "maker", "gather_references")


def test_retry_of_completed_step_is_idempotent_and_out_of_order_fails():
    data = payload(); run, _ = start_run(data, "maker")
    with pytest.raises(DecisionError, match="out of order"):
        advance_run(run, data, "maker", "check_quality")
    run, _ = advance_run(run, data, "maker", "gather_references")
    assert advance_run(run, data, "maker", "gather_references") == (run, False)
