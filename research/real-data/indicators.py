"""Phase 2 indicators (PHASE2_PROTOCOL.md section 5). Pure functions on plain dicts and lists.

Dates are ISO strings (YYYY-MM-DD, IST calendar days). A missing day is represented by its absence or by None and
is never interpolated: any window touching a missing day yields None ("not computable").
Nothing here is imported by, or imports from, services/api or apps/web.
"""
from datetime import date, timedelta

MIN_POINTS = 5          # same rule as candidates.py: fewer reporting points means the grid mean is missing


def parse_day(value: str) -> date:
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError(f"not an ISO date: {value!r}")
    return date.fromisoformat(value)


def shift(day: str, days: int) -> str:
    return (parse_day(day) + timedelta(days=days)).isoformat()


def date_range(start: str, end: str) -> list[str]:
    first, last = parse_day(start), parse_day(end)
    return [(first + timedelta(days=i)).isoformat() for i in range((last - first).days + 1)]


def clean_series(series: dict) -> dict[str, float | None]:
    """Validate keys as ISO dates and values as finite numbers or None. Raises on anything else."""
    out: dict[str, float | None] = {}
    for key, value in series.items():
        parse_day(key)
        if value is None:
            out[key] = None
        elif isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
            raise ValueError(f"bad value on {key}: {value!r}")
        else:
            out[key] = float(value)
    return dict(sorted(out.items()))


def grid_mean(point_series: list[dict], min_points: int = MIN_POINTS) -> dict[str, float | None]:
    """Grid-mean daily series from per-point {date: value} dicts. Days with < min_points values are None."""
    per_day: dict[str, list[float]] = {}
    days: set[str] = set()
    for series in point_series:
        for day, value in clean_series(series).items():
            days.add(day)
            if value is not None:
                per_day.setdefault(day, []).append(value)
    return {day: (sum(per_day[day]) / len(per_day[day]) if len(per_day.get(day, [])) >= min_points else None)
            for day in sorted(days)}


def align(series_by_name: dict[str, dict], start: str, end: str) -> dict[str, list]:
    """Align named series on the full inclusive day range; absent days become None explicitly."""
    days = date_range(start, end)
    aligned = {"date": days}
    for name, series in series_by_name.items():
        cleaned = clean_series(series)
        aligned[name] = [cleaned.get(day) for day in days]
    return aligned


def window_total(series: dict, day: str, first_offset: int, last_offset: int) -> float | None:
    """Sum of series over day+first_offset .. day+last_offset inclusive; None if any day is missing."""
    if last_offset > 0:
        raise ValueError("windows may not reach after the evaluated day")
    total = 0.0
    for offset in range(first_offset, last_offset + 1):
        value = series.get(shift(day, offset))
        if value is None:
            return None
        total += value
    return total


def rain_1d(series: dict, day: str) -> float | None:
    return window_total(series, day, 0, 0)


def rain_3d(series: dict, day: str) -> float | None:
    """Trailing 3 days including the evaluated day."""
    return window_total(series, day, -2, 0)


def antecedent_7d(series: dict, day: str) -> float | None:
    """7 days ending the day BEFORE the evaluated day; the evaluated day is excluded."""
    return window_total(series, day, -7, -1)


def percentile_rank(value: float | None, training_sample: list) -> float | None:
    """Fraction of the training sample <= value. None if value is None or the sample is empty."""
    sample = [float(item) for item in training_sample if item is not None]
    if value is None or not sample:
        return None
    return sum(1 for item in sample if item <= value) / len(sample)


def training_sample(series: dict, train_end: str) -> list[float]:
    """Values dated on or before train_end only (the reference sample for discharge_pct)."""
    cleaned = clean_series(series)
    return [value for day, value in cleaned.items() if day <= train_end and value is not None]


def indicators_for(day: str, precip: dict, discharge: dict | None, discharge_reference: list[float]) -> dict:
    return {
        "rain_1d": rain_1d(precip, day),
        "rain_3d": rain_3d(precip, day),
        "antecedent_7d": antecedent_7d(precip, day),
        "discharge_pct": percentile_rank(discharge.get(day), discharge_reference) if discharge else None,
    }
