"""Signed-department inbox for approved synthetic rehearsals only."""
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from app.security import Operator, get_operator, require_role
from app.governance import DecisionError
from app.workflow_store import list_department_tasks, transition

router = APIRouter(prefix="/v1/exercise/department-tasks", tags=["Department rehearsal"])


def department_scope(operator: Operator = Depends(get_operator)) -> Operator:
    require_role(operator, {"department_operator"})
    if operator.department_id not in {"control_room", "infrastructure", "communications"}:
        raise HTTPException(status_code=403, detail="Verified department scope required")
    return operator


class TaskChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["acknowledge_task", "close_task"]
    rationale: str = Field(min_length=10, max_length=2000)


@router.get("")
def inbox(operator: Operator = Depends(department_scope)):
    return {"department_id": operator.department_id, "exercise_only": True,
            "tasks": list_department_tasks(operator.agency_id, operator.department_id)}


@router.post("/{proposal_id}/transition")
def change(proposal_id: UUID, payload: TaskChange, operator: Operator = Depends(department_scope)):
    try:
        status = transition(str(proposal_id), operator.agency_id, operator.subject,
                            payload.operation, payload.rationale,
                            task_id=operator.department_id, department_id=operator.department_id)
        return {"id": str(proposal_id), "status": status, "exercise_only": True}
    except LookupError as err:
        raise HTTPException(status_code=404, detail="Exercise task not found") from err
    except DecisionError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
