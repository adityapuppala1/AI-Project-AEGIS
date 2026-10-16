"""Pure policy and state-transition rules for an exercise approval workflow.

These rules do not authenticate operators and cannot dispatch responders or send
public warnings. Any future persistent workflow must enforce identity using SSO
and evaluate policies server-side within a database transaction.
"""
from dataclasses import dataclass
from enum import Enum


class DecisionError(ValueError):
    """A proposed workflow transition violates the approval policy."""


class Status(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class Action(str, Enum):
    INTERNAL_TRIAGE = "internal_triage"
    PREPARE_WARNING = "prepare_warning"
    PROPOSE_DISPATCH = "propose_dispatch"


@dataclass(frozen=True)
class Proposal:
    proposal_id: str
    incident_id: str
    maker_subject: str
    action: Action
    status: Status = Status.DRAFT
    checker_subject: str | None = None
    decision_reason: str | None = None


def submit(proposal: Proposal, actor_subject: str) -> Proposal:
    if proposal.status is not Status.DRAFT:
        raise DecisionError("Only draft proposals can be submitted")
    if actor_subject != proposal.maker_subject:
        raise DecisionError("Only the proposal maker can submit it")
    return Proposal(
        proposal_id=proposal.proposal_id,
        incident_id=proposal.incident_id,
        maker_subject=proposal.maker_subject,
        action=proposal.action,
        status=Status.SUBMITTED,
    )


def review(proposal: Proposal, checker_subject: str, approve: bool, reason: str) -> Proposal:
    if proposal.status is not Status.SUBMITTED:
        raise DecisionError("Only submitted proposals can be reviewed")
    if not checker_subject.strip() or checker_subject == proposal.maker_subject:
        raise DecisionError("A separate identified checker must review this proposal")
    if not reason.strip():
        raise DecisionError("Reviewer must provide a decision rationale")
    return Proposal(
        proposal_id=proposal.proposal_id,
        incident_id=proposal.incident_id,
        maker_subject=proposal.maker_subject,
        action=proposal.action,
        status=Status.APPROVED if approve else Status.REJECTED,
        checker_subject=checker_subject,
        decision_reason=reason.strip(),
    )


def may_execute_live_action(*_: object, **__: object) -> bool:
    """Exercise environment is categorically incapable of live actions."""
    return False
