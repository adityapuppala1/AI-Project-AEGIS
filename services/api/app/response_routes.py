"""Team response loop routes (docs/RESPONSE_LOOP.md). Exercise only: nobody is called, texted or emailed.

Scope comes only from the verified Operator: agency, department (desk), team (response team) and subject.
The body never names a team scope, a department or an actor. Errors are fixed strings.
"""
from typing import Literal
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from app import response_loop as rules
from app import response_store as store
from app.governance import DecisionError
from app.security import TEAM_IDS, Operator, get_operator

router = APIRouter(prefix="/v1/exercise/response", tags=["Team response rehearsal"])
READERS = frozenset({"incident_operator", "incident_checker", "incident_auditor"})
DEPARTMENTS = frozenset(rules.TASK_IDS)
LABEL = "Exercise only. Nobody was called, texted, emailed or radioed."

TeamId = Literal["syn-team-rescue-01", "syn-team-rescue-02", "syn-team-health-01", "syn-team-fire-01",
                 "syn-team-municipal-01"]
TaskId = Literal["control_room", "infrastructure", "communications"]
ReportKind = Literal["accepted", "declined", "en_route", "on_site", "completed", "situation_report",
                     "needs_support", "stood_down", "desk_handled"]
Code = Literal["already_committed", "out_of_area", "not_equipped", "off_shift", "other", "as_expected",
               "worse_than_expected", "better_than_expected", "access_blocked", "nothing_found",
               "more_people", "equipment", "medical", "transport"]


def caller_view(operator: Operator) -> tuple[str, str | None]:
    """-> ('team', team_id) | ('department', department_id) | ('reader', None). Ambiguous or admin tokens fail."""
    roles = operator.roles
    if "platform_admin" in roles:
        raise HTTPException(status_code=403, detail="Insufficient agency role")
    team = "response_team" in roles
    desk = "department_operator" in roles
    if team and desk:
        raise HTTPException(status_code=403, detail="Ambiguous response scope")
    if team:
        if operator.team_id not in TEAM_IDS:
            raise HTTPException(status_code=403, detail="Verified team scope required")
        return "team", operator.team_id
    if desk:
        if operator.department_id not in DEPARTMENTS:
            raise HTTPException(status_code=403, detail="Verified department scope required")
        return "department", operator.department_id
    if roles & READERS:
        return "reader", None
    raise HTTPException(status_code=403, detail="Insufficient agency role")


def _desk(operator: Operator) -> str:
    view, scope = caller_view(operator)
    if view != "department":
        raise HTTPException(status_code=403, detail="Insufficient agency role")
    return scope or ""


class CreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    proposal_id: UUID
    task_id: TaskId
    team_id: TeamId
    expected_assignment_version: StrictInt = Field(ge=0)
    note: StrictStr = Field(min_length=10, max_length=1000)


class ReportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ReportKind
    expected_version: StrictInt = Field(ge=0)
    note: StrictStr = Field(min_length=10, max_length=1000)
    code: Code | None = None


def _fail(err: Exception):
    """Map known failures to fixed strings; never echo raw exception or connection text."""
    if isinstance(err, rules.ResponseError):
        raise HTTPException(status_code=err.status, detail=err.message) from None
    if isinstance(err, LookupError):
        raise HTTPException(status_code=404, detail="Team request or task not found") from None
    if isinstance(err, DecisionError):
        raise HTTPException(status_code=409, detail=str(err)) from None  # fixed messages raised in our own code
    if isinstance(err, psycopg.errors.UniqueViolation):
        raise HTTPException(status_code=409, detail="This team already has an active request for this task") from None
    if isinstance(err, (psycopg.Error, KeyError, OSError)):
        raise HTTPException(status_code=503, detail="Response loop storage unavailable") from None
    raise err


@router.get("/teams")
def teams(proposal_id: UUID, task_id: TaskId, operator: Operator = Depends(get_operator)):
    department = _desk(operator)
    try:
        result = store.team_options(operator.agency_id, department, str(proposal_id), task_id)
    except Exception as err:  # noqa: BLE001 - mapped to fixed strings
        _fail(err)
    return {**result, "label": LABEL}


@router.get("/requests")
def requests_list(incident_id: UUID | None = Query(default=None), operator: Operator = Depends(get_operator)):
    view, scope = caller_view(operator)
    try:
        items = store.list_requests(operator.agency_id, operator.subject, view=view, scope_value=scope,
                                    incident_id=str(incident_id) if incident_id else None)
    except Exception as err:  # noqa: BLE001
        _fail(err)
    return {"view": view, "requests": items, "exercise_only": True, "outbound_messages_sent": False, "label": LABEL}


@router.post("/requests", status_code=201)
def create(payload: CreateRequest, operator: Operator = Depends(get_operator)):
    department = _desk(operator)
    try:
        item, created = store.create_request(operator.agency_id, department, operator.subject, str(payload.proposal_id),
                                             payload.task_id, payload.team_id, payload.expected_assignment_version,
                                             payload.note)
    except Exception as err:  # noqa: BLE001
        _fail(err)
    body = {"request": item, "exercise_only": True, "outbound_messages_sent": False, "label": LABEL}
    return body if created else JSONResponse(status_code=200, content=body)


@router.post("/requests/{request_id}/reports")
def report(request_id: UUID, payload: ReportBody, operator: Operator = Depends(get_operator)):
    view, scope = caller_view(operator)
    if view == "reader":
        raise HTTPException(status_code=403, detail="Insufficient agency role")
    try:
        item = store.record_report(operator.agency_id, operator.subject, str(request_id), caller=view,
                                   scope_value=scope or "", kind=payload.kind, expected_version=payload.expected_version,
                                   note=payload.note, code=payload.code)
    except Exception as err:  # noqa: BLE001
        _fail(err)
    return {"request": item, "exercise_only": True, "outbound_messages_sent": False, "label": LABEL}


@router.get("/alerts")
def alerts(operator: Operator = Depends(get_operator)):
    if "platform_admin" in operator.roles:
        return {"count": 0, "exercise_only": True}
    view, scope = caller_view(operator)
    if view == "reader":
        return {"count": 0, "exercise_only": True}
    try:
        count = store.alert_count(operator.agency_id, view=view, scope_value=scope)
    except Exception as err:  # noqa: BLE001
        _fail(err)
    return {"count": count, "exercise_only": True}
