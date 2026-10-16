"""Transactional exercise proposal storage. NOT authenticated or suitable for real actions."""
import json
import os
from uuid import uuid4
import psycopg
from psycopg.rows import dict_row
from app.governance import Action, DecisionError, Proposal, Status, submit, review


def _convert(row):
    return {key: value.isoformat() if hasattr(value, "isoformat") else str(value) if key == "id" else value for key, value in row.items()}


def _audit(cur, actor, action, resource_id, details):
    cur.execute(
        """INSERT INTO audit_events(id, actor_subject, action, resource_type, resource_id, details)
           VALUES (%s,%s,%s,'exercise_proposal',%s,%s::jsonb)""",
        (str(uuid4()), actor, action, resource_id, json.dumps(details)),
    )


def create_proposal(incident_id, maker, action, rationale):
    proposal_id = str(uuid4())
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT 1 FROM incidents WHERE id=%s", (incident_id,))
            if not cur.fetchone():
                raise LookupError("Exercise incident not found")
            cur.execute(
                """INSERT INTO action_proposals (id, incident_id, maker_subject, action_type, proposal, status)
                   VALUES (%s,%s,%s,%s,%s::jsonb,'draft')""",
                (proposal_id, incident_id, maker, action.value, json.dumps({"rationale": rationale, "exercise_only": True})),
            )
            _audit(cur, maker, "created", proposal_id, {"action_type": action.value})
    return proposal_id


def transition(proposal_id, actor, operation, reason=None):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""SELECT id::text, incident_id::text, maker_subject, action_type, status
                           FROM action_proposals WHERE id=%s FOR UPDATE""", (proposal_id,))
            row = cur.fetchone()
            if not row:
                raise LookupError("Exercise proposal not found")
            current = Proposal(row["id"], row["incident_id"], row["maker_subject"], Action(row["action_type"]), Status(row["status"]))
            if operation == "submit":
                updated = submit(current, actor)
            elif operation in ("approve", "reject"):
                updated = review(current, actor, operation == "approve", reason or "")
                cur.execute("""INSERT INTO approvals(id,proposal_id,checker_subject,decision,rationale)
                               VALUES (%s,%s,%s,%s,%s)""",
                            (str(uuid4()), proposal_id, actor, "approved" if operation == "approve" else "rejected", updated.decision_reason))
            else:
                raise DecisionError("Unknown transition")
            cur.execute("UPDATE action_proposals SET status=%s, updated_at=NOW() WHERE id=%s", (updated.status.value, proposal_id))
            _audit(cur, actor, operation, proposal_id, {"from": current.status.value, "to": updated.status.value, "exercise_only": True})
    return updated.status.value


def list_proposals():
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT id::text, incident_id::text, maker_subject, action_type, proposal, status,
                                  created_at, updated_at
                           FROM action_proposals ORDER BY created_at DESC LIMIT 100""")
            rows = cur.fetchall()
    return [_convert(row) for row in rows]
