export interface CalibrationBin {
  bin: number;
  interval: [number, number];
  count: number;
  mean_score: number | null;
  positive_fraction: number | null;
}
export interface ModelReport {
  report_version: "aegis.exercise.model-report.v1";
  model_version: string;
  source: "synthetic_generated_fixture";
  mode: "offline_exercise_only";
  dataset_sha256: string;
  dataset_count: number;
  train_count: number;
  train_group_count: number;
  holdout_group_count: number;
  holdout_is_group_disjoint: true;
  method: string;
  feature_names: string[];
  weights: number[];
  model_configuration: {
    epochs: number;
    learning_rate: number;
    regularization: number;
    threshold: number;
  };
  metrics: {
    holdout_count: number;
    holdout_positive_count: number;
    confusion_matrix: {
      true_positive: number;
      true_negative: number;
      false_positive: number;
      false_negative: number;
    };
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    roc_auc: number;
    brier_score: number;
    constant_baseline_brier: number;
    illustrative_calibration_bins: CalibrationBin[];
  };
  validation_scope: "synthetic_holdout_only_not_transferable_to_real_hazards";
  calibrated_real_world_probability: false;
  actual_forecast_skill_known: false;
  live_inference_enabled: false;
  operational_actions_enabled: false;
  limitations: string[];
}
