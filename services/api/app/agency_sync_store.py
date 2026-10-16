"""Bounded AgencySync tabletop tasks: read-only fictional acknowledgements.

These tasks were written by a seed script. There is no network dispatch,
message bus, actual recipient or mutable public task endpoint.
"""
from datetime import datetime, timezone
import os
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.intelligence_store import DEMO_AGENCY

PLAYBOOK_VERSION = "AEGIS-URBAN-FLOOD-EXERCISE-v0.1"
STATES = frozenset({"prepared", "acknowledged", "closed"})
MAX_TASKS = 50


def _item(row: dict, now: datetime) -> dict:
    state = row["state"]
    due_at = row["due_at"]
    return {
        "id": str(row["id"]),
        "incident_id": str(row["incident_id"]),
        "agency_label": row["agency_label"],
        "task_kind": row["task_kind"],
        "summary": row["summary"],
        "playbook_ref": row["playbook_ref"],
        "state": state,
        "prepared_at": row["prepared_at"].isoformat(),
        "due_at": due_at.isoformat(),
        "acknowledged_at": row["acknowledged_at"].isoformat() if row["acknowledged_at"] else None,
        "closed_at": row["closed_at"].isoformat() if row["closed_at"] else None,
        "demo_due_window_elapsed": state == "prepared" and due_at < now,
        "synthetic": True,
    }


def agency_task_board(
    *, incident_id: UUID | None = None, state: str | None = None,
    limit: int = MAX_TASKS,
) -> dict:
    if state is not None and state not in STATES:
        raise ValueError("Unsupported exercise task state")
    if type(limit) is not int or not 1 <= limit <= MAX_TASKS:
        raise ValueError("Exercise task list limit must be between 1 and 50")
    now = datetime.now(timezone.utc)
    where = (" WHERE i.agency_id=%s AND i.is_exercise_fixture IS TRUE "
             "AND t.synthetic IS TRUE")
    params: list[object] = [str(DEMO_AGENCY)]
    if incident_id is not None:
        where += " AND i.id=%s"
        params.append(str(incident_id))
    # Show overall state counts before the optional state filter.
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT t.state, COUNT(*) AS amount FROM exercise_agency_tasks t "
                "JOIN incidents i ON i.id=t.incident_id " + where + " GROUP BY t.state",
                params,
            )
            totals = {row["state"]: int(row["amount"]) for row in cur.fetchall()}
            scoped_where = where
            scoped_params = list(params)
            if state is not None:
                scoped_where += " AND t.state=%s"
                scoped_params.append(state)
            cur.execute(
                """SELECT t.id::text, t.incident_id::text, t.agency_label,
                          t.task_kind, t.summary, t.playbook_ref, t.state,
                          t.prepared_at, t.due_at, t.acknowledged_at, t.closed_at
                   FROM exercise_agency_tasks t
                   JOIN incidents i ON i.id=t.incident_id """
                + scoped_where + " ORDER BY t.prepared_at DESC, t.id ASC LIMIT %s",
                [*scoped_params, limit],
            )
            records = cur.fetchall()
    return {
        "source": "synthetic_exercise",
        "model_predictions_attached": False,
        "outbound_messages_sent": False,
        "acknowledgements_are_scripted": True,
        "operational_actions_enabled": False,
        "playbook_version": PLAYBOOK_VERSION,
        "as_of": now.isoformat(),
        "total_in_scope": sum(totals.values()),
        "status_counts": {name: totals.get(name, 0) for name in sorted(STATES)},
        "returned": len(records),
        "tasks": [_item(row, now) for row in records],
    }


def agency_task_detail(task_id: UUID) -> dict | None:
    now = datetime.now(timezone.utc)
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT t.id::text, t.incident_id::text, t.agency_label,
                          t.task_kind, t.summary, t.playbook_ref, t.state,
                          t.prepared_at, t.due_at, t.acknowledged_at, t.closed_at
                   FROM exercise_agency_tasks AS t
                   JOIN incidents AS i ON i.id=t.incident_id
                   WHERE t.id=%s AND t.synthetic IS TRUE
                     AND i.agency_id=%s AND i.is_exercise_fixture IS TRUE""",
                (str(task_id), str(DEMO_AGENCY)),
            )
            task = cur.fetchone()
            if task is None:
                return None
            cur.execute(
                """SELECT id::text, kind, occurred_at, actor_label, summary
                   FROM exercise_agency_task_events
                   WHERE task_id=%s AND synthetic IS TRUE
                   ORDER BY occurred_at ASC, id ASC LIMIT 40""",
                (str(task_id),),
            )
            timeline = cur.fetchall()
    return {
        "source": "synthetic_exercise",
        "outbound_messages_sent": False,
        "acknowledgements_are_scripted": True,
        "operational_actions_enabled": False,
        "task": _item(task, now),
        "events": [
            {
                "id": str(row["id"]),
                "kind": row["kind"],
                "occurred_at": row["occurred_at"].isoformat(),
                "actor_label": row["actor_label"],
                "summary": row["summary"],
                "synthetic": True,
            }
            for row in timeline
        ],
    }


def agency_task_events_for_incident(incident_id: UUID) -> list[dict]:
    """Bounded, seeded exercise-event export; no operational audit records."""
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT e.id::text, e.task_id::text, e.kind, e.occurred_at,
                          e.actor_label, e.summary
                   FROM exercise_agency_task_events AS e
                   JOIN exercise_agency_tasks AS t ON t.id=e.task_id
                   JOIN incidents AS i ON i.id=t.incident_id
                   WHERE i.id=%s AND i.agency_id=%s
                     AND i.is_exercise_fixture IS TRUE
                     AND t.synthetic IS TRUE AND e.synthetic IS TRUE
                   ORDER BY e.occurred_at ASC, e.id ASC LIMIT 200""",
                (str(incident_id), str(DEMO_AGENCY)),
            )
            rows = cur.fetchall()
    return [
        {
            "id": str(row["id"]),
            "task_id": str(row["task_id"]),
            "kind": row["kind"],
            "occurred_at": row["occurred_at"].isoformat(),
            "actor_label": row["actor_label"],
            "summary": row["summary"],
            "synthetic": True,
        }
        for row in rows
    ]
