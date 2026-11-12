"""Authenticated, agency-scoped, exercise-only maker-checker endpoints.

No endpoint here sends warnings or dispatches responders. Actor identity,
assigned agency and roles MUST be taken from verified OIDC JWT claims.
"""
from enum import Enum
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from app.governance import Action, DecisionError
from app.security import Operator, get_operator, require_role
from app.workflow_store import create_proposal, transition, list_proposals, list_agency_exercise_incidents, proposal_audit

router = APIRouter(prefix="/v1/exercise/proposals", tags=["Authenticated exercise workflow"])


class CreateProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    incident_id: UUID
    action_type: Action
    rationale: str = Field(min_length=10, max_length=2000)
    include_review_focus: StrictBool = False


class Operation(str, Enum):
    submit = "submit"
    approve = "approve"
    reject = "reject"
    simulate = "simulate"
    prepare_tasks = "prepare_tasks"
    acknowledge_task = "acknowledge_task"
    close_task = "close_task"
    reassign_task = "reassign_task"
    start_assistance = "start_assistance"
    advance_assistance = "advance_assistance"
    cancel_assistance = "cancel_assistance"


class ChangeProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Operation
    rationale: str | None = Field(default=None, max_length=2000)
    task_id: Literal["control_room", "infrastructure", "communications"] | None = None
    target_department: Literal["control_room", "infrastructure", "communications"] | None = None
    expected_assignment_version: StrictInt | None = Field(default=None, ge=0)
    assistance_step: Literal["gather_references", "check_quality", "validate_draft"] | None = None


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
def proposals(background: BackgroundTasks, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator", "incident_checker", "incident_auditor"})
    rows = list_proposals(operator.agency_id)
    # Staff email register refresh from the verified token (after the response; best effort; off without -StaffEmail).
    from app.staff_messages import refresh_contact
    background.add_task(refresh_contact, operator)
    return rows


@router.post("", status_code=201)
def create(payload: CreateProposal, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator"})
    from app.assessment_adapter import ContextUnavailable
    try:
        proposal_id = create_proposal(
            str(payload.incident_id),
            operator.agency_id,
            operator.subject,
            payload.action_type,
            payload.rationale,
            **({"include_review_focus": True} if payload.include_review_focus else {}),
        )
        return {"id": proposal_id, "status": "draft", "exercise_only": True}
    except ContextUnavailable as err:
        raise HTTPException(status_code=503, detail={"code": err.code}) from err
    except DecisionError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except LookupError as err:
        # Also covers out-of-agency incidents without disclosing their existence.
        raise HTTPException(status_code=404, detail="Exercise incident not found") from err


@router.post("/{proposal_id}/transition")
def change(
    proposal_id: UUID,
    payload: ChangeProposal,
    background: BackgroundTasks,
    operator: Operator = Depends(get_operator),
):
    if payload.operation in (Operation.submit, Operation.simulate, Operation.prepare_tasks, Operation.acknowledge_task, Operation.close_task, Operation.reassign_task,
                             Operation.start_assistance, Operation.advance_assistance, Operation.cancel_assistance):
        require_role(operator, {"incident_operator"})
    else:
        require_role(operator, {"incident_checker"})
    task_operation = payload.operation in (Operation.acknowledge_task, Operation.close_task, Operation.reassign_task)
    if task_operation != (payload.task_id is not None):
        raise HTTPException(status_code=422, detail="Task identifier required only for task transitions")
    reassign = payload.operation is Operation.reassign_task
    if reassign != (payload.target_department is not None and payload.expected_assignment_version is not None):
        raise HTTPException(status_code=422, detail="Reassignment requires department and expected assignment version")
    if not reassign and (payload.target_department is not None or payload.expected_assignment_version is not None):
        raise HTTPException(status_code=422, detail="Unexpected assignment fields")
    assistance_advance = payload.operation is Operation.advance_assistance
    if assistance_advance != (payload.assistance_step is not None):
        raise HTTPException(status_code=422, detail="Assistance step required only when advancing a run")
    from app.assessment_adapter import ContextUnavailable
    try:
        task_args = {"task_id": payload.task_id} if task_operation else {}
        if reassign:
            task_args.update(target_department=payload.target_department, expected_assignment_version=payload.expected_assignment_version)
        if assistance_advance:
            task_args["assistance_step"] = payload.assistance_step
        status = transition(
            str(proposal_id),
            operator.agency_id,
            operator.subject,
            payload.operation.value,
            payload.rationale,
            **task_args,
        )
        from app.staff_messages import refresh_contact
        background.add_task(refresh_contact, operator)  # register refresh, best effort, after the response
        if payload.operation is Operation.submit:
            # Staff email notice (docs/COMMUNICATION_CHANNELS.md): runs after the committed transaction and after this
            # response, best effort, and can never fail, delay or change the transition. Off unless AEGIS_STAFF_EMAIL=1.
            from app.staff_messages import notify_approval_waiting
            background.add_task(notify_approval_waiting, operator.agency_id, operator.subject)
        return {"id": str(proposal_id), "status": status, "exercise_only": True}
    except ContextUnavailable as err:
        raise HTTPException(status_code=503, detail={"code": err.code}) from err
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
