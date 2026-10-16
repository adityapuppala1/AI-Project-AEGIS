export type SourceHealthStatus = "fresh" | "delayed" | "stale" | "no_data" | "clock_anomaly";
export type SourceKind = "rain_gauge" | "water_level" | "field_report" | "drainage_status";

export interface ExerciseReading {
  id: string;
  observed_at: string;
  ingested_at: string;
  value: number;
  quality_status: "synthetic_curated" | "synthetic_unverified";
  synthetic: true;
}
export interface ExerciseSource {
  id: string;
  name: string;
  source_kind: SourceKind;
  metric_label: string;
  metric_unit: string;
  expected_interval_seconds: number;
  warning_multiplier: number;
  stale_multiplier: number;
  health: {
    status: SourceHealthStatus;
    age_seconds: number | null;
    ingestion_lag_seconds: number | null;
    reason: string;
  };
  latest: ExerciseReading | null;
  synthetic: true;
}
export interface SourceOverview {
  sources: ExerciseSource[];
  counts: Record<SourceHealthStatus, number>;
  source: "synthetic_exercise";
  as_of: string;
  real_connectors_enabled: false;
  total: number;
}
export interface SourceHistory {
  id: string;
  name: string;
  metric_label: string;
  metric_unit: string;
  samples: ExerciseReading[];
  source: "synthetic_exercise";
  as_of: string;
  real_connector: false;
}
export const STATUS_LABELS: Record<SourceHealthStatus,string> = {
  fresh: "Within demo window",
  delayed: "Delayed data",
  stale: "Stale data",
  no_data: "No observations",
  clock_anomaly: "Time anomaly",
};
export const KIND_LABELS: Record<SourceKind,string> = {
  rain_gauge: "Rain gauge",
  water_level: "Water level",
  field_report: "Field report",
  drainage_status: "Drainage",
};
export function displayAge(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "Not available";
  if (seconds < 0) return "Future-dated";
  if (seconds < 60) return Math.floor(seconds) + " sec";
  if (seconds < 3600) return Math.floor(seconds/60) + " min";
  if (seconds < 86400) return Math.floor(seconds/3600) + " hr " + Math.floor((seconds%3600)/60) + " min";
  return Math.floor(seconds/86400) + " days";
}
