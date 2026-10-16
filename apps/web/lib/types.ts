export type IncidentStatus = "new" | "review" | "active" | "resolved";

export interface Incident {
  id: string;
  hazard_type: string;
  status: IncidentStatus;
  lat: number;
  lon: number;
  created_at: string;
}

export interface TelemetryPoint {
  label: string;
  rainfall_mm: number;
  water_index: number;
}

export interface TelemetryResponse {
  source: "synthetic_fixture";
  generated_at: string;
  points: TelemetryPoint[];
}

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  new: "New",
  review: "Awaiting review",
  active: "In progress",
  resolved: "Resolved",
};
