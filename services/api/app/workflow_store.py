"""Transactional and agency-scoped storage for exercise proposals.

The endpoint layer verifies JWTs and required roles. Every database query
also restricts by signed agency scope, including locked transitions.
"""
import json
import os
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

from app.governance import Action, DecisionError, Proposal, Status, submit, review


def _convert(row):
    return {
        key: value.isoformat() if hasattr(value, "isoformat") else str(value) if key == "id" else value
        for key, value in row.items()
    }


def _audit(cur, actor: str, operation: str, resource_id: str, details: dict):
    cur.execute(
        """INSERT INTO audit_events(id, actor_subject, action, resource_type, resource_id, details)
           VALUES (%s,%s,%s,'exercise_proposal',%s,%s::jsonb)""",
        (str(uuid4()), actor, operation, resource_id, json.dumps(details)),
    )


def _revalidate_context(row: dict, agency_id: UUID) -> str | None:
    """Fail closed for demo drafts; never silently rewrite a reviewed snapshot."""
    from app.intelligence_store import DEMO_AGENCY
    if agency_id != DEMO_AGENCY:
        return None  # Other agencies do not use the public demo context reader.
    from app.assessment_adapter import exercise_readiness
    captured = (row["proposal"].get("response_draft") or {}).get("context_fingerprint")
    if not captured:
        raise DecisionError("This proposal lacks a versioned context snapshot. Create a new draft and review it.")
    current = exercise_readiness(UUID(row["incident_id"]))
    if current is None or current.get("context_fingerprint") != captured:
        raise DecisionError("Exercise evidence or context changed. Create a new draft and review the current references.")
    return captured


def create_proposal(
    incident_id: str,
    agency_id: UUID,
    maker: str,
    action: Action,
    rationale: str,
    *, include_review_focus: bool = False,
) -> str:
    proposal_id = str(uuid4())
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Agency filtering is also enforced here, not only in FastAPI.
            cur.execute(
                "SELECT id FROM incidents WHERE id=%s AND agency_id=%s AND is_exercise_fixture IS TRUE",
                (incident_id, str(agency_id)),
            )
            if not cur.fetchone():
                raise LookupError("Exercise incident not found")
            # Capture the exact checklist and citations reviewed by the checker.
            # Public readers support only the named demo agency; other agencies
            # retain the existing scoped proposal workflow without a demo snapshot.
            from app.intelligence_store import DEMO_AGENCY
            response_draft = None
            captured_focus = None
            if include_review_focus and agency_id != DEMO_AGENCY:
                raise DecisionError("Saved review focus is available only for the named synthetic demo agency")
            if agency_id == DEMO_AGENCY:
                from app.assessment_adapter import exercise_readiness
                response_draft = exercise_readiness(UUID(incident_id))
                if response_draft is None:
                    raise DecisionError("Synthetic response context is unavailable")
            if include_review_focus:
                from app.local_copilot import review_focus
                captured_focus = review_focus(response_draft)
                captured_focus["context_fingerprint"] = response_draft["context_fingerprint"]
                captured_focus["note"] = "Saved selection of existing synthetic review items. The operator created this draft; independent human review is still required."
                # Inference may take time. Refuse changed inputs before committing
                # either the draft or its audit event; never rewrite its snapshot.
                _revalidate_context({"incident_id": incident_id,
                                     "proposal": {"response_draft": response_draft}}, agency_id)
            cur.execute(
                """INSERT INTO action_proposals
                   (id, incident_id, maker_subject, action_type, proposal, status)
                   VALUES (%s,%s,%s,%s,%s::jsonb,'draft')""",
                (
                    proposal_id,
                    incident_id,
                    maker,
                    action.value,
                    json.dumps({"rationale": rationale, "exercise_only": True, "response_draft": response_draft, **({"review_focus": captured_focus} if captured_focus is not None else {})}),
                ),
            )
            _audit(
                cur, maker, "created", proposal_id,
                {"action_type": action.value, "agency_id": str(agency_id), "exercise_only": True,
                 **({"review_focus": {key: captured_focus[key] for key in
                     ("version", "status", "reason", "model", "selection", "context_fingerprint")}}
                    if captured_focus is not None else {})},
            )
    return proposal_id


def transition(
    proposal_id: str,
    agency_id: UUID,
    actor: str,
    operation: str,
    reason: str | None = None,
    task_id: str | None = None,
    assistance_step: str | None = None,
    department_id: str | None = None,
    target_department: str | None = None,
    expected_assignment_version: int | None = None,
) -> str:
    # Department authority is provided only by verified authentication, never JSON.
    if department_id is not None and (operation not in {"acknowledge_task", "close_task"}
                                      or expected_assignment_version is None):
        raise DecisionError("Task outside verified department scope")
    # Lock the proposal row to serialize concurrent checker decisions.
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT p.id::text, p.incident_id::text, p.maker_subject, p.action_type, p.status, p.proposal
                   FROM action_proposals AS p
                   JOIN incidents AS i ON i.id = p.incident_id
                   WHERE p.id=%s AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                   FOR UPDATE OF p""",
                (proposal_id, str(agency_id)),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError("Exercise proposal not found")
            current = Proposal(
                row["id"], row["incident_id"], row["maker_subject"],
                Action(row["action_type"]), Status(row["status"]),
            )
            if operation in {"start_assistance", "advance_assistance", "cancel_assistance"}:
                from app.assistance_run import advance_run, cancel_run, start_run
                if current.status is not Status.DRAFT:
                    raise DecisionError("Assistance runs are available only while the proposal is a draft")
                if current.maker_subject != actor:
                    raise DecisionError("Only the proposal maker may operate its assistance run")
                payload = row["proposal"]
                if operation == "start_assistance":
                    checked_context = _revalidate_context(row, agency_id)
                    assistance, changed = start_run(payload, actor)
                elif operation == "advance_assistance":
                    checked_context = _revalidate_context(row, agency_id)
                    assistance, changed = advance_run(payload.get("assistance_run"), payload, actor, assistance_step or "")
                else:
                    checked_context = None
                    assistance, changed = cancel_run(payload.get("assistance_run"), actor, reason or "")
                if not changed:
                    return current.status.value
                cur.execute(
                    "UPDATE action_proposals SET proposal=jsonb_set(proposal, '{assistance_run}', %s::jsonb), updated_at=NOW() WHERE id=%s",
                    (json.dumps(assistance), proposal_id),
                )
                _audit(cur, actor, operation, proposal_id, {
                    "agency_id": str(agency_id), "exercise_only": True,
                    "run_id": assistance["id"], "run_status": assistance["status"],
                    "completed_step_count": len(assistance["completed_steps"]),
                    "checked_context_fingerprint": checked_context,
                    "operational_actions_enabled": False,
                })
                return current.status.value
            if operation in {"simulate", "prepare_tasks", "acknowledge_task", "close_task", "reassign_task"}:
                from app.proposal_simulation import simulation_receipt, prepare_task_receipt, advance_task, task_assignment, reassign_task
                if current.status is not Status.APPROVED:
                    raise DecisionError("Independent approval is required before task simulation")
                payload = row["proposal"]
                if department_id is not None:
                    assigned, version = task_assignment(payload.get("simulation"), task_id or "")
                    if assigned != department_id:
                        raise LookupError("Exercise task not found")
                    if version != expected_assignment_version:
                        raise DecisionError("Task assignment changed; refresh before retrying")
                if operation == "reassign_task":
                    receipt, changed = reassign_task(payload.get("simulation"), task_id or "",
                        target_department or "", expected_assignment_version, actor, reason or "")
                    if not changed:
                        return current.status.value
                elif operation in {"acknowledge_task", "close_task"}:
                    receipt, changed = advance_task(payload.get("simulation"), task_id or "", operation, actor, reason or "")
                    if not changed:
                        return current.status.value
                else:
                    if payload.get("simulation") is not None:
                        return current.status.value
                    factory = prepare_task_receipt if operation == "prepare_tasks" else simulation_receipt
                    receipt = factory(proposal_id, current.status.value, payload.get("response_draft"))
                cur.execute(
                    "UPDATE action_proposals SET proposal=jsonb_set(proposal, '{simulation}', %s::jsonb), updated_at=NOW() WHERE id=%s",
                    (json.dumps(receipt), proposal_id),
                )
                audit_action = "simulated_department_tasks" if operation == "simulate" else operation
                details = {"agency_id": str(agency_id), "exercise_only": True, "outbound_messages_sent": False}
                if task_id is not None:
                    task = next(item for item in receipt["tasks"] if item.get("id") == task_id)
                    details.update({"task_id": task_id, "rationale": (reason or "").strip(),
                                    "scripted": True, "department_id": task.get("assigned_department", task_id),
                                    "assignment_version": task.get("assignment_version", 0),
                                    "authority": "department" if department_id else "exercise_coordinator",
                                    "sla_policy": receipt.get("sla_policy"),
                                    "sla_status": task.get("sla_status"), "due_at": task.get("due_at")})
                if operation == "reassign_task":
                    details["assignment"] = task["last_assignment"]
                _audit(cur, actor, audit_action, proposal_id, details)
                return current.status.value
            if operation == "submit":
                updated = submit(current, actor)
            elif operation in ("approve", "reject"):
                updated = review(current, actor, operation == "approve", reason or "")
            else:
                raise DecisionError("Unknown transition")
            # Policy checks precede context reads; rejection remains available
            # even if evidence changed or the context service is unavailable.
            checked_context = None
            if operation in {"submit", "approve"}:
                checked_context = _revalidate_context(row, agency_id)
            if operation in ("approve", "reject"):
                cur.execute(
                    """INSERT INTO approvals(id, proposal_id, checker_subject, decision, rationale)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (
                        str(uuid4()), proposal_id, actor,
                        "approved" if operation == "approve" else "rejected",
                        updated.decision_reason,
                    ),
                )
            cur.execute(
                "UPDATE action_proposals SET status=%s, updated_at=NOW() WHERE id=%s",
                (updated.status.value, proposal_id),
            )
            _audit(
                cur, actor, operation, proposal_id,
                {
                    "from": current.status.value,
                    "to": updated.status.value,
                    "agency_id": str(agency_id),
                    "exercise_only": True,
                    "checked_context_fingerprint": checked_context,
                },
            )
    return updated.status.value


def list_proposals(agency_id: UUID):
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.id::text, p.incident_id::text, p.maker_subject,
                          p.action_type, p.proposal, p.status, p.created_at, p.updated_at
                   FROM action_proposals AS p
                   JOIN incidents AS i ON i.id = p.incident_id
                   WHERE i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                   ORDER BY p.created_at DESC
                   LIMIT 100""",
                (str(agency_id),),
            )
            rows = cur.fetchall()
    return [_convert(row) for row in rows]


def list_agency_exercise_incidents(agency_id: UUID) -> list[dict]:
    """Only signed-agency synthetic cases can appear in maker/checker forms.

    Do not reuse the unauthenticated public demo incident feed here: an
    operator in another agency must not be offered cases they cannot manage.
    """
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id::text, hazard_type, status, created_at
                   FROM incidents
                   WHERE agency_id=%s AND is_exercise_fixture IS TRUE
                   ORDER BY created_at DESC, id ASC LIMIT 100""",
                (str(agency_id),),
            )
            rows = cur.fetchall()
    return [_convert(row) for row in rows]


def proposal_audit(proposal_id: str, agency_id: UUID) -> dict:
    """Private signed-agency evidence, decisions and simulation history."""
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Keep all three reads on one MVCC snapshot while reviewers commit.
            # READ COMMITTED could mix an old proposal with a newer decision.
            cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            cur.execute(
                """SELECT p.id::text, p.incident_id::text, p.maker_subject, p.action_type, p.status,
                          p.proposal, p.created_at, p.updated_at
                   FROM action_proposals p JOIN incidents i ON i.id=p.incident_id
                   WHERE p.id=%s AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE""",
                (proposal_id, str(agency_id)),
            )
            row = cur.fetchone()
            if row is None:
                raise LookupError("Exercise proposal not found")
            cur.execute(
                """SELECT checker_subject, decision, rationale, decided_at FROM approvals
                   WHERE proposal_id=%s ORDER BY decided_at, id""", (proposal_id,),
            )
            decisions = [_convert(item) for item in cur.fetchall()]
            cur.execute(
                """SELECT actor_subject, action, occurred_at, details FROM audit_events
                   WHERE resource_type='exercise_proposal' AND resource_id=%s
                   ORDER BY occurred_at, id LIMIT 100""", (proposal_id,),
            )
            events = [_convert(item) for item in cur.fetchall()]
    return {"version": "aegis.private.proposal.audit.v1", "exercise_only": True,
            "operational_actions_enabled": False, "proposal": _convert(row),
            "decisions": decisions, "events": events}


def list_department_tasks(agency_id: UUID, department_id: str):
    """Return only the department's staged tasks, without private proposal content."""
    from app.proposal_simulation import TASK_IDS
    if department_id not in TASK_IDS:
        raise DecisionError("Invalid department scope")
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.id::text AS proposal_id, p.incident_id::text, task AS task
                   FROM action_proposals p JOIN incidents i ON i.id=p.incident_id
                   CROSS JOIN LATERAL jsonb_array_elements(
                     COALESCE(p.proposal->'simulation'->'tasks', '[]'::jsonb)) task
                   WHERE i.agency_id=%s AND i.is_exercise_fixture IS TRUE
                     AND p.status='approved'
                     AND p.proposal->'simulation'->>'version' IN
                       ('aegis.proposal.simulation.v2', 'aegis.proposal.simulation.v3')
                     AND p.proposal->'simulation' @> '{"synthetic":true,"outbound_messages_sent":false,"operational_actions_enabled":false,"acknowledgements_are_scripted":true}'::jsonb
                     AND COALESCE(task->>'assigned_department', task->>'id')=%s
                   ORDER BY p.created_at DESC, p.id LIMIT 100""",
                (str(agency_id), department_id),
            )
            return [_convert(row) for row in cur.fetchall()]
