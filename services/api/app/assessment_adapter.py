"""Read-only composition of the existing, synthetic-only incident readers."""
from uuid import UUID

import psycopg

from app.assessment import evaluate_readiness
from app.intelligence_store import incident_workspace
from app.spatial_store import spatial_candidates


class ContextUnavailable(Exception):
    """A fixed stage code, never an underlying exception or connection string."""
    def __init__(self, code: str):
        self.code = code
        super().__init__("Synthetic assessment context unavailable")


def exercise_readiness(incident_id: UUID, radius_m: int = 3000) -> dict | None:
    try:
        case = incident_workspace(incident_id)
    except (psycopg.Error, KeyError) as exc:
        raise ContextUnavailable("case_context_unavailable") from exc
    if case is None:
        return None
    try:
        geographic = spatial_candidates(incident_id, radius_m=radius_m)
    except (psycopg.Error, KeyError) as exc:
        raise ContextUnavailable("geographic_context_unavailable") from exc
    if geographic is None:
        # A case without a geographic center cannot be inferred to be safe.
        return None
    try:
        return evaluate_readiness(case, geographic)
    except ValueError as exc:
        raise ContextUnavailable("context_validation_failed") from exc
