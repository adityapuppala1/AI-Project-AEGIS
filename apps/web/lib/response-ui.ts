// Display rules for the team response loop (docs/RESPONSE_LOOP.md). A READ-ONLY DESCRIPTION for the interface: which
// action a person is offered next, which closed code a form shows and how a request answer is checked before use.
// The API stays the control; scripts/tests/response-ui.test.cjs compares these lists with lib/response-proxy.ts.
// No React or DOM imports, so it is unit tested directly.

export const RESPONSE_STATES = ["requested", "accepted", "declined", "en_route", "on_site", "completed", "stood_down"] as const;
export type ResponseState = (typeof RESPONSE_STATES)[number];
export const ACTIVE_STATES: readonly string[] = ["requested", "accepted", "en_route", "on_site"];
export const FINISHED_STATES: readonly string[] = ["declined", "completed", "stood_down"];
/** The happy path, in order, for the stepper. */
export const PROGRESS_STEPS = ["requested", "accepted", "en_route", "on_site", "completed"] as const;

export const REPORT_KINDS = ["requested", "accepted", "declined", "en_route", "on_site", "completed", "situation_report", "needs_support", "stood_down", "desk_handled"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const AUTHORITIES = ["team", "department_relay", "department"] as const;

const SITUATION = ["as_expected", "worse_than_expected", "better_than_expected", "access_blocked", "nothing_found"] as const;
/** The closed code list for each kind that needs one; kinds not listed take no code. */
export const KIND_CODES: Record<string, readonly string[]> = {
  declined: ["already_committed", "out_of_area", "not_equipped", "off_shift", "other"],
  on_site: SITUATION, completed: SITUATION, situation_report: SITUATION,
  needs_support: ["more_people", "equipment", "medical", "transport", "other"],
};
export const ALL_CODES: readonly string[] = [...new Set(Object.values(KIND_CODES).flat())];

/** The one forward step from each state. */
export const NEXT_KIND: Record<string, string | undefined> = { requested: "accepted", accepted: "en_route", en_route: "on_site", on_site: "completed" };
const TEAM_EXTRA: Record<string, readonly string[]> = { requested: ["declined"], accepted: ["situation_report", "needs_support"], en_route: ["situation_report", "needs_support"], on_site: ["situation_report", "needs_support"] };

/** Kinds the signed team may record from a state (the main step first). */
export function teamKinds(state: string): string[] {
  const next = NEXT_KIND[state];
  return next ? [next, ...(TEAM_EXTRA[state] ?? [])] : [];
}
/** Kinds a desk may record from a state: everything a team can, plus stand down, plus "handled" while flagged. */
export function deskKinds(state: string, needsAttention: boolean): string[] {
  const kinds = teamKinds(state);
  if (ACTIVE_STATES.includes(state)) kinds.push("stood_down");
  if (needsAttention) kinds.push("desk_handled");
  return kinds;
}

export const NOTE_MIN = 10, NOTE_MAX = 1000;
export type NoteProblem = "short" | "long" | "characters";
/** Same rule as the proxy and the API: 10 to 1000 characters after trimming, no control, format or line-separator characters. */
export function noteProblem(note: string): NoteProblem | null {
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(note)) return "characters";
  const length = note.trim().length;
  return length < NOTE_MIN ? "short" : length > NOTE_MAX ? "long" : null;
}

export interface ResponseReport { kind: string; occurred_at: string; authority: string; code: string | null; note: string; mine: boolean }
export interface ResponseRequest {
  id: string; proposal_id?: string; incident: { id: string; hazard_label: string }; task: { id: string; summary: string; department: string };
  team: { id: string; label: string; kind: string }; state: string; version: number; needs_attention: boolean;
  requested_at: string; updated_at: string; reports: ResponseReport[];
}

const isText = (value: unknown): value is string => typeof value === "string";
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function cleanReport(value: unknown): ResponseReport | null {
  if (!isObject(value) || !isText(value.kind) || !isText(value.occurred_at) || !isText(value.authority)) return null;
  return { kind: value.kind, occurred_at: value.occurred_at, authority: value.authority, code: isText(value.code) ? value.code : null, note: isText(value.note) ? value.note : "", mine: value.mine === true };
}
/** One request from an API answer, or null when it does not have the expected shape. Nothing unknown is carried through. */
export function cleanRequest(value: unknown): ResponseRequest | null {
  if (!isObject(value) || !isText(value.id) || !isText(value.state) || !Number.isSafeInteger(value.version)) return null;
  const { incident, task, team } = value;
  if (!isObject(incident) || !isText(incident.id) || !isObject(task) || !isText(task.id) || !isObject(team) || !isText(team.id)) return null;
  return {
    id: value.id, ...(isText(value.proposal_id) ? { proposal_id: value.proposal_id } : {}),
    incident: { id: incident.id, hazard_label: isText(incident.hazard_label) ? incident.hazard_label : "" },
    task: { id: task.id, summary: isText(task.summary) ? task.summary : "", department: isText(task.department) ? task.department : task.id },
    team: { id: team.id, label: isText(team.label) ? team.label : team.id, kind: isText(team.kind) ? team.kind : "" },
    state: value.state, version: value.version as number, needs_attention: value.needs_attention === true,
    requested_at: isText(value.requested_at) ? value.requested_at : "", updated_at: isText(value.updated_at) ? value.updated_at : "",
    reports: Array.isArray(value.reports) ? value.reports.map(cleanReport).filter((item): item is ResponseReport => item !== null) : [],
  };
}
export function cleanRequests(value: unknown): ResponseRequest[] | null {
  if (!isObject(value) || !Array.isArray(value.requests)) return null;
  return value.requests.map(cleanRequest).filter((item): item is ResponseRequest => item !== null);
}

const time = (iso: string) => { const ms = Date.parse(iso); return Number.isNaN(ms) ? 0 : ms; };
/** Requests for a team page: those needing an answer, then active ones, then finished ones. Newest first within each group. */
export function groupForTeam(requests: readonly ResponseRequest[]) {
  const newest = (a: ResponseRequest, b: ResponseRequest) => time(b.updated_at) - time(a.updated_at);
  return {
    answer: requests.filter(item => item.state === "requested").sort(newest),
    active: requests.filter(item => ["accepted", "en_route", "on_site"].includes(item.state)).sort(newest),
    finished: requests.filter(item => FINISHED_STATES.includes(item.state)).sort(newest),
  };
}
export const lastReport = (request: ResponseRequest): ResponseReport | null => request.reports.length > 0 ? request.reports[request.reports.length - 1] : null;

/** "12 Nov, 14:05 IST" for a timestamp; a plain dash when it cannot be read. */
export function istText(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return "—";
  const date = new Date(ms);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(date);
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${day}, ${clock} IST`;
}
export function istClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export type AlertView = "team" | "desk";
/** Which roles get the menu count. Mirrors the server (administrators and tokens holding both roles get nothing). */
export function alertView(roles: readonly string[] | null | undefined): AlertView | null {
  const held = roles ?? [];
  if (held.includes("platform_admin")) return null;
  const team = held.includes("response_team"), desk = held.includes("department_operator");
  if (team === desk) return null;
  return team ? "team" : "desk";
}
/** Roles that may read requests (the same set as the proxy), for panels that must not show an error to other roles. */
export const canReadRequests = (roles: readonly string[] | null | undefined): boolean => {
  const held = roles ?? [];
  if (held.includes("platform_admin")) return false;
  const team = held.includes("response_team"), desk = held.includes("department_operator");
  if (team && desk) return false;
  return team || desk || ["incident_operator", "incident_checker", "incident_auditor"].some(role => held.includes(role));
};

export interface SuggestedTeam {
  id: string; label: string; kind: string; capabilities: string[]; matched_capabilities: string[]; capacity: number; active_requests: number;
  free_capacity: number; available_now: boolean; available_utc: string; estimated_travel_minutes: number | null; suggested: boolean;
}
export interface TeamSuggestions { capability_basis: "assessed" | "not_assessed"; hazard_label: string; travel_label: string; teams: SuggestedTeam[] }
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(isText) : [];
export function cleanSuggestions(value: unknown): TeamSuggestions | null {
  if (!isObject(value) || !Array.isArray(value.teams)) return null;
  const teams: SuggestedTeam[] = [];
  for (const item of value.teams) {
    if (!isObject(item) || !isText(item.id)) continue;
    teams.push({
      id: item.id, label: isText(item.label) ? item.label : item.id, kind: isText(item.kind) ? item.kind : "", capabilities: strings(item.capabilities),
      matched_capabilities: strings(item.matched_capabilities), capacity: Number.isFinite(item.capacity) ? item.capacity as number : 0,
      active_requests: Number.isFinite(item.active_requests) ? item.active_requests as number : 0, free_capacity: Number.isFinite(item.free_capacity) ? item.free_capacity as number : 0,
      available_now: item.available_now === true, available_utc: isText(item.available_utc) ? item.available_utc : "",
      estimated_travel_minutes: typeof item.estimated_travel_minutes === "number" && Number.isFinite(item.estimated_travel_minutes) ? item.estimated_travel_minutes : null,
      suggested: item.suggested === true,
    });
  }
  return { capability_basis: value.capability_basis === "assessed" ? "assessed" : "not_assessed", hazard_label: isText(value.hazard_label) ? value.hazard_label : "",
    travel_label: isText(value.travel_label) ? value.travel_label : "", teams };
}
export type BlockReason = "taken" | "full" | "hours" | "capability";
/** Why a team cannot be requested right now (the components turn this into a sentence), or null when it can. */
export function whyNotRequestable(team: SuggestedTeam, basis: "assessed" | "not_assessed", taken: boolean): BlockReason | null {
  if (taken) return "taken";
  if (team.free_capacity <= 0) return "full";
  if (!team.available_now) return "hours";
  if (basis === "assessed" && team.matched_capabilities.length === 0) return "capability";
  return null;
}
