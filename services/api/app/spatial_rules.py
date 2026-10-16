"""Bounded, transparent geospatial analysis rules for synthetic training only."""
from typing import Literal

DEFAULT_RADIUS_METERS = 3000
MAX_RADIUS_METERS = 5000
MAX_CANDIDATES = 20


def distance_band(distance_m: float) -> Literal["nearby", "within_area"]:
    """Human-readable geography only; NOT a hazard or impact probability."""
    if distance_m < 0:
        raise ValueError("Distance must be nonnegative")
    return "nearby" if distance_m <= 1000 else "within_area"


def explanation(*, distance_m: float, has_reading: bool, stale: bool) -> str:
    if distance_m < 0:
        raise ValueError("Invalid distance")
    if not has_reading:
        return "Within the simulated search area, but no observations are available; it cannot corroborate this case."
    if stale:
        return "Within the simulated search area, but the observation is not current; do not use as live corroboration."
    return "Within the simulated search area only. Proximity does not establish causality, hazard severity or asset damage."
