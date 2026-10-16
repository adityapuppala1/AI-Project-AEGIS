"""Deterministic synthetic-only AEGIS model laboratory.

NO live inference, external data, public warnings or dispatch. The held-out
metrics describe generated cases only, NOT real flood forecasting skill.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from importlib.resources import files
from typing import Any

from app.model_scenarios import generate

VERSION = "aegis.exercise.logistic-baseline.v1"
DATASET = "aegis.exercise.scenarios.v1"
FEATURE_NAMES = ("rainfall_mm_hour / 100", "water_index / 100", "moderate_drainage", "limited_drainage")
LEARNING_RATE = 0.35
EPOCHS = 750
REGULARIZATION = 0.012
SCORE_THRESHOLD = 0.5


def _json_bytes(document: object) -> bytes:
    return (json.dumps(document, sort_keys=True, ensure_ascii=True, separators=(",", ":")) + "\n").encode("utf-8")


def load_dataset() -> dict:
    return generate()


def report_path():
    return files("app").joinpath("fixtures/model_report_v1.json")


def validate_dataset(dataset: dict) -> tuple[list[dict], list[dict]]:
    if dataset.get("dataset_version") != DATASET or dataset.get("source") != "synthetic_generated_fixture":
        raise ValueError("Only the versioned synthetic dataset is allowed")
    scenarios = dataset.get("scenarios")
    if not isinstance(scenarios, list) or len(scenarios) < 100 or len(scenarios) > 500:
        raise ValueError("Unexpected exercise dataset size")
    seen = set()
    train, test = [], []
    for row in scenarios:
        if not isinstance(row, dict) or set(row) != {
            "scenario_id", "time_index", "rainfall_mm_hour", "water_index",
            "drainage_condition", "synthetic_label", "split",
        }:
            raise ValueError("Unexpected scenario schema")
        group, time_index = row["scenario_id"], row["time_index"]
        if not isinstance(group, int) or isinstance(group, bool) or not 0 <= group < 24:
            raise ValueError("Invalid scenario grouping")
        if not isinstance(time_index, int) or isinstance(time_index, bool) or not 0 <= time_index < 9:
            raise ValueError("Invalid time index")
        if (group, time_index) in seen:
            raise ValueError("Duplicate scenario/time key")
        seen.add((group, time_index))
        if row["split"] != ("train" if group < 18 else "holdout"):
            raise ValueError("Scenario groups crossed training/holdout boundary")
        for field, limit in (("rainfall_mm_hour", 200), ("water_index", 100)):
            value = row[field]
            if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= limit:
                raise ValueError("Invalid synthetic sensor value")
        if row["drainage_condition"] not in ("good", "moderate", "limited"):
            raise ValueError("Invalid drainage condition")
        if type(row["synthetic_label"]) is not int or row["synthetic_label"] not in (0, 1):
            raise ValueError("Synthetic labels must be binary")
        (train if group < 18 else test).append(row)
    if len(seen) != 216 or len(train) != 162 or len(test) != 54:
        raise ValueError("Expected 18 training and 6 holdout groups of 9 cases")
    for partition in (train, test):
        if {row["synthetic_label"] for row in partition} != {0, 1}:
            raise ValueError("Both classes required per partition")
    return train, test


def features(row: dict[str, Any]) -> tuple[float, ...]:
    return (
        row["rainfall_mm_hour"] / 100.0,
        row["water_index"] / 100.0,
        float(row["drainage_condition"] == "moderate"),
        float(row["drainage_condition"] == "limited"),
    )


def sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def score(weights: list[float], row: dict[str, Any]) -> float:
    return sigmoid(weights[0] + sum(w*x for w, x in zip(weights[1:], features(row))))


def fit(train: list[dict]) -> list[float]:
    weights = [0.0] * 5
    for _ in range(EPOCHS):
        grad = [0.0] * len(weights)
        for row in train:
            values = (1.0, *features(row))
            error = sigmoid(sum(w*x for w, x in zip(weights, values))) - row["synthetic_label"]
            for i, value in enumerate(values):
                grad[i] += error * value
        for i in range(len(weights)):
            derivative = grad[i] / len(train) + (REGULARIZATION * weights[i] if i else 0)
            weights[i] -= LEARNING_RATE * derivative
    return weights


def auc_roc(labels: list[int], scores: list[float]) -> float:
    positive = [s for y, s in zip(labels, scores) if y == 1]
    negative = [s for y, s in zip(labels, scores) if y == 0]
    if not positive or not negative:
        raise ValueError("Both classes required for AUC")
    concordant = sum((1.0 if a > b else 0.5 if a == b else 0.0)
                     for a in positive for b in negative)
    return concordant / (len(positive) * len(negative))


def evaluate(rows: list[dict], weights: list[float], train_prevalence: float) -> dict:
    labels = [row["synthetic_label"] for row in rows]
    scores = [score(weights, row) for row in rows]
    tp = sum(y == 1 and s >= SCORE_THRESHOLD for y, s in zip(labels, scores))
    tn = sum(y == 0 and s < SCORE_THRESHOLD for y, s in zip(labels, scores))
    fp = sum(y == 0 and s >= SCORE_THRESHOLD for y, s in zip(labels, scores))
    fn = sum(y == 1 and s < SCORE_THRESHOLD for y, s in zip(labels, scores))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    brier = sum((s-y)**2 for s, y in zip(scores, labels)) / len(labels)
    baseline_brier = sum((train_prevalence-y)**2 for y in labels) / len(labels)
    buckets = []
    for index in range(5):
        indices = [j for j, value in enumerate(scores) if min(4, int(value*5)) == index]
        buckets.append({
            "bin": index + 1,
            "interval": [round(index/5, 2), round((index+1)/5, 2)],
            "count": len(indices),
            "mean_score": round(sum(scores[j] for j in indices)/len(indices), 4) if indices else None,
            "positive_fraction": round(sum(labels[j] for j in indices)/len(indices), 4) if indices else None,
        })
    return {
        "holdout_count": len(rows),
        "holdout_positive_count": sum(labels),
        "confusion_matrix": {"true_positive": tp, "true_negative": tn,
                             "false_positive": fp, "false_negative": fn},
        "accuracy": round((tp+tn)/len(labels), 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(2*precision*recall/(precision+recall), 4) if precision+recall else 0.0,
        "roc_auc": round(auc_roc(labels, scores), 4),
        "brier_score": round(brier, 4),
        "constant_baseline_brier": round(baseline_brier, 4),
        "illustrative_calibration_bins": buckets,
    }


def build_report(dataset: dict | None = None) -> dict:
    data = dataset if dataset is not None else load_dataset()
    train, holdout = validate_dataset(data)
    weights = fit(train)
    train_prevalence = sum(row["synthetic_label"] for row in train) / len(train)
    return {
        "report_version": "aegis.exercise.model-report.v1",
        "model_version": VERSION,
        "source": "synthetic_generated_fixture",
        "mode": "offline_exercise_only",
        "dataset_sha256": hashlib.sha256(_json_bytes(data)).hexdigest(),
        "dataset_count": len(train)+len(holdout),
        "train_count": len(train),
        "train_group_count": 18,
        "holdout_group_count": 6,
        "holdout_is_group_disjoint": True,
        "method": "batch_gradient_logistic_regression_with_l2",
        "feature_names": list(FEATURE_NAMES),
        "weights": [round(w, 8) for w in weights],
        "model_configuration": {"learning_rate": LEARNING_RATE, "epochs": EPOCHS,
                                "regularization": REGULARIZATION, "threshold": SCORE_THRESHOLD},
        "metrics": evaluate(holdout, weights, train_prevalence),
        "validation_scope": "synthetic_holdout_only_not_transferable_to_real_hazards",
        "calibrated_real_world_probability": False,
        "actual_forecast_skill_known": False,
        "live_inference_enabled": False,
        "operational_actions_enabled": False,
        "limitations": [
            "All observations and labels were generated from a synthetic simulation, not real floods.",
            "Held-out scenario groups prevent row leakage but do not establish real-world generalization.",
            "Numerical scores are not calibrated probabilities or emergency severity estimates.",
            "No agency data, imagery, alerts, dispatch or live model inference is connected.",
        ],
    }


def saved_report() -> dict:
    raw = json.loads(report_path().read_text(encoding="utf-8"))
    if raw.get("report_version") != "aegis.exercise.model-report.v1" or raw.get("source") != "synthetic_generated_fixture":
        raise ValueError("Unsafe or unknown model report")
    if raw.get("calibrated_real_world_probability") is not False or raw.get("operational_actions_enabled") is not False:
        raise ValueError("Unsafe report classification")
    return raw


def main() -> None:
    parser = argparse.ArgumentParser(description="Reproducible offline synthetic model evaluation")
    parser.add_argument("--check", action="store_true", help="Recompute and verify committed evaluation report")
    args = parser.parse_args()
    expected = build_report()
    if args.check:
        if saved_report() != expected:
            raise SystemExit("Committed report differs from deterministic synthetic evaluation")
        print("PASS: committed synthetic evaluation matches reproducible rebuild")
    else:
        print(json.dumps(expected, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
