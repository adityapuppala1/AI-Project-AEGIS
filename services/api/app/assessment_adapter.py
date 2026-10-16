"""Read-only composition of the existing, synthetic-only incident readers."""
from uuid import UUID

from app.assessment import evaluate_readiness
from app.intelligence_store import incident_workspace
from app.spatial_store import spatial_candidates


def exercise_readiness(incident_id: UUID, radius_m: int = 3000) -> dict | None:
    case = incident_workspace(incident_id)
    if case is None:
        return None
    geographic = spatial_candidates(incident_id, radius_m=radius_m)
    if geographic is None:
        # A case without a geographic center cannot be inferred to be safe.
        return None
    return evaluate_readiness(case, geographic)
