import type { Incident } from "./types";

export type ExerciseEventType = "observation" | "assessment" | "coordination" | "resolution";
export type ExerciseEvidenceKind = "exercise_sensor" | "exercise_report" | "exercise_gis";
export type ExerciseEvidenceQuality = "synthetic_unverified" | "synthetic_curated";

export interface IncidentEvent {
  id: string;
  event_type: ExerciseEventType;
  occurred_at: string;
  recorded_at: string;
  summary: string;
  actor_label: string;
  synthetic: true;
}
export interface IncidentEvidence {
  id: string;
  source_label: string;
  source_kind: ExerciseEvidenceKind;
  summary: string;
  observed_at: string;
  ingested_at: string;
  ingest_lag_seconds: number;
  quality_status: ExerciseEvidenceQuality;
  synthetic: true;
}
export interface IncidentWorkspace {
  incident: Incident;
  timeline: IncidentEvent[];
  evidence: IncidentEvidence[];
  generated_at: string;
  source: "synthetic_exercise";
  operational_actions_enabled: false;
  assessment: {
    status: "not_assessed";
    model_version: null;
    calibrated_probability: null;
    prediction_horizon: null;
    message: string;
  };
}
