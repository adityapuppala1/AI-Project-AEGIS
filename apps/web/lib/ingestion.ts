export type QuarantineReason =
  "invalid_contract" | "unregistered_source" | "unit_mismatch" |
  "future_observation" | "event_conflict" | "oversized_record";
export interface IngestionOverview {
  mode: "synthetic_exercise";
  replay_trigger: "local_cli_only";
  accepted_events: number;
  quarantine_records: number;
  quarantine_reasons: Partial<Record<QuarantineReason,number>>;
  generated_at: string;
  live_ingestion_enabled: false;
  no_operational_actions: true;
}
export const REASON_LABELS: Record<QuarantineReason,string> = {
  invalid_contract: "Contract validation failed",
  unregistered_source: "Unregistered source",
  unit_mismatch: "Metric unit mismatch",
  future_observation: "Future-dated observation",
  event_conflict: "Conflicting event identifier",
  oversized_record: "Oversized payload",
};
