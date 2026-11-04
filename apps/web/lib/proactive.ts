/** Proactive multi-hazard types, pure helpers and defensive payload cleaners.
 * Shared by the BFF (server) and the Hazard Watch / Connectors pages (client).
 * Everything here is display-only decision support: no send path, no accuracy claim.
 */
export type TriggerState = "clear" | "watch" | "candidate";
export type DecisionBand = "recommended" | "needs_review" | "blocked";
export type RunStatus = "running" | "review_ready" | "cancelled";
export type Scalar = string | number | boolean | null;
export type Bag = Record<string, Scalar | Scalar[]>;

export const CONNECTOR_IDS = ["open_meteo", "nasa_firms", "nasa_lhasa", "copernicus_cdse", "imd_warnings", "gdacs", "google_flood_forecasting", "typesafe_jev", "cap_handover", "authority_notification"] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];
export const RUN_STEPS = ["gather_evidence", "simulate_variants", "judge", "draft_cap", "plan_prepositioning", "hand_to_human"] as const;
/** Runs created before the A5 plan step keep their original five steps. */
export const LEGACY_RUN_STEPS: readonly RunStep[] = ["gather_evidence", "simulate_variants", "judge", "draft_cap", "hand_to_human"];
export type RunStep = (typeof RUN_STEPS)[number];
export const TRIGGER_STATES: readonly TriggerState[] = ["clear", "watch", "candidate"];
export const DISCLAIMER = "Decision support only. Exercise CAP draft; AEGIS never sends warnings. Synthetic thresholds, not calibrated.";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);
export const isConnectorId = (value: unknown): value is ConnectorId => typeof value === "string" && (CONNECTOR_IDS as readonly string[]).includes(value);
export const isRunStep = (value: unknown): value is RunStep => typeof value === "string" && (RUN_STEPS as readonly string[]).includes(value);

// ---------- shapes ----------
export interface EvidenceRecord {
  id: string; connector_id: string; hazard: string; observed_at: string | null;
  lat: number; lon: number; value: number | null; unit: string; stale: boolean; retrieved_at: string | null;
}
export type ImpactStatus = "evaluated" | "exposure_layer_empty" | "exposure_unavailable" | "hazard_not_configured";
export type ExposureBasis = "synthetic" | "licensed" | "mixed" | "none";
/** A3 impact block: hazard state x exposure counted inside a fixed exercise footprint. Not a damage estimate. */
export interface ImpactSummary {
  status: ImpactStatus; config_version: string; state: TriggerState | null; hazard_state: TriggerState | null;
  data_basis: ExposureBasis | null; people_exposed: number | null; critical_facilities: number | null; road_segments: number | null;
  footprint_radius_km: number | null; exposure_feature_ids: string[];
}
export interface TriggerEvent {
  id: string; trigger_id: string; hazard: string; state: TriggerState; fired_at: string | null;
  lat: number; lon: number; score: number; threshold: Scalar | Bag | null; evidence_ids: string[]; rationale: Bag;
  impact?: ImpactSummary | null;
}
export interface WatchPayload {
  generated_at: string | null; config_version: string; disclaimer: string;
  /** Platform kill switch: true engaged, false running, null unreadable. Absent in sample data. */
  paused?: boolean | null;
  evidence: EvidenceRecord[]; triggers: TriggerEvent[];
}
export interface PauseAuditRow { paused: boolean; reason: string; actor: string; at: string | null }
export interface PauseState { paused: boolean; reason: string | null; updated_at: string | null; updated_by: string | null; audit?: PauseAuditRow[] }
export interface HistoryDay { day: string; hazard: string; state: TriggerState; count: number }
export interface HistoryPayload { days: number; rows: HistoryDay[] }
export interface ConnectorField { name: string; label: string; secret: boolean; required: boolean; set: boolean; fingerprint: string | null }
export interface TestResult { ok: boolean; status_code: number | null; latency_ms: number | null; message: string; at: string | null }
export interface Connector {
  id: string; name: string; category: string; licence: string; hosts: string[]; enabled: boolean; version: number;
  updated_at: string | null; updated_by: string | null; settings: Record<string, string | number | boolean>;
  fields: ConnectorField[]; last_test: TestResult | null;
}
export interface ConnectorsPayload { master_key_configured: boolean; connectors: Connector[] }
export interface AuditRow { id: string; connector_id: string; action: string; ok: boolean; actor: string; at: string | null }
export interface RefreshResult { fetched: Record<string, number | string>; evidence_added: number; triggers: Record<TriggerState, number> }
export interface Variant { id: string; label: string; threshold_delta: number; resulting_state: TriggerState; score: number }
export interface Question { values: Record<string, number>; probabilities: Record<string, number> }
export interface Judgment {
  provider: "typesafe_jev" | "test_double"; model: string; decision_band: DecisionBand;
  playbook_option: Question & { choice: string; confidence: number };
  severity_band: Question & { score: number | null; confidence: number | null };
  citation_clean: Question; staleness_risk: Question;
}
export type SentinelFlagName = "strengthened" | "weakened" | "contradicted" | "stale";
export const SENTINEL_FLAGS: readonly SentinelFlagName[] = ["strengthened", "weakened", "contradicted", "stale"];
/** Evidence-change observation appended by the sentinel. It never edits the draft or CAP. */
export interface SentinelFlag { flag: SentinelFlagName; evidence_ids: string[]; at: string | null; score: number | null; previous_score: number | null }
export interface ProactiveRun {
  id: string; status: RunStatus; trigger_event_id: string; evidence_ids: string[]; variants: Variant[];
  judgment: Judgment | null; cap: { sha256: string; generated_at: string | null } | null;
  completed_steps: RunStep[]; next_step: RunStep | null;
  /** "scheduler" when prepared by the scheduled watch loop; a human still takes the hand-off. */
  origin?: "scheduler" | "operator"; sentinel_flags?: SentinelFlag[]; steps?: RunStep[];
  /** Area/hazard key ("heavy_rain:point") so a later trigger event can resume an open run. */
  trigger_id?: string | null;
  /** A3 impact counts copied into the evidence bundle at gather_evidence. */
  impact?: ImpactSummary | null;
}
const TRIGGER_KEY = /^[a-z_]{2,40}:[A-Za-z0-9_.-]{1,60}$/;
/** The open run to resume for a selected trigger: same event, or the same area/hazard key. */
export function openRunFor(runs: ProactiveRun[], triggerEventId: string, triggerKey?: string | null): ProactiveRun | null {
  return runs.find(run => run.status === "running" && (run.trigger_event_id === triggerEventId || (!!triggerKey && run.trigger_id === triggerKey))) ?? null;
}
export type TickOutcome = "completed" | "skipped_paused" | "skipped_locked" | "failed";
export interface SchedulerTick { id: string; started_at: string | null; finished_at: string | null; duration_ms?: number | null; outcome: TickOutcome; runs_started: number; flags_recorded: number; errors: string[] }
export interface SchedulerStatus { enabled: boolean; running: boolean; reason: string | null; interval_seconds: number; next_tick_at: string | null; last_tick: SchedulerTick | null; ticks: SchedulerTick[] }

// ---------- pure helpers ----------
export const BAND_LABEL: Record<DecisionBand, string> = { recommended: "Recommended", needs_review: "Needs review", blocked: "Blocked" };
export const BAND_STYLE: Record<DecisionBand, string> = {
  recommended: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  needs_review: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  blocked: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30",
};
export const BAND_POLICY: Record<DecisionBand, string> = {
  recommended: "Playbook confidence and citation cleanliness are high and staleness risk is low. A human still reviews before anything leaves AEGIS.",
  needs_review: "Confidence is mixed. An accountable human must review the evidence before using this draft.",
  blocked: "Playbook confidence is low or citations are not clean. The draft must not be used.",
};
export const decisionBandLabel = (band: unknown): string => isBand(band) ? BAND_LABEL[band] : "Unknown";
export function isBand(value: unknown): value is DecisionBand { return value === "recommended" || value === "needs_review" || value === "blocked"; }
export function isState(value: unknown): value is TriggerState { return value === "clear" || value === "watch" || value === "candidate"; }

export const STATE_COLOR: Record<TriggerState, string> = { clear: "#64748b", watch: "#f59e0b", candidate: "#e11d48" };
export const STATE_RANK: Record<TriggerState, number> = { clear: 0, watch: 1, candidate: 2 };

export interface HazardStyle { label: string; color: string; icon: "waves" | "flame" | "mountain" | "wind" | "thermometer" | "droplets" | "satellite" | "alert" }
const HAZARD_STYLE: Record<string, HazardStyle> = {
  flood: { label: "Flood", color: "#0ea5e9", icon: "waves" },
  waterlogging: { label: "Waterlogging", color: "#06b6d4", icon: "droplets" },
  fire: { label: "Fire", color: "#f97316", icon: "flame" },
  wildfire: { label: "Wildfire", color: "#f97316", icon: "flame" },
  landslide: { label: "Landslide", color: "#b45309", icon: "mountain" },
  cyclone: { label: "Cyclone", color: "#8b5cf6", icon: "wind" },
  heat: { label: "Heat", color: "#ef4444", icon: "thermometer" },
  rainfall: { label: "Rainfall", color: "#3b82f6", icon: "droplets" },
  heavy_rain: { label: "Heavy rain", color: "#3b82f6", icon: "droplets" },
  wind: { label: "Wind", color: "#8b5cf6", icon: "wind" },
  flood_extent: { label: "Flood extent", color: "#0284c7", icon: "satellite" },
  river_discharge: { label: "River discharge", color: "#0ea5e9", icon: "waves" },
  gdacs_alert: { label: "GDACS event", color: "#a855f7", icon: "alert" },
  flood_gauge: { label: "Flood gauge forecast", color: "#0369a1", icon: "waves" },
};
const FALLBACK_STYLE: HazardStyle = { label: "Other", color: "#64748b", icon: "alert" };
/** hasOwnProperty-safe: "__proto__", "constructor" and friends fall back to the neutral style. */
export function hazardStyle(hazard: unknown): HazardStyle {
  return typeof hazard === "string" && Object.prototype.hasOwnProperty.call(HAZARD_STYLE, hazard) ? HAZARD_STYLE[hazard] : FALLBACK_STYLE;
}

/** Evidence is stale when the API says so, or when its observation is older than maxHours (default 48). */
export function isStale(record: { stale?: boolean; observed_at?: string | null }, nowMs: number, maxHours = 48): boolean {
  if (record.stale === true) return true;
  const time = record.observed_at ? Date.parse(record.observed_at) : NaN;
  return Number.isNaN(time) ? true : nowMs - time > maxHours * 3_600_000;
}
export const capFilename = (runId: string) => `aegis-exercise-cap-${isUuid(runId) ? runId : "run"}.xml`;
export const barWidth = (probability: number) => `${Math.round(Math.max(0, Math.min(1, probability)) * 100)}%`;
export const pct = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";
/** First `count` lines of CAP XML for the on-page preview. */
export const previewLines = (xml: string, count = 40) => xml.split(/\r?\n/).slice(0, count).join("\n");
/** Watch and candidate marks from a trigger threshold bag, or null when they are not both numeric. */
export function thresholdMarks(threshold: Scalar | Bag | null): { watch: number; candidate: number; unit: string } | null {
  if (threshold === null || typeof threshold !== "object" || Array.isArray(threshold)) return null;
  const bag = threshold as Bag;
  const watch = bag.watch ?? bag.watch_threshold, candidate = bag.candidate ?? bag.candidate_threshold;
  if (typeof watch !== "number" || typeof candidate !== "number" || !Number.isFinite(watch) || !Number.isFinite(candidate)) return null;
  return { watch, candidate, unit: typeof bag.unit === "string" ? bag.unit : "" };
}
/** Coarse age for display; null when the time is missing or invalid. */
export function ageParts(iso: string | null | undefined, nowMs: number): { n: number; unit: "now" | "min" | "hr" | "days" } | null {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return null;
  const minutes = Math.max(0, Math.round((nowMs - time) / 60_000));
  if (minutes < 1) return { n: 0, unit: "now" };
  if (minutes < 90) return { n: minutes, unit: "min" };
  if (minutes < 48 * 60) return { n: Math.round(minutes / 60), unit: "hr" };
  return { n: Math.round(minutes / 1440), unit: "days" };
}
/** Equal-height schematic columns: height never encodes score, flood extent or severity (colour shows state). */
export const COLUMN_HEIGHT_M = 3000;
export function dayBuckets(rows: HistoryDay[], days: number, nowMs: number) {
  const out: { day: string; watch: number; candidate: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(nowMs - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day, watch: 0, candidate: 0 });
  }
  for (const row of rows) {
    const slot = out.find(item => item.day === row.day);
    if (!slot) continue;
    if (row.state === "watch") slot.watch += row.count;
    if (row.state === "candidate") slot.candidate += row.count;
  }
  return out;
}

// ---------- cleaners (never trust the API or the network) ----------
const RESERVED = new Set(["__proto__", "constructor", "prototype", "hasownproperty", "tostring", "valueof"]);
export const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : null;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const timestamp = (value: unknown) => { const raw = text(value, 40); return raw && !Number.isNaN(Date.parse(raw)) ? raw : null; };
const KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/;
const safeKey = (key: string) => KEY.test(key) && !RESERVED.has(key.toLowerCase());
/** Short machine identifier (hazard, connector id, trigger id); anything else becomes the fallback. */
export function safeCategory(value: unknown, fallback = "other"): string {
  const raw = text(value, 60);
  return raw && /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(raw) && !RESERVED.has(raw.toLowerCase()) ? raw : fallback;
}
const scalar = (value: unknown): Scalar | undefined => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 300);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
};
export function cleanBag(value: unknown, maxKeys = 24): Bag {
  const out: Bag = {};
  if (!isObject(value)) return out;
  for (const key of Object.keys(value).slice(0, 80)) {
    if (!safeKey(key) || Object.keys(out).length >= maxKeys) continue;
    const item = value[key];
    if (Array.isArray(item)) out[key] = item.slice(0, 20).map(scalar).filter((entry): entry is Scalar => entry !== undefined);
    else { const cleaned = scalar(item); if (cleaned !== undefined) out[key] = cleaned; }
  }
  return out;
}
const numberMap = (value: unknown, max = 12): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const key of Object.keys(value)) {
    const number = finite(value[key]);
    if (safeKey(key) && number !== null && Object.keys(out).length < max) out[key] = number;
  }
  return out;
};
const uuidList = (value: unknown, max = 200) => Array.isArray(value) ? value.filter(isUuid).slice(0, max) : [];

const IMPACT_STATUSES: readonly ImpactStatus[] = ["evaluated", "exposure_layer_empty", "exposure_unavailable", "hazard_not_configured"];
const BASES: readonly ExposureBasis[] = ["synthetic", "licensed", "mixed", "none"];
const count = (value: unknown) => { const n = finite(value); return n !== null && n >= 0 && Number.isInteger(n) ? n : null; };
/** Defensive impact cleaner: closed sets for status/basis, non-negative integer counts, UUID citations only. */
export function cleanImpact(value: unknown): ImpactSummary | null {
  if (!isObject(value) || !(IMPACT_STATUSES as readonly unknown[]).includes(value.status)) return null;
  const radius = finite(value.footprint_radius_km);
  return { status: value.status as ImpactStatus, config_version: safeVersion(value.config_version),
    state: isState(value.state) ? value.state : null, hazard_state: isState(value.hazard_state) ? value.hazard_state : null,
    data_basis: (BASES as readonly unknown[]).includes(value.data_basis) ? value.data_basis as ExposureBasis : null,
    people_exposed: count(value.people_exposed), critical_facilities: count(value.critical_facilities), road_segments: count(value.road_segments),
    footprint_radius_km: radius !== null && radius > 0 && radius <= 100 ? radius : null, exposure_feature_ids: uuidList(value.exposure_feature_ids, 50) };
}
const safeVersion = (value: unknown) => { const raw = text(value, 60); return raw && /^[a-z0-9.-]{1,60}$/.test(raw) ? raw : "unknown"; };
/** The UI label: impact-based with the exposure basis, or hazard-only when no exposure was evaluated. */
export function impactLabel(impact: ImpactSummary | null | undefined): string {
  if (!impact || impact.status !== "evaluated") return "hazard-only (no exposure layer)";
  if (impact.data_basis === "synthetic") return "impact-based (synthetic exposure)";
  if (impact.data_basis === "licensed") return "impact-based (licensed exposure)";
  if (impact.data_basis === "mixed") return "impact-based (mixed exposure)";
  return "impact-based (no exposure in footprint)";
}

export function cleanWatch(value: unknown): WatchPayload {
  if (!isObject(value) || !Array.isArray(value.evidence) || !Array.isArray(value.triggers)) throw new Error("Invalid watch payload");
  const seen = new Set<string>();
  const evidence = value.evidence.slice(0, 500).flatMap((item): EvidenceRecord[] => {
    if (!isObject(item) || !isUuid(item.id) || seen.has(item.id)) return [];
    const lat = finite(item.lat), lon = finite(item.lon);
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    seen.add(item.id);
    return [{ id: item.id, connector_id: safeCategory(item.connector_id, "unknown"), hazard: safeCategory(item.hazard), observed_at: timestamp(item.observed_at),
      lat, lon, value: finite(item.value), unit: text(item.unit, 20) ?? "", stale: item.stale === true, retrieved_at: timestamp(item.retrieved_at) }];
  });
  const seenTrigger = new Set<string>();
  const triggers = value.triggers.slice(0, 500).flatMap((item): TriggerEvent[] => {
    if (!isObject(item) || !isUuid(item.id) || seenTrigger.has(item.id) || !isState(item.state)) return [];
    const lat = finite(item.lat), lon = finite(item.lon), score = finite(item.score);
    if (lat === null || lon === null || score === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    seenTrigger.add(item.id);
    const threshold = isObject(item.threshold) ? cleanBag(item.threshold) : scalar(item.threshold) ?? null;
    return [{ id: item.id, trigger_id: safeCategory(item.trigger_id, "unknown"), hazard: safeCategory(item.hazard), state: item.state,
      fired_at: timestamp(item.fired_at), lat, lon, score: Math.max(0, Math.min(1, score)), threshold, evidence_ids: uuidList(item.evidence_ids), rationale: cleanBag(item.rationale), impact: cleanImpact(item.impact) }];
  });
  return { generated_at: timestamp(value.generated_at), config_version: text(value.config_version, 60) ?? "unknown",
    disclaimer: text(value.disclaimer, 400) ?? DISCLAIMER, paused: typeof value.paused === "boolean" ? value.paused : null, evidence, triggers };
}

export function cleanHistory(value: unknown): HistoryPayload {
  const source = isObject(value) ? (Array.isArray(value.rows) ? value.rows : Array.isArray(value.history) ? value.history : null) : null;
  if (!source) throw new Error("Invalid history payload");
  const rows = source.slice(0, 2000).flatMap((item): HistoryDay[] => {
    if (!isObject(item) || !isState(item.state)) return [];
    const day = text(item.day, 10), count = finite(item.count);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || count === null || count < 0) return [];
    return [{ day, hazard: safeCategory(item.hazard), state: item.state, count: Math.round(count) }];
  });
  return { days: Math.max(1, Math.min(31, finite((value as Record<string, unknown>).days) ?? 7)), rows };
}

export function cleanTriggersConfig(value: unknown): Record<string, unknown> {
  if (!isObject(value) || JSON.stringify(value).length > 60_000) throw new Error("Invalid trigger config");
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function cleanTest(value: unknown): TestResult | null {
  if (!isObject(value)) return null;
  return { ok: value.ok === true, status_code: finite(value.status_code), latency_ms: finite(value.latency_ms),
    message: text(value.message, 300) ?? "", at: timestamp(value.at ?? value.tested_at) };
}
export const cleanTestResult = cleanTest;

export function cleanConnector(item: unknown): Connector | null {
  if (!isObject(item) || !isConnectorId(item.id)) return null;
  const settings: Connector["settings"] = {};
  for (const [key, entry] of Object.entries(cleanBag(item.settings, 20))) if (!Array.isArray(entry) && entry !== null) settings[key] = entry;
  const fields = Array.isArray(item.fields) ? item.fields.slice(0, 20).flatMap((field): ConnectorField[] => {
    if (!isObject(field)) return [];
    const name = text(field.name, 60);
    if (!name || !safeKey(name)) return [];
    const fp = text(field.fingerprint, 8);
    // Only the 8-hex fingerprint is ever shown, never a value.
    return [{ name, label: text(field.label, 80) ?? name, secret: field.secret === true, required: field.required === true,
      set: field.set === true, fingerprint: fp && /^[0-9a-f]{8}$/i.test(fp) ? fp : null }];
  }) : [];
  return { id: item.id, name: text(item.name, 80) ?? item.id, category: text(item.category, 60) ?? "", licence: text(item.licence, 200) ?? "",
    hosts: Array.isArray(item.hosts) ? item.hosts.map(h => text(h, 120)).filter((h): h is string => !!h).slice(0, 8) : [],
    enabled: item.enabled === true, version: Number.isSafeInteger(item.version) ? Number(item.version) : 0,
    updated_at: timestamp(item.updated_at), updated_by: text(item.updated_by, 120), settings, fields, last_test: cleanTest(item.last_test) };
}
export function cleanConnectors(value: unknown): ConnectorsPayload {
  if (!isObject(value) || !Array.isArray(value.connectors)) throw new Error("Invalid connectors payload");
  return { master_key_configured: value.master_key_configured === true,
    connectors: value.connectors.slice(0, 20).map(cleanConnector).filter((c): c is Connector => c !== null) };
}
export function cleanAudit(value: unknown): AuditRow[] {
  const rows = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.rows) ? value.rows : isObject(value) && Array.isArray(value.audit) ? value.audit : null;
  if (!rows) throw new Error("Invalid audit payload");
  return rows.slice(0, 50).flatMap((row): AuditRow[] => {
    if (!isObject(row)) return [];
    return [{ id: text(row.id, 60) ?? "", connector_id: safeCategory(row.connector_id, "unknown"), action: safeCategory(row.action, "unknown"),
      ok: row.ok === true, actor: text(row.actor, 120) ?? "unknown", at: timestamp(row.at) }];
  });
}
export function cleanRefresh(value: unknown): RefreshResult {
  if (!isObject(value) || !isObject(value.fetched)) throw new Error("Invalid refresh payload");
  const fetched: Record<string, number | string> = {};
  for (const key of Object.keys(value.fetched).slice(0, 12)) {
    const entry = value.fetched[key];
    if (!safeKey(key)) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) fetched[key] = entry;
    else if (typeof entry === "string") fetched[key] = safeCategory(entry, "error");
  }
  const t = isObject(value.triggers) ? value.triggers : {};
  return { fetched, evidence_added: Math.max(0, Math.round(finite(value.evidence_added) ?? 0)),
    triggers: { clear: Math.round(finite(t.clear) ?? 0), watch: Math.round(finite(t.watch) ?? 0), candidate: Math.round(finite(t.candidate) ?? 0) } };
}

function cleanQuestion(value: unknown): Question {
  if (!isObject(value)) return { values: {}, probabilities: {} };
  const values = numberMap(value);
  return { values, probabilities: numberMap(value.probabilities) };
}
function cleanJudgment(value: unknown): Judgment | null {
  if (!isObject(value) || !isBand(value.decision_band)) return null;
  const playbook = isObject(value.playbook_option) ? value.playbook_option : {};
  const severity = isObject(value.severity_band) ? value.severity_band : {};
  return { provider: value.provider === "typesafe_jev" ? "typesafe_jev" : "test_double", model: text(value.model, 60) ?? "unknown",
    decision_band: value.decision_band,
    playbook_option: { ...cleanQuestion(playbook), choice: text(playbook.choice, 80) ?? "", confidence: finite(playbook.confidence) ?? 0 },
    severity_band: { ...cleanQuestion(severity), score: finite(severity.score), confidence: finite(severity.confidence) },
    citation_clean: cleanQuestion(value.citation_clean), staleness_risk: cleanQuestion(value.staleness_risk) };
}
export function cleanRun(value: unknown): ProactiveRun {
  if (!isObject(value) || !isUuid(value.id) || !isUuid(value.trigger_event_id)) throw new Error("Invalid run payload");
  const status: RunStatus = value.status === "cancelled" ? "cancelled" : value.status === "review_ready" ? "review_ready" : "running";
  const variants = Array.isArray(value.variants) ? value.variants.slice(0, 12).flatMap((item): Variant[] => {
    if (!isObject(item) || !isState(item.resulting_state)) return [];
    const delta = finite(item.threshold_delta), score = finite(item.score);
    if (delta === null || score === null) return [];
    return [{ id: safeCategory(item.id, "variant"), label: text(item.label, 80) ?? "Variant", threshold_delta: delta, resulting_state: item.resulting_state, score }];
  }) : [];
  const cap = isObject(value.cap) && typeof value.cap.sha256 === "string" && /^[0-9a-f]{64}$/i.test(value.cap.sha256)
    ? { sha256: value.cap.sha256, generated_at: timestamp(value.cap.generated_at) } : null;
  // The API returns {step, completed_at, completed_by}; older payloads and samples use bare step names.
  const completed = Array.isArray(value.completed_steps) ? value.completed_steps.map(item => isObject(item) ? item.step : item).filter(isRunStep) : [];
  const flags = Array.isArray(value.sentinel_flags) ? value.sentinel_flags.slice(-50).flatMap((item): SentinelFlag[] => {
    if (!isObject(item) || !(SENTINEL_FLAGS as readonly unknown[]).includes(item.flag)) return [];
    return [{ flag: item.flag as SentinelFlagName, evidence_ids: uuidList(item.evidence_ids, 20), at: timestamp(item.at),
      score: finite(item.score), previous_score: finite(item.previous_score) }];
  }) : [];
  return { id: value.id, status, trigger_event_id: value.trigger_event_id, evidence_ids: uuidList(value.evidence_ids), variants,
    judgment: cleanJudgment(value.judgment), cap, completed_steps: completed, next_step: isRunStep(value.next_step) ? value.next_step : null,
    origin: value.origin === "scheduler" ? "scheduler" : "operator", sentinel_flags: flags,
    steps: Array.isArray(value.steps) && value.steps.length === RUN_STEPS.length && value.steps.every(isRunStep) ? [...RUN_STEPS] : [...LEGACY_RUN_STEPS],
    trigger_id: typeof value.trigger_id === "string" && TRIGGER_KEY.test(value.trigger_id) ? value.trigger_id : null,
    impact: cleanImpact(value.impact) };
}

// ---------- connector status (admin page) ----------
export type ConnectorStatus = "not_configured" | "untested" | "passed" | "failed" | "disabled" | "blocked_terms";
/** Labels of required fields that have no stored value yet. Secret values are never read, only the `set` flag. */
export function missingRequired(connector: Connector): ConnectorField[] {
  return connector.fields.filter(field => field.required && (field.secret ? !field.set : connector.settings[field.name] === undefined || connector.settings[field.name] === ""));
}
export function connectorStatus(connector: Connector): ConnectorStatus {
  if (connector.id === "imd_warnings" && connector.settings.terms_accepted !== true) return "blocked_terms";
  if (missingRequired(connector).length > 0) return "not_configured";
  if (!connector.enabled) return "disabled";
  if (!connector.last_test) return "untested";
  return connector.last_test.ok ? "passed" : "failed";
}
/** Ready means enabled and the last saved test passed. Authority notification can never be enabled and is not counted. */
export const isReady = (connector: Connector) => connector.id !== "authority_notification" && connector.enabled && connectorStatus(connector) === "passed";

export function cleanPause(value: unknown): PauseState {
  if (!isObject(value) || typeof value.paused !== "boolean") throw new Error("Invalid pause payload");
  const out: PauseState = { paused: value.paused, reason: text(value.reason, 500), updated_at: timestamp(value.updated_at), updated_by: text(value.updated_by, 120) };
  if (Array.isArray(value.audit)) {
    out.audit = value.audit.slice(0, 20).flatMap((row): PauseAuditRow[] => isObject(row) && typeof row.paused === "boolean"
      ? [{ paused: row.paused, reason: text(row.reason, 500) ?? "", actor: text(row.actor, 120) ?? "unknown", at: timestamp(row.at) }] : []);
  }
  return out;
}
export function cleanRunList(value: unknown): { runs: ProactiveRun[] } {
  if (!isObject(value) || !Array.isArray(value.runs)) throw new Error("Invalid run list");
  return { runs: value.runs.slice(0, 50).flatMap(item => { try { return [cleanRun(item)]; } catch { return []; } }) };
}
const TICK_OUTCOMES: readonly TickOutcome[] = ["completed", "skipped_paused", "skipped_locked", "failed"];
function cleanTick(item: unknown): SchedulerTick | null {
  if (!isObject(item) || !isUuid(item.id) || !(TICK_OUTCOMES as readonly unknown[]).includes(item.outcome)) return null;
  const count = (value: unknown) => Math.max(0, Math.round(finite(value) ?? 0));
  return { id: item.id, started_at: timestamp(item.started_at), finished_at: timestamp(item.finished_at), outcome: item.outcome as TickOutcome,
    duration_ms: (() => { const v = finite(item.duration_ms); return v !== null && v >= 0 ? Math.round(v) : null; })(),
    runs_started: count(item.runs_started), flags_recorded: count(item.flags_recorded),
    errors: Array.isArray(item.errors) ? item.errors.slice(0, 12).map(code => safeCategory(code, "error")) : [] };
}
/** Scheduler status for operators. Only fixed codes and counts survive; agency scope is never echoed. */
export function cleanScheduler(value: unknown): SchedulerStatus {
  if (!isObject(value) || typeof value.enabled !== "boolean") throw new Error("Invalid scheduler payload");
  const ticks = Array.isArray(value.ticks) ? value.ticks.slice(0, 50).map(cleanTick).filter((t): t is SchedulerTick => t !== null) : [];
  const interval = finite(value.interval_seconds);
  return { enabled: value.enabled, running: value.running === true, reason: value.reason === null || value.reason === undefined ? null : safeCategory(value.reason, "unknown"),
    interval_seconds: interval !== null && interval > 0 ? Math.round(interval) : 0, next_tick_at: timestamp(value.next_tick_at),
    last_tick: cleanTick(value.last_tick), ticks };
}
// ---------- A5 pre-positioning plan (recommendation only) ----------
export const PLAN_LABEL = "Recommendation only — no team is moved or notified";
export const PLAN_REASONS = ["run_blocked", "no_exposure", "no_critical_facilities", "no_staging_points", "no_available_teams", "exposure_unavailable", "teams_unavailable"] as const;
export type PlanReason = (typeof PLAN_REASONS)[number];
const TEAM_ID = /^syn-team-[a-z0-9-]{1,40}$/;
const STAGING_KINDS = ["shelter", "school", "hospital"] as const;
export interface PlanCover { feature_id: string; minutes: number }
export interface PlanAssignment { team_id: string; team_label: string; capacity: number; staging_feature_id: string; staging_kind: (typeof STAGING_KINDS)[number]; preposition_minutes: number; covers: PlanCover[] }
export interface PlanOption { rank: number; covered: number; critical_total: number; max_minutes: number; total_minutes: number; max_preposition_minutes: number; assignments: PlanAssignment[]; uncovered_feature_ids: string[] }
export interface PrepositioningPlan {
  status: "planned" | "abstained"; reason: PlanReason | null; label: string; search_method: "exact" | "greedy" | null; combinations: number | null;
  road_factor: number | null; speed_kmh: number | null; options: PlanOption[]; cited_team_ids: string[]; cited_feature_ids: string[];
  critical_feature_ids: string[]; teams_source: string; input_sha256: string | null;
}
const minutes = (value: unknown) => { const n = finite(value); return n !== null && n >= 0 && n < 100000 ? Math.round(n * 10) / 10 : null; };
function cleanAssignment(item: unknown): PlanAssignment | null {
  if (!isObject(item) || typeof item.team_id !== "string" || !TEAM_ID.test(item.team_id) || !isUuid(item.staging_feature_id)) return null;
  const kind = (STAGING_KINDS as readonly unknown[]).includes(item.staging_kind) ? item.staging_kind as PlanAssignment["staging_kind"] : null;
  const prep = minutes(item.preposition_minutes), cap = count(item.capacity);
  if (!kind || prep === null || cap === null) return null;
  const covers = Array.isArray(item.covers) ? item.covers.slice(0, 20).flatMap((c): PlanCover[] => {
    const m = isObject(c) ? minutes(c.minutes) : null;
    return isObject(c) && isUuid(c.feature_id) && m !== null ? [{ feature_id: c.feature_id, minutes: m }] : [];
  }) : [];
  return { team_id: item.team_id, team_label: text(item.team_label, 80) ?? item.team_id, capacity: cap, staging_feature_id: item.staging_feature_id, staging_kind: kind, preposition_minutes: prep, covers };
}
/** Plan payload: only ids, counts and synthetic minutes survive. It never carries task or message actions. */
export function cleanPlan(value: unknown): PrepositioningPlan {
  const plan = isObject(value) && isObject(value.plan) ? value.plan : null;
  if (!plan || (plan.status !== "planned" && plan.status !== "abstained")) throw new Error("Invalid plan payload");
  const options = plan.status === "planned" && Array.isArray(plan.options) ? plan.options.slice(0, 3).flatMap((o, index): PlanOption[] => {
    if (!isObject(o)) return [];
    const max = minutes(o.max_minutes), total = minutes(o.total_minutes), prep = minutes(o.max_preposition_minutes), covered = count(o.covered), all = count(o.critical_total);
    if (max === null || total === null || prep === null || covered === null || all === null) return [];
    const assignments = Array.isArray(o.assignments) ? o.assignments.slice(0, 6).map(cleanAssignment).filter((a): a is PlanAssignment => a !== null) : [];
    return [{ rank: index + 1, covered, critical_total: all, max_minutes: max, total_minutes: total, max_preposition_minutes: prep, assignments, uncovered_feature_ids: uuidList(o.uncovered_feature_ids, 20) }];
  }) : [];
  const search = isObject(plan.search) ? plan.search : {};
  const model = isObject(plan.travel_model) ? plan.travel_model : {};
  return {
    status: plan.status, reason: (PLAN_REASONS as readonly unknown[]).includes(plan.reason) ? plan.reason as PlanReason : null, label: PLAN_LABEL,
    search_method: search.method === "exact" || search.method === "greedy" ? search.method : null, combinations: count(search.combinations),
    road_factor: finite(model.road_factor), speed_kmh: finite(model.speed_kmh), options,
    cited_team_ids: Array.isArray(plan.cited_team_ids) ? plan.cited_team_ids.filter((id): id is string => typeof id === "string" && TEAM_ID.test(id)).slice(0, 6) : [],
    cited_feature_ids: uuidList(plan.cited_feature_ids, 40), critical_feature_ids: uuidList(plan.critical_feature_ids, 20),
    teams_source: safeVersion(plan.teams_source), input_sha256: typeof plan.input_sha256 === "string" && /^[0-9a-f]{64}$/.test(plan.input_sha256) ? plan.input_sha256 : null,
  };
}

// ---------- run observability ----------
export type NodeStatus = "done" | "next" | "pending" | "blocked";
export interface ObservabilityNode { step: RunStep; status: NodeStatus; actor_kind: "system" | "human" | null; outcome: string | null; duration_ms: number | null; finished_at: string | null }
export interface ObservabilityEvent { step: string; kind: "start" | "step" | "cancel" | "sentinel_flag" | "other"; started_at: string | null; finished_at: string | null; duration_ms: number | null; wait_ms: number | null; actor_kind: "system" | "human"; outcome: string; budget_used: number; budget_remaining: number }
export interface RunObservability {
  status: RunStatus; origin: "scheduler" | "operator"; step_budget: number; budget_used: number; budget_remaining: number; total_step_ms: number;
  nodes: ObservabilityNode[]; events: ObservabilityEvent[]; sentinel_flags: Record<SentinelFlagName, number>;
  cancellation: { by_kind: "system" | "human"; reason: string } | null; scheduler_ticks: SchedulerTick[] | null;
}
const ms = (value: unknown) => { const n = finite(value); return n !== null && n >= 0 ? Math.round(n) : null; };
const actorKind = (value: unknown): "system" | "human" => value === "system" ? "system" : "human";
const NODE_STATUSES: readonly NodeStatus[] = ["done", "next", "pending", "blocked"];
const EVENT_KINDS = ["start", "step", "cancel", "sentinel_flag", "other"] as const;
/** Step graph for one run. Actor subjects are reduced to system/human; outcomes are fixed codes. */
export function cleanObservability(value: unknown): RunObservability {
  if (!isObject(value) || !Array.isArray(value.nodes) || !Array.isArray(value.events)) throw new Error("Invalid observability payload");
  const nodes = value.nodes.slice(0, RUN_STEPS.length).flatMap((n): ObservabilityNode[] => {
    if (!isObject(n) || !isRunStep(n.step) || !(NODE_STATUSES as readonly unknown[]).includes(n.status)) return [];
    return [{ step: n.step, status: n.status as NodeStatus, actor_kind: n.actor_kind === null || n.actor_kind === undefined ? null : actorKind(n.actor_kind),
      outcome: n.outcome === null || n.outcome === undefined ? null : safeCategory(n.outcome, "other"), duration_ms: ms(n.duration_ms), finished_at: timestamp(n.finished_at) }];
  });
  const events = value.events.slice(0, 200).flatMap((e): ObservabilityEvent[] => {
    if (!isObject(e)) return [];
    const kind = (EVENT_KINDS as readonly unknown[]).includes(e.kind) ? e.kind as ObservabilityEvent["kind"] : "other";
    return [{ step: safeCategory(e.step, "other"), kind, started_at: timestamp(e.started_at), finished_at: timestamp(e.finished_at), duration_ms: ms(e.duration_ms),
      wait_ms: ms(e.wait_ms), actor_kind: actorKind(e.actor_kind), outcome: safeCategory(e.outcome, "other"), budget_used: count(e.budget_used) ?? 0, budget_remaining: count(e.budget_remaining) ?? 0 }];
  });
  const flags = Object.fromEntries(SENTINEL_FLAGS.map(name => [name, isObject(value.sentinel_flags) ? count(value.sentinel_flags[name]) ?? 0 : 0])) as Record<SentinelFlagName, number>;
  const cancellation = isObject(value.cancellation) ? { by_kind: actorKind(value.cancellation.by_kind), reason: text(value.cancellation.reason, 300) ?? "" } : null;
  const ticks = Array.isArray(value.scheduler_ticks) ? value.scheduler_ticks.slice(0, 10).map(cleanTick).filter((t): t is SchedulerTick => t !== null) : null;
  return { status: value.status === "cancelled" ? "cancelled" : value.status === "review_ready" ? "review_ready" : "running",
    origin: value.origin === "scheduler" ? "scheduler" : "operator", step_budget: count(value.step_budget) ?? nodes.length,
    budget_used: count(value.budget_used) ?? 0, budget_remaining: count(value.budget_remaining) ?? 0, total_step_ms: ms(value.total_step_ms) ?? 0,
    nodes, events, sentinel_flags: flags, cancellation, scheduler_ticks: ticks };
}
