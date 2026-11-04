/** Offline sample fixture for the "Preview with sample data" toggles.
 * Entirely fictional: fake UUIDs, invented values, no real source URLs. It is never sent to or read from the API,
 * never persisted, and every panel that shows it carries a "SAMPLE DATA" chip. Not evidence, not a forecast.
 */
import {
  RUN_STEPS, type AuditRow, type Connector, type ConnectorsPayload, type EvidenceRecord, type HistoryDay, type HistoryPayload,
  type ProactiveRun, type RunStep, type TriggerEvent, type TriggerState, type WatchPayload,
} from "./proactive";

const id = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

interface Seed {
  hazard: string; trigger: string; state: TriggerState; lat: number; lon: number; score: number;
  watch: number; candidate: number; unit: string; live: number; forecast: number; horizon: number; connector: string; ageMin: number; label: string;
}
const SEEDS: Seed[] = [
  { hazard: "flood", trigger: "musi_discharge", state: "candidate", lat: 17.36, lon: 78.47, score: 0.86, watch: 400, candidate: 700, unit: "m3/s", live: 740, forecast: 820, horizon: 24, connector: "open_meteo", ageMin: 22, label: "Musi river, Hyderabad" },
  { hazard: "heavy_rain", trigger: "rain_24h", state: "candidate", lat: 17.49, lon: 78.41, score: 0.81, watch: 65, candidate: 115, unit: "mm/24h", live: 124, forecast: 138, horizon: 24, connector: "open_meteo", ageMin: 18, label: "Kukatpally, Hyderabad" },
  { hazard: "heavy_rain", trigger: "rain_24h", state: "watch", lat: 17.44, lon: 78.5, score: 0.57, watch: 65, candidate: 115, unit: "mm/24h", live: 82, forecast: 97, horizon: 24, connector: "open_meteo", ageMin: 18, label: "Secunderabad" },
  { hazard: "flood", trigger: "lake_level", state: "watch", lat: 17.42, lon: 78.47, score: 0.52, watch: 5.5, candidate: 6.5, unit: "m", live: 5.9, forecast: 6.1, horizon: 12, connector: "open_meteo", ageMin: 40, label: "Hussain Sagar lake" },
  { hazard: "landslide", trigger: "susceptibility_rain", state: "watch", lat: 17.67, lon: 80.88, score: 0.49, watch: 0.5, candidate: 0.75, unit: "index", live: 0.58, forecast: 0.64, horizon: 24, connector: "nasa_lhasa", ageMin: 95, label: "Bhadrachalam hills" },
  { hazard: "landslide", trigger: "susceptibility_rain", state: "clear", lat: 16.48, lon: 78.32, score: 0.14, watch: 0.5, candidate: 0.75, unit: "index", live: 0.21, forecast: 0.24, horizon: 24, connector: "nasa_lhasa", ageMin: 3300, label: "Nallamala foothills" },
  { hazard: "fire", trigger: "active_fire_power", state: "candidate", lat: 17.6, lon: 78.57, score: 0.78, watch: 20, candidate: 50, unit: "MW", live: 63, forecast: 63, horizon: 0, connector: "nasa_firms", ageMin: 130, label: "Shamirpet" },
  { hazard: "fire", trigger: "active_fire_power", state: "clear", lat: 17.63, lon: 78.48, score: 0.09, watch: 20, candidate: 50, unit: "MW", live: 4, forecast: 4, horizon: 0, connector: "nasa_firms", ageMin: 130, label: "Medchal" },
  { hazard: "wind", trigger: "gust_speed", state: "watch", lat: 17.24, lon: 78.43, score: 0.46, watch: 40, candidate: 60, unit: "km/h", live: 46, forecast: 52, horizon: 12, connector: "open_meteo", ageMin: 18, label: "Shamshabad" },
  { hazard: "heat", trigger: "max_temperature", state: "watch", lat: 18.0, lon: 79.59, score: 0.51, watch: 40, candidate: 45, unit: "°C", live: 42, forecast: 43, horizon: 24, connector: "open_meteo", ageMin: 55, label: "Warangal" },
  { hazard: "heat", trigger: "max_temperature", state: "clear", lat: 17.385, lon: 78.48, score: 0.12, watch: 40, candidate: 45, unit: "°C", live: 36, forecast: 37, horizon: 24, connector: "open_meteo", ageMin: 18, label: "Hyderabad centre" },
];

export function buildSampleWatch(nowMs: number): WatchPayload {
  const evidence: EvidenceRecord[] = [];
  const triggers: TriggerEvent[] = SEEDS.map((seed, index) => {
    const evidenceId = id("e", index + 1);
    const observed = new Date(nowMs - seed.ageMin * MIN).toISOString();
    evidence.push({ id: evidenceId, connector_id: seed.connector, hazard: seed.hazard, observed_at: observed, lat: seed.lat, lon: seed.lon,
      value: seed.live, unit: seed.unit, stale: seed.ageMin > 48 * 60, retrieved_at: new Date(nowMs - Math.max(2, seed.ageMin - 3) * MIN).toISOString() });
    const extraId = id("e", 100 + index);
    evidence.push({ id: extraId, connector_id: seed.connector, hazard: seed.hazard, observed_at: new Date(nowMs - (seed.ageMin + 180) * MIN).toISOString(),
      lat: seed.lat + 0.01, lon: seed.lon - 0.01, value: Math.round(seed.live * 0.9 * 1000) / 1000, unit: seed.unit, stale: seed.ageMin + 180 > 48 * 60,
      retrieved_at: new Date(nowMs - (seed.ageMin + 175) * MIN).toISOString() });
    return { id: id("a", index + 1), trigger_id: seed.trigger, hazard: seed.hazard, state: seed.state, fired_at: new Date(nowMs - seed.ageMin * MIN).toISOString(),
      lat: seed.lat, lon: seed.lon, score: seed.score,
      threshold: { watch: seed.watch, candidate: seed.candidate, unit: seed.unit, metric: seed.trigger },
      evidence_ids: [evidenceId, extraId],
      rationale: { location_label: seed.label, forecast_value: seed.forecast, forecast_unit: seed.unit, horizon_h: seed.horizon,
        observed_value: seed.live, rule: `${seed.trigger} against sample watch and candidate marks` } };
  });
  return { generated_at: new Date(nowMs - 2 * MIN).toISOString(), config_version: "sample-fixture", disclaimer: "", evidence, triggers };
}

export function buildSampleHistory(nowMs: number): HistoryPayload {
  const rows: HistoryDay[] = [];
  const hazards = ["flood", "heavy_rain", "landslide", "fire", "wind", "heat"];
  for (let back = 6; back >= 0; back -= 1) {
    const day = new Date(nowMs - back * DAY).toISOString().slice(0, 10);
    hazards.forEach((hazard, h) => {
      const rising = 6 - back;
      rows.push({ day, hazard, state: "watch", count: (h + rising) % 4 });
      rows.push({ day, hazard, state: "candidate", count: rising > 3 && h < 2 ? (rising + h) % 3 : 0 });
    });
  }
  return { days: 7, rows };
}

const CAP_ID = "b0000000-0000-4000-8000-000000000001";
export const SAMPLE_CAP_SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const SAMPLE_CAP_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>SAMPLE-EXERCISE-${CAP_ID}</identifier>
  <sender>sample-fixture@sample.invalid</sender>
  <sent>2026-01-01T00:00:00+05:30</sent>
  <status>Exercise</status>
  <msgType>Alert</msgType>
  <scope>Private</scope>
  <note>SAMPLE DATA. Exercise only. Not evidence, not a warning, not sent.</note>
  <info>
    <language>en-IN</language>
    <category>Met</category>
    <event>Sample heavy rain exercise advisory</event>
    <urgency>Future</urgency>
    <severity>Moderate</severity>
    <certainty>Possible</certainty>
    <headline>SAMPLE: exercise advisory for human review</headline>
    <description>Invented values for interface preview. Nothing here was observed or forecast.</description>
    <area><areaDesc>Sample area, Hyderabad (fictional polygon)</areaDesc></area>
  </info>
</alert>
`;

const STEP_COUNT = RUN_STEPS.length;
/** Pre-computed walkthrough: `done` steps are complete (0 to 5). Pure and offline. */
export function sampleRunAt(done: number, triggerEventId: string): ProactiveRun {
  const n = Math.max(0, Math.min(STEP_COUNT, done));
  const completed: RunStep[] = RUN_STEPS.slice(0, n);
  return {
    id: CAP_ID, status: n >= STEP_COUNT ? "review_ready" : "running", trigger_event_id: triggerEventId, evidence_ids: [id("e", 1), id("e", 101)],
    variants: n >= 2 ? [
      { id: "tighten", label: "Tighter thresholds", threshold_delta: -10, resulting_state: "candidate", score: 0.91 },
      { id: "as_configured", label: "As configured", threshold_delta: 0, resulting_state: "candidate", score: 0.86 },
      { id: "relax", label: "Relaxed thresholds", threshold_delta: 10, resulting_state: "watch", score: 0.74 },
    ] : [],
    judgment: n >= 3 ? {
      provider: "test_double", model: "sample-fixture", decision_band: "needs_review",
      playbook_option: { values: {}, choice: "issue_exercise_watch_advisory", confidence: 0.82,
        probabilities: { issue_exercise_watch_advisory: 0.82, continue_monitoring: 0.13, escalate_to_district_review: 0.05 } },
      severity_band: { values: {}, probabilities: { low: 0.05, moderate: 0.31, high: 0.64 }, score: 0.71, confidence: 0.64 },
      citation_clean: { values: {}, probabilities: { clean: 0.93, unclean: 0.07 } },
      staleness_risk: { values: {}, probabilities: { low: 0.71, high: 0.29 } },
    } : null,
    cap: n >= 4 ? { sha256: SAMPLE_CAP_SHA, generated_at: null } : null,
    completed_steps: completed, next_step: n >= STEP_COUNT ? null : RUN_STEPS[n],
  };
}

// ---------- connectors (admin preview) ----------
const NOW_ISO = (nowMs: number, back: number) => new Date(nowMs - back).toISOString();
export function buildSampleConnectors(nowMs: number): ConnectorsPayload {
  const base = { version: 1, updated_at: NOW_ISO(nowMs, 3 * HOUR), updated_by: "sample-admin", licence: "" };
  const field = (name: string, label: string, secret: boolean, required: boolean, set: boolean, fingerprint: string | null = null) => ({ name, label, secret, required, set, fingerprint });
  const ok = (latency: number, code = 200) => ({ ok: true, status_code: code, latency_ms: latency, message: "Sample response", at: NOW_ISO(nowMs, 40 * MIN) });
  const connectors: Connector[] = [
    { ...base, id: "open_meteo", name: "Open-Meteo", category: "weather/flood", licence: "CC BY 4.0 (sample text)", hosts: ["api.open-meteo.com"], enabled: true,
      settings: { models: "ecmwf_aifs025", points: "hyderabad_grid" }, fields: [field("models", "Forecast models", false, false, true)], last_test: ok(182) },
    { ...base, id: "nasa_firms", name: "NASA FIRMS", category: "fire", licence: "Open NASA data (sample text)", hosts: ["firms.modaps.eosdis.nasa.gov"], enabled: false,
      settings: { area: "india_bbox", days: 1 }, fields: [field("map_key", "FIRMS map key", true, true, false), field("days", "Days of history (1 to 3)", false, false, true)], last_test: null },
    { ...base, id: "nasa_lhasa", name: "NASA LHASA", category: "landslide", licence: "Open NASA data (sample text)", hosts: ["gpm.nasa.gov"], enabled: true,
      settings: { base_url: "fixed" }, fields: [], last_test: null },
    { ...base, id: "copernicus_cdse", name: "Copernicus Data Space", category: "satellite flood extent", licence: "Copernicus terms (sample text)", hosts: ["identity.dataspace.copernicus.eu"], enabled: true,
      settings: { collection: "SENTINEL-1" }, fields: [field("client_id", "Client ID", true, true, true, "9f3a21bc"), field("client_secret", "Client secret", true, true, true, "04d7e5aa")],
      last_test: { ok: false, status_code: 401, latency_ms: 640, message: "Sample failure: credentials rejected", at: NOW_ISO(nowMs, 25 * MIN) } },
    { ...base, id: "imd_warnings", name: "IMD warnings", category: "official warnings", licence: "Terms to be confirmed (sample text)", hosts: ["mausam.imd.gov.in"], enabled: false,
      settings: { terms_accepted: false, base_url: "fixed" }, fields: [field("terms_accepted", "I have confirmed the IMD terms of use", false, true, false)], last_test: null },
    { ...base, id: "gdacs", name: "GDACS event feed", category: "multi-hazard events", licence: "Attribution required; terms to be confirmed by owner (sample text)", hosts: ["www.gdacs.org"], enabled: false,
      settings: { area: "68,6,98,38", event_types: "FL;TC;EQ;WF;DR;VO", days: 3 }, fields: [], last_test: null },
    { ...base, id: "google_flood_forecasting", name: "Google Flood Forecasting", category: "river flood forecasts", licence: "CC BY 4.0; waitlist key (sample text)", hosts: ["floodforecasting.googleapis.com"], enabled: false,
      settings: { region_code: "IN", radius_km: 150 }, fields: [field("api_key", "API key", true, true, false)], last_test: null },
    { ...base, id: "typesafe_jev", name: "TypeSafe / Jev", category: "decision judgments", licence: "Commercial (sample text)", hosts: ["api.typesafe.ai"], enabled: false,
      settings: { model: "jev-latest", monthly_input_token_budget: 100000 }, fields: [field("api_key", "API key", true, true, true, "a1b2c3d4"), field("model", "Model", false, false, true), field("monthly_input_token_budget", "Monthly input-token budget", false, false, true)], last_test: ok(310) },
    { ...base, id: "cap_handover", name: "CAP hand-over", category: "hand-over", licence: "", hosts: [], enabled: true,
      settings: { mode: "file_export" }, fields: [], last_test: ok(12, 200) },
    { ...base, id: "authority_notification", name: "Authority notification", category: "hand-over", licence: "", hosts: [], enabled: false,
      settings: { enabled: false }, fields: [], last_test: null },
  ];
  return { master_key_configured: false, connectors };
}

export function buildSampleAudit(nowMs: number): AuditRow[] {
  const rows: [string, string, string, boolean, number][] = [
    ["open_meteo", "test", "sample-admin", true, 40 * MIN], ["open_meteo", "enable", "sample-admin", true, 3 * HOUR], ["open_meteo", "save", "sample-admin", true, 3 * HOUR + 5 * MIN],
    ["copernicus_cdse", "test", "sample-admin", false, 25 * MIN], ["copernicus_cdse", "save", "sample-admin", true, 26 * MIN],
    ["nasa_firms", "clear", "sample-admin", true, 2 * DAY], ["typesafe_jev", "test", "sample-admin", true, 5 * HOUR],
  ];
  return rows.map(([connector_id, action, actor, ok, back], index) => ({ id: id("c", index + 1), connector_id, action, ok, actor, at: NOW_ISO(nowMs, back) }));
}
