export type Freshness = "fresh" | "delayed" | "stale" | "no_data" | "clock_anomaly";
export interface NearbySource {
  id: string;
  name: string;
  source_kind: string;
  distance_m: number;
  distance_band: "nearby" | "within_area";
  freshness: Freshness;
  observed_at: string | null;
  quality_status: string | null;
  metric_value: number | null;
  metric_unit: string;
  reason: string;
  synthetic: true;
}
export interface NearbyAsset {
  id: string;
  name: string;
  asset_kind: string;
  distance_m: number;
  distance_band: "nearby" | "within_area";
  impact_status: "not_assessed";
  synthetic: true;
}
export interface SpatialResponse {
  incident_id: string;
  radius_m: number;
  center: { lat: number; lon: number };
  as_of: string;
  nearby_sources: NearbySource[];
  nearby_assets: NearbyAsset[];
  source: "synthetic_exercise";
  analysis_kind: "geographic_proximity_only";
  validated_risk_model: false;
  actual_asset_impact_known: false;
  operational_actions_enabled: false;
  guidance: string[];
}
