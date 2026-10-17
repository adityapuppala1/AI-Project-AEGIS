"""Authenticated, agency-scoped, exercise-only maker-checker endpoints.

No endpoint here sends warnings or dispatches responders. Actor identity,
assigned agency and roles MUST be taken from verified OIDC JWT claims.
"""
from enum import Enum
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

from app.governance import Action, DecisionError
from app.security import Operator, get_operator, require_role
from app.workflow_store import create_proposal, transition, list_proposals, list_agency_exercise_incidents, proposal_audit

router = APIRouter(prefix="/v1/exercise/proposals", tags=["Authenticated exercise workflow"])


class CreateProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    incident_id: UUID
    action_type: Action
    rationale: str = Field(min_length=10, max_length=2000)


class Operation(str, Enum):
    submit = "submit"
    approve = "approve"
    reject = "reject"
    simulate = "simulate"
    prepare_tasks = "prepare_tasks"
    acknowledge_task = "acknowledge_task"
    close_task = "close_task"


class ChangeProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Operation
    rationale: str | None = Field(default=None, max_length=2000)
    task_id: Literal["control_room", "infrastructure", "communications"] | None = None


@router.get("/identity")
def identity_context(operator: Operator = Depends(get_operator)):
    """Allow a signed-in operator to inspect their verified agency/role scope."""
    return {
        "subject": operator.subject,
        "agency_id": str(operator.agency_id),
        "roles": sorted(operator.roles),
        "exercise_only": True,
    }


@router.get("/incidents")
def available_exercise_incidents(operator: Operator = Depends(get_operator)):
    """List only synthetic cases belonging to the authenticated agency."""
    require_role(operator, {"incident_operator", "incident_checker", "incident_auditor"})
    return list_agency_exercise_incidents(operator.agency_id)


@router.get("")
def proposals(operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator", "incident_checker", "incident_auditor"})
    return list_proposals(operator.agency_id)


@router.post("", status_code=201)
def create(payload: CreateProposal, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator"})
    try:
        proposal_id = create_proposal(
            str(payload.incident_id),
            operator.agency_id,
            operator.subject,
            payload.action_type,
            payload.rationale,
        )
        return {"id": proposal_id, "status": "draft", "exercise_only": True}
    except DecisionError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except LookupError as err:
        # Also covers out-of-agency incidents without disclosing their existence.
        raise HTTPException(status_code=404, detail="Exercise incident not found") from err


@router.post("/{proposal_id}/transition")
def change(
    proposal_id: UUID,
    payload: ChangeProposal,
    operator: Operator = Depends(get_operator),
):
    if payload.operation in (Operation.submit, Operation.simulate, Operation.prepare_tasks, Operation.acknowledge_task, Operation.close_task):
        require_role(operator, {"incident_operator"})
    else:
        require_role(operator, {"incident_checker"})
    task_operation = payload.operation in (Operation.acknowledge_task, Operation.close_task)
    if task_operation != (payload.task_id is not None):
        raise HTTPException(status_code=422, detail="Task identifier required only for task transitions")
    try:
        task_args = {"task_id": payload.task_id} if task_operation else {}
        status = transition(
            str(proposal_id),
            operator.agency_id,
            operator.subject,
            payload.operation.value,
            payload.rationale,
            **task_args,
        )
        return {"id": str(proposal_id), "status": status, "exercise_only": True}
    except LookupError as err:
        raise HTTPException(status_code=404, detail="Exercise proposal not found") from err
    except DecisionError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err


@router.get("/{proposal_id}/audit")
def private_proposal_audit(proposal_id: UUID, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator", "incident_checker", "incident_auditor"})
    try:
        return proposal_audit(str(proposal_id), operator.agency_id)
    except LookupError as err:
        raise HTTPException(status_code=404, detail="Exercise proposal not found") from err


@router.get("/{proposal_id}/cap-draft", response_class=Response,
            responses={200: {"content": {"application/xml": {}},
                             "description": "Private exercise draft; never transmit"}})
def private_cap_draft(proposal_id: UUID, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator", "incident_checker", "incident_auditor"})
    from app.cap_draft import cap_draft_xml
    try:
        xml = cap_draft_xml(proposal_audit(str(proposal_id), operator.agency_id))
        return Response(xml, media_type="application/xml", headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'attachment; filename="aegis-exercise-{proposal_id}-draft.xml"',
            "X-Content-Type-Options": "nosniff",
        })
    except LookupError as err:
        raise HTTPException(status_code=404, detail="Exercise proposal not found") from err
    except DecisionError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
