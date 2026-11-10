"""Optional statistical forecast of one numeric series (river discharge or rainfall) with TimesFM 2.5.

Display-only decision support. Off unless AEGIS_TIMESFM=1 AND the optional `timesfm` package and its weights are
present (compose.timesfm.yaml). It reads the numbers sent in the request, returns a forecast with a 10-90 % range and
one hold-out check, and stores nothing. It cannot create or change a case, assessment, proposal, task or alert.

The model is a general-purpose pattern forecaster (Apache-2.0 code and weights, google/timesfm-2.5-200m-pytorch). It
has no knowledge of weather or rivers and was not trained on Indian hydrology, so the output is labelled a
statistical estimate. The hold-out figures describe one slice of the supplied history; they are not accuracy.
"""
from __future__ import annotations

import math
import os
import threading
from typing import Callable, Literal, Sequence

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.security import Operator, get_operator, require_role

MODEL_ID = "timesfm-2.5-200m"
MIN_POINTS, MAX_POINTS, MAX_HORIZON, MAX_VALUE = 60, 2048, 64, 1_000_000.0
READ_ROLES = {"incident_operator", "incident_checker", "incident_auditor", "platform_admin"}

# (history, horizon) -> (point, q10, q90). Replaced in tests; the real one is built lazily.
Forecaster = Callable[[Sequence[float], int], tuple[list[float], list[float], list[float]]]
_forecaster: Forecaster | None = None
_load_error: str | None = None
_lock = threading.Lock()

router = APIRouter(prefix="/v1/statistical-forecast", tags=["statistical-forecast"])


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["river_discharge", "rainfall"]
    series: list[float] = Field(min_length=MIN_POINTS, max_length=MAX_POINTS)
    horizon: int = Field(ge=1, le=MAX_HORIZON)


def enabled() -> bool:
    return os.environ.get("AEGIS_TIMESFM") == "1"


def _build() -> Forecaster:
    import numpy as np
    import timesfm  # optional dependency, present only in the TimesFM image

    model = timesfm.TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
    model.compile(timesfm.ForecastConfig(
        max_context=MAX_POINTS, max_horizon=MAX_HORIZON, normalize_inputs=True, use_continuous_quantile_head=True,
        force_flip_invariance=True, infer_is_positive=True, fix_quantile_crossing=True))

    def run(history: Sequence[float], horizon: int) -> tuple[list[float], list[float], list[float]]:
        point, quantiles = model.forecast(horizon=horizon, inputs=[np.asarray(history, dtype=float)])
        # quantiles[..., 0] is the mean, then the 10th to 90th percentiles.
        return [float(v) for v in point[0]], [float(v) for v in quantiles[0, :, 1]], [float(v) for v in quantiles[0, :, 9]]

    return run


def get_forecaster() -> Forecaster | None:
    """Loads the model once. A failed load is remembered so a missing package is not retried on every request."""
    global _forecaster, _load_error
    if _forecaster is not None or _load_error is not None:
        return _forecaster
    with _lock:
        if _forecaster is None and _load_error is None:
            try:
                _forecaster = _build()
            except Exception:  # missing package, missing weights, out of memory: all mean "not available"
                _load_error = "model_unavailable"
    return _forecaster


def set_forecaster_for_tests(forecaster: Forecaster | None) -> None:
    global _forecaster, _load_error
    _forecaster, _load_error = forecaster, None


def _clean(values: Sequence[float]) -> list[float]:
    return [round(min(max(0.0, v), MAX_VALUE), 3) if math.isfinite(v) else 0.0 for v in values]


def _mean_abs(a: Sequence[float], b: Sequence[float]) -> float:
    return round(sum(abs(x - y) for x, y in zip(a, b)) / len(a), 3)


def holdout(forecaster: Forecaster, series: Sequence[float], horizon: int) -> dict | None:
    """Forecast the last `horizon` supplied points from the earlier ones and compare. One slice, not accuracy."""
    if len(series) - horizon < MIN_POINTS:
        return None
    past, actual = series[:-horizon], series[-horizon:]
    point, low, high = (_clean(part) for part in forecaster(past, horizon))
    inside = sum(1 for value, lo, hi in zip(actual, low, high) if lo <= value <= hi)
    return {
        "points": horizon,
        "model_mean_abs_error": _mean_abs(point, actual),
        "repeat_last_value_mean_abs_error": _mean_abs([past[-1]] * horizon, actual),
        "inside_10_90_range": inside,
        "basis": "one_holdout_of_supplied_history",
        "is_accuracy": False,
    }


@router.get("/status")
def status(operator: Operator = Depends(get_operator)) -> dict:
    require_role(operator, READ_ROLES)
    if not enabled():
        return {"enabled": False, "reason_code": "switched_off", "model": MODEL_ID, "display_only": True}
    ready = get_forecaster() is not None
    return {"enabled": ready, "reason_code": None if ready else "model_unavailable", "model": MODEL_ID, "display_only": True}


@router.post("")
def forecast(request: ForecastRequest, operator: Operator = Depends(get_operator)) -> dict:
    require_role(operator, READ_ROLES)
    if not enabled():
        raise HTTPException(status_code=503, detail="switched_off")
    if any(not math.isfinite(v) or v < 0 or v > MAX_VALUE for v in request.series):
        raise HTTPException(status_code=422, detail="series_out_of_range")
    if max(request.series) - min(request.series) <= 0:
        raise HTTPException(status_code=422, detail="series_is_constant")
    forecaster = get_forecaster()
    if forecaster is None:
        raise HTTPException(status_code=503, detail="model_unavailable")
    try:
        point, low, high = forecaster(request.series, request.horizon)
        check = holdout(forecaster, request.series, request.horizon)
    except Exception:
        raise HTTPException(status_code=503, detail="model_unavailable") from None
    if not (len(point) == len(low) == len(high) == request.horizon):
        raise HTTPException(status_code=503, detail="model_unavailable")
    return {
        "status": "ok", "model": MODEL_ID, "kind": request.kind, "horizon": request.horizon,
        "point": _clean(point), "q10": _clean(low), "q90": _clean(high),
        "holdout": check,
        "classification": "statistical_estimate", "display_only": True, "is_accuracy": False,
        "limits": ["pattern_model_without_physics", "not_trained_on_indian_hydrology", "extremes_may_be_underestimated"],
    }
