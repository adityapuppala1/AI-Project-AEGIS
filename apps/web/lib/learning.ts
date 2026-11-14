/** Validation for A8 post-event learning and A9 exercise drills (BFF requests and API responses).
 * Requests are rebuilt from allowlisted fields only; responses are re-validated (UUIDs, closed codes, finite
 * numbers, bounded text). Nothing here can apply a threshold or send anything: those decisions stay server-side.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[a-z][a-z0-9_.:-]{0,119}$/i;
const SCENARIO = /^[a-z0-9_.-]{1,80}$/;
const HAZARD = /^[a-z][a-z_]{1,39}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/;

export const DRILL_ACTIONS = ["acknowledge_watch", "take_handoff", "submit", "approve"] as const;
export type DrillAction = (typeof DRILL_ACTIONS)[number];
export const PROPOSAL_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const BASES = ["synthetic_rehearsal", "known_events_unreviewed", "registered_protocol_labels"] as const;
export type Basis = (typeof BASES)[number];
export const SLA_STATUSES = ["within_synthetic_target", "synthetic_target_elapsed", "not_taken", "not_applicable"] as const;

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const text = (value: unknown, max = 300): string => (typeof value === "string" ? value : "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const code = (value: unknown): string | null => typeof value === "string" && CODE.test(value) ? value : null;
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const int = (value: unknown): number | null => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
const day = (value: unknown): string | null => typeof value === "string" && DAY.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
const iso = (value: unknown): string | null => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
const oneOf = <T extends string>(value: unknown, options: readonly T[]): T | null => options.includes(value as T) ? value as T : null;
const list = (value: unknown, max = 50): unknown[] => Array.isArray(value) ? value.slice(0, max) : [];
const ref = (value: unknown): string | null => isUuid(value) ? value : (typeof value === "string" && /^known_events:\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

// --- requests ------------------------------------------------------------------------------------

export type Built = { path: string; method: "GET" | "POST"; body?: string };
export type Rejection = { error: string };

const only = (data: Record<string, unknown>, keys: string[]) => Object.keys(data).every(key => keys.includes(key));
export const validRationale = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 10 && trimmed.length <= 2000 && !CONTROL.test(trimmed.replace(/[\n\r\t]/g, " ")) ? trimmed : null;
};

/** Learning routes: segments after /api/learning. Returns the upstream request or a rejection. */
export function buildLearning(method: string, segments: string[], data: Record<string, unknown> | null): Built | Rejection {
  const base = "/v1/proactive/learning";
  const [first, second, third, ...rest] = segments;
  if (rest.length) return { error: "Unknown learning route" };
  if (method === "GET") {
    if (first === "windows" && second === undefined) return { path: `${base}/windows`, method: "GET" };
    if (first === "windows" && isUuid(second) && third === undefined) return { path: `${base}/windows/${second}`, method: "GET" };
    if (first === "proposals" && second === undefined) return { path: `${base}/proposals`, method: "GET" };
    if (first === "proposals" && isUuid(second) && third === undefined) return { path: `${base}/proposals/${second}`, method: "GET" };
    if ((first === "config" || first === "scenarios") && second === undefined) return { path: `${base}/${first}`, method: "GET" };
    return { error: "Unknown learning route" };
  }
  if (method !== "POST" || !data) return { error: "Unknown learning route" };
  if (first === "windows" && second === "close" && third === undefined) {
    if (!only(data, ["hazard", "window_start", "window_end", "observed_event_days"])) return { error: "Unexpected window attributes" };
    const days = data.observed_event_days ?? [];
    if (typeof data.hazard !== "string" || !HAZARD.test(data.hazard) || !day(data.window_start) || !day(data.window_end)) return { error: "Hazard and ISO dates required" };
    if (!Array.isArray(days) || days.length > 100 || days.some(d => !day(d))) return { error: "Observed event days must be up to 100 ISO dates" };
    return { path: `${base}/windows/close`, method: "POST", body: JSON.stringify({ hazard: data.hazard, window_start: data.window_start, window_end: data.window_end, observed_event_days: days }) };
  }
  if (first === "windows" && second === "replay" && third === undefined) {
    if (!only(data, ["source", "scenario_id", "window_start", "window_end"])) return { error: "Unexpected replay attributes" };
    if (data.source === "synthetic") {
      if (typeof data.scenario_id !== "string" || !SCENARIO.test(data.scenario_id) || data.window_start !== undefined || data.window_end !== undefined) return { error: "A scenario is required" };
      return { path: `${base}/windows/replay`, method: "POST", body: JSON.stringify({ source: "synthetic", scenario_id: data.scenario_id }) };
    }
    if (data.source === "known_events") {
      if (data.scenario_id !== undefined || !day(data.window_start) || !day(data.window_end)) return { error: "ISO window dates are required" };
      return { path: `${base}/windows/replay`, method: "POST", body: JSON.stringify({ source: "known_events", window_start: data.window_start, window_end: data.window_end }) };
    }
    return { error: "Unknown replay source" };
  }
  if (first === "proposals" && second === undefined) {
    if (!only(data, ["window_id"]) || !isUuid(data.window_id)) return { error: "Valid window required" };
    return { path: `${base}/proposals`, method: "POST", body: JSON.stringify({ window_id: data.window_id }) };
  }
  if (first === "proposals" && isUuid(second)) {
    if (third === "submit") {
      if (Object.keys(data).length) return { error: "Submit takes no attributes" };
      return { path: `${base}/proposals/${second}/submit`, method: "POST", body: "{}" };
    }
    if (third === "review") {
      if (!only(data, ["approve", "rationale"]) || typeof data.approve !== "boolean") return { error: "Approve must be true or false" };
      const rationale = validRationale(data.rationale);
      if (!rationale) return { error: "A rationale of 10-2000 characters is required" };
      return { path: `${base}/proposals/${second}/review`, method: "POST", body: JSON.stringify({ approve: data.approve, rationale }) };
    }
    if (third === "apply") {
      const rationale = only(data, ["rationale"]) ? validRationale(data.rationale) : null;
      if (!rationale) return { error: "A rationale of 10-2000 characters is required" };
      return { path: `${base}/proposals/${second}/apply`, method: "POST", body: JSON.stringify({ rationale }) };
    }
  }
  return { error: "Unknown learning route" };
}

/** Drill routes: segments after /api/drills. */
export function buildDrills(method: string, segments: string[], data: Record<string, unknown> | null): Built | Rejection {
  const base = "/v1/proactive/drills";
  const [first, second, ...rest] = segments;
  if (rest.length) return { error: "Unknown drill route" };
  if (method === "GET") {
    if (first === undefined) return { path: base, method: "GET" };
    if (first === "scenarios" && second === undefined) return { path: `${base}/scenarios`, method: "GET" };
    if (isUuid(first) && second === undefined) return { path: `${base}/${first}`, method: "GET" };
    if (isUuid(first) && second === "report") return { path: `${base}/${first}/report`, method: "GET" };
    return { error: "Unknown drill route" };
  }
  if (method !== "POST" || !data) return { error: "Unknown drill route" };
  if (first === undefined) {
    if (!only(data, ["scenario_id"]) || typeof data.scenario_id !== "string" || !SCENARIO.test(data.scenario_id)) return { error: "A scenario is required" };
    return { path: base, method: "POST", body: JSON.stringify({ scenario_id: data.scenario_id }) };
  }
  if (isUuid(first) && second === "clock") {
    if (!only(data, ["expected_minute", "minutes"]) || int(data.expected_minute) === null || int(data.minutes) === null
      || (data.minutes as number) < 1 || (data.minutes as number) > 240) return { error: "Expected minute and 1-240 minutes required" };
    return { path: `${base}/${first}/clock`, method: "POST", body: JSON.stringify({ expected_minute: data.expected_minute, minutes: data.minutes }) };
  }
  if (isUuid(first) && second === "respond") {
    if (!only(data, ["action"]) || !oneOf(data.action, DRILL_ACTIONS)) return { error: "Unknown drill action" };
    return { path: `${base}/${first}/respond`, method: "POST", body: JSON.stringify({ action: data.action }) };
  }
  return { error: "Unknown drill route" };
}

// --- responses -----------------------------------------------------------------------------------

export interface Rate { k: number; n: number; estimate: number | null; ci95: [number, number] | null; ci_reason: string | null }
export interface RuleStats {
  rule_id: string; events: number; hits: number; misses: number; false_alarm_episodes: number;
  probability_of_detection: Rate; false_alarm_ratio: Rate;
  lead_time_days: { n: number; min: number | null; median: number | null; max: number | null }; cited_ids: string[];
}
export interface LearningWindow {
  id: string; hazard: string; window_start: string; window_end: string; source: string; basis: Basis; basis_note: string;
  config_version: string; observed_events: string[]; closed_by: string; closed_at: string | null; rules: RuleStats[]; event_refs: string[];
  accuracy_claim: false;
}
export interface Change { path: string; old: number; new: number }
export interface Proposal {
  id: string; window_id: string; base_version: string; new_version: string; status: ProposalStatus; changes: Change[];
  decisions: { rule_id: string; decision: string }[]; maker_subject: string; checker_subject: string | null;
  decision_rationale: string | null; applied_version: string | null; applied_by: string | null; applied_at: string | null;
  audit: { action: string; actor: string; at: string | null }[]; accuracy_claim: false;
}

function cleanRate(value: unknown): Rate {
  const v = isObject(value) ? value : {};
  const ci = Array.isArray(v.ci95) && v.ci95.length === 2 && v.ci95.every(x => num(x) !== null && (x as number) >= 0 && (x as number) <= 1)
    ? [v.ci95[0] as number, v.ci95[1] as number] as [number, number] : null;
  const estimate = num(v.estimate);
  return { k: int(v.k) ?? 0, n: int(v.n) ?? 0, estimate: estimate !== null && estimate >= 0 && estimate <= 1 ? estimate : null, ci95: ci, ci_reason: code(v.ci_reason) };
}

function cleanRule(value: unknown): RuleStats | null {
  if (!isObject(value) || typeof value.rule_id !== "string" || !/^[a-z_]+:(watch|candidate)$/.test(value.rule_id)) return null;
  const lead = isObject(value.lead_time_days) ? value.lead_time_days : {};
  return { rule_id: value.rule_id, events: int(value.events) ?? 0, hits: int(value.hits) ?? 0, misses: int(value.misses) ?? 0,
    false_alarm_episodes: int(value.false_alarm_episodes) ?? 0, probability_of_detection: cleanRate(value.probability_of_detection),
    false_alarm_ratio: cleanRate(value.false_alarm_ratio),
    lead_time_days: { n: int(lead.n) ?? 0, min: num(lead.min), median: num(lead.median), max: num(lead.max) },
    cited_ids: list(value.cited_ids).filter(isUuid) };
}

/** Idempotent: the BFF cleans once and the browser cleans again, so output must re-pass its own guard. A raw window nests its
 * statistics under `stats`; a cleaned one carries them at the top level, still with an explicit accuracy_claim: false. */
export function cleanWindow(value: unknown): LearningWindow | null {
  if (!isObject(value) || !isUuid(value.id)) return null;
  const stats = isObject(value.stats) ? value.stats : value;
  const basis = oneOf(value.basis, BASES);
  if (!basis || stats.accuracy_claim !== false) return null;
  return { id: value.id, hazard: code(value.hazard) ?? "unknown", window_start: day(value.window_start) ?? "", window_end: day(value.window_end) ?? "",
    source: code(value.source) ?? "unknown", basis, basis_note: text(stats.basis_note, 300), config_version: code(value.config_version) ?? "unknown",
    observed_events: list(value.observed_events, 100).map(day).filter((d): d is string => d !== null),
    closed_by: text(value.closed_by, 120), closed_at: iso(value.closed_at),
    rules: list(stats.rules, 4).map(cleanRule).filter((r): r is RuleStats => r !== null),
    event_refs: list(stats.event_refs).map(ref).filter((r): r is string => r !== null), accuracy_claim: false };
}

/** Idempotent like cleanWindow: a raw proposal nests `diff` and `rationale`; a cleaned one is flat with accuracy_claim: false. */
export function cleanProposal(value: unknown): Proposal | null {
  if (!isObject(value) || !isUuid(value.id) || !isUuid(value.window_id)) return null;
  const status = oneOf(value.status, PROPOSAL_STATUSES);
  const raw = isObject(value.rationale);
  const diff = isObject(value.diff) ? value.diff : raw ? {} : value;
  const rationale = raw ? value.rationale as Record<string, unknown> : value;
  if (!status || rationale.accuracy_claim !== false) return null;
  const changes = list(diff.changes, 20).filter(isObject).map(c => ({ path: text(c.path, 80), old: num(c.old), new: num(c.new) }))
    .filter((c): c is Change => /^hazards\.[a-z_]+\.(watch|candidate)$/.test(c.path) && c.old !== null && c.new !== null);
  return { id: value.id, window_id: value.window_id, base_version: code(value.base_version) ?? "unknown", new_version: code(value.new_version) ?? "unknown",
    status, changes, decisions: list(raw ? rationale.rules : value.decisions, 4).filter(isObject).map(r => ({ rule_id: text(r.rule_id, 60), decision: code(r.decision) ?? "unknown" })),
    maker_subject: text(value.maker_subject, 120), checker_subject: typeof value.checker_subject === "string" ? text(value.checker_subject, 120) : null,
    decision_rationale: typeof value.decision_rationale === "string" ? text(value.decision_rationale, 2000) : null,
    applied_version: code(value.applied_version), applied_by: typeof value.applied_by === "string" ? text(value.applied_by, 120) : null,
    applied_at: iso(value.applied_at),
    audit: list(value.audit, 50).filter(isObject).map(a => ({ action: code(a.action) ?? "unknown", actor: text(a.actor, 120), at: iso(a.at) })), accuracy_claim: false };
}

export interface ConfigView { effective_version: string; config_source: string; fixture_version: string; thresholds: Record<string, { watch: number; candidate: number }>; versions: { version_id: string; proposal_id: string | null; applied_by: string; applied_at: string | null }[] }
export function cleanConfig(value: unknown): ConfigView | null {
  if (!isObject(value) || !code(value.effective_version)) return null;
  const thresholds: ConfigView["thresholds"] = {};
  if (isObject(value.thresholds)) for (const [name, spec] of Object.entries(value.thresholds).slice(0, 20)) {
    if (HAZARD.test(name) && isObject(spec) && num(spec.watch) !== null && num(spec.candidate) !== null) thresholds[name] = { watch: spec.watch as number, candidate: spec.candidate as number };
  }
  return { effective_version: value.effective_version as string, config_source: code(value.config_source) ?? "unknown", fixture_version: code(value.fixture_version) ?? "unknown", thresholds,
    versions: list(value.versions, 20).filter(isObject).map(v => ({ version_id: code(v.version_id) ?? "unknown", proposal_id: isUuid(v.proposal_id) ? v.proposal_id : null, applied_by: text(v.applied_by, 120), applied_at: iso(v.applied_at) })) };
}

export interface Scenario { id: string; title: string; source: string; event_ref: string | null; hazard: string; end_minute: number | null }
export function cleanScenarios(value: unknown): { scenarios: Scenario[]; note: string } | null {
  if (!isObject(value)) return null;
  return { note: text(value.note, 600), scenarios: list(value.scenarios, 30).filter(isObject).filter(s => typeof s.id === "string" && SCENARIO.test(s.id))
    .map(s => ({ id: s.id as string, title: text(s.title, 120), source: code(s.source) ?? "unknown", event_ref: ref(s.event_ref), hazard: code(s.hazard) ?? "unknown", end_minute: int(s.end_minute) })) };
}

export interface Drill {
  id: string; scenario_id: string; title: string; event_ref: string | null; hazard: string; sim_minute: number; end_minute: number;
  status: "running" | "completed"; trigger_state: "clear" | "watch" | "candidate"; first_watch_minute: number | null; first_candidate_minute: number | null;
  actions: Partial<Record<DrillAction, { minute: number; actor: string }>>; injected: { evidence_id: string; minute: number; value: number; trigger_state: string }[];
  exercise: true; operational_actions_enabled: false; notifications_sent: false;
}
/** Idempotent: the cleaned drill keeps the exercise-only markers so the browser's second pass accepts it. */
export function cleanDrill(value: unknown): Drill | null {
  if (!isObject(value) || !isUuid(value.id) || value.exercise !== true || value.operational_actions_enabled !== false || value.notifications_sent !== false) return null;
  const status = oneOf(value.status, ["running", "completed"] as const);
  const state = oneOf(value.trigger_state, ["clear", "watch", "candidate"] as const);
  const sim = int(value.sim_minute), end = int(value.end_minute);
  if (!status || !state || sim === null || end === null || typeof value.scenario_id !== "string" || !SCENARIO.test(value.scenario_id)) return null;
  const actions: Drill["actions"] = {};
  if (isObject(value.actions)) for (const action of DRILL_ACTIONS) {
    const entry = value.actions[action];
    if (isObject(entry) && int(entry.minute) !== null) actions[action] = { minute: entry.minute as number, actor: text(entry.actor, 120) };
  }
  return { id: value.id, scenario_id: value.scenario_id, title: text(value.title, 120), event_ref: ref(value.event_ref), hazard: code(value.hazard) ?? "unknown",
    sim_minute: sim, end_minute: end, status, trigger_state: state, first_watch_minute: int(value.first_watch_minute), first_candidate_minute: int(value.first_candidate_minute), actions,
    injected: list(value.injected, 50).filter(isObject).filter(i => isUuid(i.evidence_id) && int(i.minute) !== null && num(i.value) !== null)
      .map(i => ({ evidence_id: i.evidence_id as string, minute: i.minute as number, value: i.value as number, trigger_state: code(i.trigger_state) ?? "clear" })),
    exercise: true, operational_actions_enabled: false, notifications_sent: false };
}

export interface DrillReport { drill_id: string; status: string; sim_minute: number; note: string; cited_event_ids: string[];
  exercise: true; operational_actions_enabled: false;
  actions: { action: DrillAction; target_minutes: number; anchor_minute: number | null; response_minute: number | null; elapsed_minutes: number | null; status: (typeof SLA_STATUSES)[number]; coach_note: string }[] }
export function cleanReport(value: unknown): DrillReport | null {
  if (!isObject(value) || !isUuid(value.drill_id) || value.exercise !== true || value.operational_actions_enabled !== false) return null;
  const actions = list(value.actions, 4).filter(isObject).map(a => ({ action: oneOf(a.action, DRILL_ACTIONS), target_minutes: int(a.target_minutes),
    anchor_minute: int(a.anchor_minute), response_minute: int(a.response_minute), elapsed_minutes: num(a.elapsed_minutes), status: oneOf(a.status, SLA_STATUSES), coach_note: text(a.coach_note, 300) }))
    .filter((a): a is DrillReport["actions"][number] => a.action !== null && a.target_minutes !== null && a.status !== null);
  return { drill_id: value.drill_id, status: code(value.status) ?? "unknown", sim_minute: int(value.sim_minute) ?? 0, note: text(value.note, 400),
    cited_event_ids: list(value.cited_event_ids).map(ref).filter((r): r is string => r !== null), actions,
    exercise: true, operational_actions_enabled: false };
}

export const pctLabel = (rate: Rate): string => rate.estimate === null ? "n/a"
  : `${Math.round(rate.estimate * 100)}%` + (rate.ci95 ? ` (95% CI ${Math.round(rate.ci95[0] * 100)}-${Math.round(rate.ci95[1] * 100)}%)` : "");
export const simClock = (minute: number): string => `T+${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Client request helper shared by the learning and drill pages: sends, checks the status, then validates the reply. */
export async function call<T>(url: string, clean: (value: unknown) => T | null, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const info = data as { error?: string; code?: string } | null;
    // The fixed code travels on the error so the page can show a plain sentence (lib/labels.ts apiFailureText); it is never shown raw.
    throw Object.assign(new Error(info?.error || "Request failed"), { code: info?.code });
  }
  const cleaned = clean(data);
  if (!cleaned) throw new Error("Invalid response");
  return cleaned;
}
