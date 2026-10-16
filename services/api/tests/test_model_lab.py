"""Synthetic model validation only; metrics cannot validate real flood accuracy."""
import copy
import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.model_lab import (
    VERSION, auc_roc, build_report, fit, load_dataset, saved_report,
    score, sigmoid, validate_dataset,
)
from app.model_scenarios import generate

client = TestClient(app)


def test_generator_reproducible_and_synthetic():
    assert generate() == generate()
    data = generate()
    assert data["source"] == "synthetic_generated_fixture"
    assert data["generator_seed"] == 20261016
    assert len(data["scenarios"]) == 216
    train, holdout = validate_dataset(data)
    assert len(train) == 162
    assert len(holdout) == 54
    assert set(row["scenario_id"] for row in train).isdisjoint(
        set(row["scenario_id"] for row in holdout)
    )


def test_versioned_report_exactly_rebuilds_from_generator():
    expected = build_report()
    assert saved_report() == expected
    assert expected["model_version"] == VERSION
    assert expected["dataset_count"] == 216
    assert expected["train_group_count"] == 18
    assert expected["holdout_group_count"] == 6
    assert expected["holdout_is_group_disjoint"] is True
    assert expected["calibrated_real_world_probability"] is False
    assert expected["actual_forecast_skill_known"] is False
    assert expected["live_inference_enabled"] is False
    assert expected["operational_actions_enabled"] is False


def test_holdout_metrics_are_internally_consistent():
    metrics = saved_report()["metrics"]
    matrix = metrics["confusion_matrix"]
    assert sum(matrix.values()) == metrics["holdout_count"] == 54
    assert matrix["true_positive"] + matrix["false_negative"] == metrics["holdout_positive_count"]
    assert sum(bucket["count"] for bucket in metrics["illustrative_calibration_bins"]) == 54
    assert all(0 <= metrics[key] <= 1 for key in
               ("accuracy", "roc_auc", "precision", "recall", "f1", "brier_score"))
    assert metrics["constant_baseline_brier"] > 0


@pytest.mark.parametrize("mutation", [
    lambda data: data.update(source="untrusted_provider"),
    lambda data: data["scenarios"][0].update(synthetic_label="yes"),
    lambda data: data["scenarios"][0].update(rainfall_mm_hour=900),
    lambda data: data["scenarios"][0].update(time_index=40),
    lambda data: data["scenarios"][0].update(split="holdout"),
    lambda data: data["scenarios"][0].update(drainage_condition="broken"),
    lambda data: data["scenarios"].append(data["scenarios"][0].copy()),
])
def test_dataset_validation_fails_closed(mutation):
    data = copy.deepcopy(generate())
    mutation(data)
    with pytest.raises(ValueError):
        validate_dataset(data)


def test_deterministic_training_and_score_bounds():
    train, holdout = validate_dataset(load_dataset())
    weights = fit(train)
    assert weights == fit(train)
    assert len(weights) == 5
    assert all(math.isfinite(value) for value in weights)
    assert 0 < score(weights, holdout[0]) < 1
    assert sigmoid(1000) == 1
    assert sigmoid(-1000) == 0


def test_auc_definition_consistent_with_ties():
    assert auc_roc([1, 0], [0.7, 0.2]) == 1.0
    assert auc_roc([1, 0], [0.3, 0.3]) == 0.5
    with pytest.raises(ValueError):
        auc_roc([1, 1], [0.7, 0.2])


def test_read_only_exercise_model_card_endpoint():
    response = client.get("/v1/exercise/model-lab/report")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "synthetic_generated_fixture"
    assert body["mode"] == "offline_exercise_only"
    assert body["validation_scope"] == "synthetic_holdout_only_not_transferable_to_real_hazards"
    assert body["calibrated_real_world_probability"] is False
    assert body["operational_actions_enabled"] is False
    assert client.post("/v1/exercise/model-lab/report", json={}).status_code == 405
    assert client.post("/v1/live/public-warning").status_code == 403
