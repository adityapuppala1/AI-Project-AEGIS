/** Proactive multi-hazard types, pure helpers and defensive payload cleaners.
 * Shared by the BFF (server) and the Hazard Watch / Connectors pages (client).
 * Everything here is display-only decision support: no send path, no accuracy claim.
 */
export type TriggerState = "clear" | "watch" | "candidate";
export type DecisionBand = "recommended" | "needs_review" | "blocked";
export type RunStatus = "running" | "review_ready" | "cancelled";
export type Scalar = string | number | boolean | null;
export type Bag = Record<string, Scalar | Scalar[]>;

export const CONNECTOR_IDS = ["open_meteo", "nasa_firms", "nasa_lhasa", "copernicus_cdse", "imd_warnings", "typesafe_jev", "cap_handover", "authority_notification"] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];
export const RUN_STEPS = ["gather_evidence", "simulate_variants", "judge", "draft_cap", "hand_to_human"] as const;
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
export interface TriggerEvent {
  id: string; trigger_id: string; hazard: string; state: TriggerState; fired_at: string | null;
  lat: number; lon: number; score: number; threshold: Scalar | Bag | null; evidence_ids: string[]; rationale: Bag;
}
export interface WatchPayload {
  generated_at: string | null; config_version: string; disclaimer: string;
  evidence: EvidenceRecord[]; triggers: TriggerEvent[];
}
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
export interface ProactiveRun {
  id: string; status: RunStatus; trigger_event_id: string; evidence_ids: string[]; variants: Variant[];
  judgment: Judgment | null; cap: { sha256: string; generated_at: string | null } | null;
  completed_steps: RunStep[]; next_step: RunStep | null;
}

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
  flood_extent: { label: "Flood extent", color: "#0284c7", icon: "satellite" },
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
      fired_at: timestamp(item.fired_at), lat, lon, score: Math.max(0, Math.min(1, score)), threshold, evidence_ids: uuidList(item.evidence_ids), rationale: cleanBag(item.rationale) }];
  });
  return { generated_at: timestamp(value.generated_at), config_version: text(value.config_version, 60) ?? "unknown",
    disclaimer: text(value.disclaimer, 400) ?? DISCLAIMER, evidence, triggers };
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
  const completed = Array.isArray(value.completed_steps) ? value.completed_steps.filter(isRunStep) : [];
  return { id: value.id, status, trigger_event_id: value.trigger_event_id, evidence_ids: uuidList(value.evidence_ids), variants,
    judgment: cleanJudgment(value.judgment), cap, completed_steps: completed, next_step: isRunStep(value.next_step) ? value.next_step : null };
}
