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


def create_proposal(
    incident_id: str,
    agency_id: UUID,
    maker: str,
    action: Action,
    rationale: str,
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
            if agency_id == DEMO_AGENCY:
                from app.assessment_adapter import exercise_readiness
                response_draft = exercise_readiness(UUID(incident_id))
                if response_draft is None:
                    raise DecisionError("Synthetic response context is unavailable")
            cur.execute(
                """INSERT INTO action_proposals
                   (id, incident_id, maker_subject, action_type, proposal, status)
                   VALUES (%s,%s,%s,%s,%s::jsonb,'draft')""",
                (
                    proposal_id,
                    incident_id,
                    maker,
                    action.value,
                    json.dumps({"rationale": rationale, "exercise_only": True, "response_draft": response_draft}),
                ),
            )
            _audit(
                cur, maker, "created", proposal_id,
                {"action_type": action.value, "agency_id": str(agency_id), "exercise_only": True},
            )
    return proposal_id


def transition(
    proposal_id: str,
    agency_id: UUID,
    actor: str,
    operation: str,
    reason: str | None = None,
) -> str:
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
            if operation == "simulate":
                from app.proposal_simulation import simulation_receipt
                if current.status is not Status.APPROVED:
                    raise DecisionError("Independent approval is required before task simulation")
                payload = row["proposal"]
                if payload.get("simulation") is not None:
                    return current.status.value
                receipt = simulation_receipt(proposal_id, current.status.value, payload.get("response_draft"))
                cur.execute(
                    "UPDATE action_proposals SET proposal=jsonb_set(proposal, '{simulation}', %s::jsonb), updated_at=NOW() WHERE id=%s",
                    (json.dumps(receipt), proposal_id),
                )
                _audit(cur, actor, "simulated_department_tasks", proposal_id,
                       {"agency_id": str(agency_id), "exercise_only": True, "outbound_messages_sent": False})
                return current.status.value
            if operation == "submit":
                updated = submit(current, actor)
            elif operation in ("approve", "reject"):
                updated = review(current, actor, operation == "approve", reason or "")
                cur.execute(
                    """INSERT INTO approvals(id, proposal_id, checker_subject, decision, rationale)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (
                        str(uuid4()), proposal_id, actor,
                        "approved" if operation == "approve" else "rejected",
                        updated.decision_reason,
                    ),
                )
            else:
                raise DecisionError("Unknown transition")
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
                """SELECT p.id::text, p.incident_id::text, p.maker_subject, p.status,
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
