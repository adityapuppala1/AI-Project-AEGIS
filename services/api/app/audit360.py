"""AEGIS Audit360 export of PUBLIC SYNTHETIC fixtures only.

Not a signed legal audit, operational approval history, or access to private
agency records. Bundle is a bounded read-only demonstration artifact.
"""
from datetime import datetime, timezone
import hashlib
import json
from uuid import UUID

from app.agency_sync_store import (
    PLAYBOOK_VERSION, agency_task_board, agency_task_events_for_incident,
)
from app.assessment_adapter import exercise_readiness
from app.intelligence_store import incident_workspace


def export_exercise_case(incident_id: UUID) -> dict | None:
    case = incident_workspace(incident_id)
    if case is None:
        return None
    if case.get("source") != "synthetic_exercise" or case.get("operational_actions_enabled") is not False:
        raise ValueError("Refusing to export any non-exercise incident")
    assessment = exercise_readiness(incident_id, radius_m=3000)
    if assessment is None:
        return None
    if (assessment.get("source") != "synthetic_exercise"
        or assessment.get("operational_actions_enabled") is not False
        or assessment.get("real_world_risk_probability") is not None
        or assessment.get("incident_id") != str(incident_id)):
        raise ValueError("Unsafe exercise assessment provenance")
    board = agency_task_board(incident_id=incident_id, limit=50)
    if (board.get("source") != "synthetic_exercise"
        or board.get("outbound_messages_sent") is not False
        or board.get("operational_actions_enabled") is not False
        or any(item.get("synthetic") is not True for item in board.get("tasks", []))):
        raise ValueError("Unsafe department task provenance")
    task_events = agency_task_events_for_incident(incident_id)
    if len(task_events) > 200 or any(item.get("synthetic") is not True for item in task_events):
        raise ValueError("Unexpected exercise audit event classification")
    payload = {
        "bundle_version": "aegis.exercise.audit360.v1",
        "source": "synthetic_exercise",
        "incident_id": str(incident_id),
        "playbook_ref": PLAYBOOK_VERSION,
        "incident_workspace": case,
        "readiness_checklist": assessment,
        "agency_task_board": board,
        "scripted_task_events": task_events,
        "excluded_private_workflows": [
            "Real operator authentication/session tokens",
            "Confidential agency records and maker-checker audit data",
            "External telemetry and live notification records",
        ],
        "operational_actions_enabled": False,
        "contains_real_agency_records": False,
        "outbound_messages_sent": False,
    }
    canonical = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return {
        **payload,
        "manifest_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "integrity_note": "Unsigned content checksum for exercise traceability, NOT a digital signature or immutable official audit.",
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
