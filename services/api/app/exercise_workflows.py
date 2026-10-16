"""Prototype workflow endpoints. Local exercise actors are asserted, NOT verified.

Deliberately feature-gated and disabled by default. This API must never be
enabled on a network accessible to other users until real authentication,
authorization and abuse controls are implemented.
"""
import os
from enum import Enum
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.governance import Action, DecisionError
from app.workflow_store import create_proposal, transition, list_proposals

router = APIRouter(prefix="/v1/exercise/proposals", tags=["Exercise workflow"])


def _require_local_exercise():
    if os.getenv("ENABLE_INSECURE_EXERCISE_WORKFLOW") != "true":
        raise HTTPException(status_code=403, detail="Insecure exercise workflow is disabled; verified authentication required")


class CreateProposal(BaseModel):
    incident_id: UUID
    maker_subject: str = Field(min_length=3, max_length=80)
    action_type: Action
    rationale: str = Field(min_length=10, max_length=2000)


class Operation(str, Enum):
    submit = "submit"
    approve = "approve"
    reject = "reject"


class ChangeProposal(BaseModel):
    actor_subject: str = Field(min_length=3, max_length=80)
    operation: Operation
    rationale: str | None = Field(default=None, max_length=2000)


@router.get("")
def proposals():
    _require_local_exercise()
    return list_proposals()


@router.post("", status_code=201)
def create(payload: CreateProposal):
    _require_local_exercise()
    try:
        proposal_id = create_proposal(str(payload.incident_id), payload.maker_subject, payload.action_type, payload.rationale)
        return {"id": proposal_id, "status": "draft", "exercise_only": True}
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err


@router.post("/{proposal_id}/transition")
def change(proposal_id: UUID, payload: ChangeProposal):
    _require_local_exercise()
    try:
        status = transition(str(proposal_id), payload.actor_subject, payload.operation.value, payload.rationale)
        return {"id": str(proposal_id), "status": status, "exercise_only": True}
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except DecisionError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
