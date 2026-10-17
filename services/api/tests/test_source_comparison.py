from copy import deepcopy

import pytest

from app.source_comparison import compare_sources


def source(source_id: str, value: float, observed: str = "2026-10-17T10:00:00+00:00") -> dict:
    return {
        "id": source_id, "metric_value": value, "metric_unit": "mm",
        "observed_at": observed, "freshness": "fresh",
        "quality_status": "synthetic_curated",
        "comparison_group": "rain_pair", "comparison_window_seconds": 900,
        "comparison_tolerance": 5,
    }


def test_explicit_compatible_pair_agrees_and_cites_sources():
    result = compare_sources([source("b", 32), source("a", 29)])
    assert result["status"] == "agreement"
    assert result["groups"][0]["source_ids"] == ["a", "b"]
    assert result["groups"][0]["value_range"] == 3
    assert result["validated_forecast"] is False


def test_pair_over_tolerance_disagrees():
    assert compare_sources([source("a", 20), source("b", 30)])["status"] == "disagreement"


@pytest.mark.parametrize("change", [
    lambda item: item.update(freshness="stale"),
    lambda item: item.update(quality_status="synthetic_unverified"),
    lambda item: item.update(observed_at="2026-10-17T11:00:00+00:00"),
])
def test_ineligible_or_out_of_window_pair_is_not_comparable(change):
    second = source("b", 30)
    change(second)
    assert compare_sources([source("a", 30), second])["status"] == "not_comparable"


def test_unlabelled_sources_are_never_inferred_comparable():
    item = source("a", 30)
    item.update(comparison_group=None, comparison_window_seconds=None, comparison_tolerance=None)
    assert compare_sources([item])["status"] == "not_comparable"


@pytest.mark.parametrize("change", [
    lambda item: item.update(comparison_tolerance=None),
    lambda item: item.update(metric_unit="cm"),
    lambda item: item.update(comparison_window_seconds=60),
])
def test_incomplete_or_conflicting_policy_fails_closed(change):
    second = deepcopy(source("b", 30))
    change(second)
    with pytest.raises(ValueError):
        compare_sources([source("a", 30), second])
