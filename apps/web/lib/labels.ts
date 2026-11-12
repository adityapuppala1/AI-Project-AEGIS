// One place that turns machine codes (statuses, reason codes, role ids, hazard ids, connector ids) into plain
// English labels. Pages pass the result through t(). Unknown codes never reach the screen raw: they fall back to a
// neutral sentence-cased reading of the code. The raw code belongs in a title attribute or a "technical details"
// disclosure only. No React or DOM imports, so this file is unit tested directly.

const LABELS: Record<string, string> = {
  // Proposal and task states
  draft: "Draft", submitted: "Awaiting checker", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled",
  pending: "Pending", acknowledged: "Acknowledged", closed: "Closed", open: "Open", overdue: "Overdue", on_time: "On time",
  completed: "Completed", running: "Running", failed: "Failed", queued: "Queued", skipped: "Skipped", ok: "Available",
  disabled: "Not enabled", unavailable: "Unavailable", unknown: "Not known", active: "Active", resolved: "Resolved",
  new: "New", review: "In review", paused: "Paused", not_paused: "Not paused", awaiting_handoff: "Waiting for a person",
  hand_to_human: "Hand to a person", not_comparable: "Not comparable",
  // Roles (the plain words used across the app)
  incident_operator: "Maker", incident_checker: "Checker", incident_auditor: "Auditor", platform_admin: "Administrator",
  department_operator: "Department desk", response_team: "Response team",
  // Response teams: the kind of team and what it can do (docs/RESPONSE_LOOP.md)
  rescue: "Rescue", health: "Health", municipal: "Municipal", flood_rescue: "Flood rescue", search_rescue: "Search and rescue",
  evacuation: "Evacuation", medical: "Medical", fire_response: "Fire response",
  // Departments
  control_room: "Control room", infrastructure: "Infrastructure", communications: "Communications",
  // Hazards and measurements
  heavy_rain: "Heavy rain", river_discharge: "River discharge", river_flood: "River flood", urban_flood: "Urban flooding",
  urban_flooding: "Urban flooding", flood: "Flood", cyclone: "Cyclone", earthquake: "Earthquake", heatwave: "Heatwave",
  heat_wave: "Heatwave", landslide: "Landslide", wildfire: "Wildfire", fire: "Fire", storm: "Storm", storm_surge: "Storm surge",
  thunderstorm: "Thunderstorm", lightning: "Lightning", drought: "Drought", tsunami: "Tsunami", wind: "Strong wind",
  // Data sources and connectors
  open_meteo: "Open-Meteo", nasa_firms: "NASA FIRMS", nasa_eonet: "NASA EONET", nasa_gibs: "NASA GIBS", usgs: "USGS",
  usgs_earthquakes: "USGS earthquakes", imd: "IMD", cwc: "CWC", sachet: "SACHET", local_fixture: "Local exercise fixture",
  aegis_local_only: "Local exercise only", synthetic: "Synthetic", timesfm: "TimesFM 2.5",
  // Dependency diagnostics
  database_query_succeeded: "Database answered", database_unreachable: "Database did not answer", schema_complete: "Database tables are complete",
  schema_incomplete: "Database tables are incomplete", fixtures_present: "Exercise records are present", fixtures_missing: "Exercise records are missing",
  // Learning and drills
  applied_overlay: "Applied threshold overlay", engine_default: "Engine default", no_cases: "No cases to compare yet",
  known_events: "Known events", insufficient_data: "Not enough data",
  // Assist and scheduler reason codes
  proactive_disabled: "Proactive automation is switched off in this deployment", scheduler_disabled: "The scheduler is switched off in this deployment",
  upstream_unavailable: "The service did not answer", not_configured: "Not set up", kill_switch_engaged: "The kill switch is engaged",
  template: "Fixed template", local_model_rephrase_of_cited_facts: "Local model rephrasing of cited facts",
};

// Short tokens that read better in capitals inside a fallback label.
const ACRONYMS = new Set(["api", "cap", "sla", "id", "oidc", "sso", "mfa", "usgs", "nasa", "imd", "cwc", "sms", "url", "db", "utc", "ist", "gis", "ai", "csv", "json", "pdf", "http", "https", "tls", "ndma", "sdma"]);

/** True for strings shaped like a machine code (lower snake/kebab/dotted), which must not be shown as they are. */
export function isMachineCode(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:[_.-][a-z0-9]+)+$/.test(value);
}

/** "database_query_succeeded" -> "Database query succeeded". Acronyms are kept in capitals. */
export function sentenceCase(code: string): string {
  const words = code.replace(/[_.\-\s]+/g, " ").trim().toLowerCase().split(" ").filter(Boolean);
  if (words.length === 0) return "";
  return words.map((word, index) => ACRONYMS.has(word) ? word.toUpperCase() : index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(" ");
}

/** Plain label for a code. Known codes use the table; anything else gets the sentence-cased fallback; empty gives "Not known". */
export function codeLabel(code: string | null | undefined): string {
  if (typeof code !== "string") return LABELS.unknown;
  const key = code.trim();
  if (!key) return LABELS.unknown;
  if (Object.prototype.hasOwnProperty.call(LABELS, key)) return LABELS[key];
  const lower = key.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LABELS, lower)) return LABELS[lower];
  return sentenceCase(key);
}

/** Prose from the API with any machine code inside it read as plain words ("known_events" -> "known events"). File names and paths are left alone. */
export function plainText(text: string): string {
  return text.replace(/(?<![/.\w])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?!\w|\.\w)/g, code => codeLabel(code).toLowerCase());
}

/** Plain words for the data files the API names in its notes. Anything not listed is read as "<words> file". */
export const FILE_LABELS: Record<string, string> = {
  "known_events.csv": "the public catalogue of known events",
  "exercise_scenarios.v1.json": "the exercise scenario list",
};
/**
 * Prose for people: file names and paths become plain words ("research/real-data/catalogue/known_events.csv" ->
 * "the public catalogue of known events"), then machine codes are read as words (plainText). Use this for API notes
 * shown on screen; plainText alone leaves file names untouched.
 */
export function humanText(text: string): string {
  const named = text.replace(/(?:[\w.-]+\/)*([\w-]+(?:\.[\w-]+)*\.(?:csv|json|md|py|ya?ml|txt))\b/g, (_all, base: string) =>
    FILE_LABELS[base] ?? base.replace(/\.[a-z]+$/, "").replace(/\.v\d+$/, "").replace(/[_-]+/g, " ") + " file");
  return plainText(named);
}

// Team response loop (docs/RESPONSE_LOOP.md). Separate tables because the same word can mean different things as a
// state, a report kind or a code (for example "other" for a decline and for a request for support).
export const RESPONSE_STATE_LABELS: Record<string, string> = {
  requested: "Waiting for an answer", accepted: "Accepted", declined: "Declined", en_route: "On the way", on_site: "On site",
  completed: "Completed", stood_down: "Stood down",
};
export const REPORT_KIND_LABELS: Record<string, string> = {
  requested: "Team requested", accepted: "Accepted", declined: "Declined", en_route: "On the way", on_site: "Arrived on site",
  completed: "Completed", situation_report: "Situation report", needs_support: "Asked for support", stood_down: "Stood down by the desk",
  desk_handled: "Desk marked it handled",
};
export const AUTHORITY_LABELS: Record<string, string> = { team: "Team", department_relay: "Desk, on the team's behalf", department: "Desk" };
export const REPORT_CODE_LABELS: Record<string, string> = {
  already_committed: "Already committed elsewhere", out_of_area: "Outside the team's area", not_equipped: "Not equipped for this",
  off_shift: "Off shift", as_expected: "As expected", worse_than_expected: "Worse than expected", better_than_expected: "Better than expected",
  access_blocked: "Access is blocked", nothing_found: "Nothing found", more_people: "More people needed", equipment: "Equipment needed",
  medical: "Medical help needed", transport: "Transport needed",
};
/** "other" reads differently for a decline and for a request for support. */
export const OTHER_CODE_LABELS: Record<string, string> = { declined: "Another reason", needs_support: "Something else" };
/** Button text for the signed team's own actions, and for a desk recording on the team's behalf. */
export const RESPONSE_ACTION_LABELS: Record<string, string> = {
  accepted: "Accept", declined: "Decline", en_route: "I am en route", on_site: "I am on site", completed: "Completed",
  situation_report: "Send situation report", needs_support: "Ask for support",
};
export const RELAY_ACTION_LABELS: Record<string, string> = {
  accepted: "Record: team accepted", declined: "Record: team declined", en_route: "Record: team is en route", on_site: "Record: team is on site",
  completed: "Record: team completed", situation_report: "Record a situation report", needs_support: "Record a request for support",
  stood_down: "Stand the team down", desk_handled: "Mark handled",
};
/** The sentences the browser shows for a failed team-response call when the server gave none (lib/response-client.ts). Reviewed English; shown through t(). */
export const RESPONSE_FAILURE_TEXTS = {
  signedOut: "Your session ended. Sign in again.",
  forbidden: "Your role cannot do this.",
  changed: "This request changed. The list has been refreshed.",
  invalid: "Check the note (10 to 1000 characters) and the choice, then try again.",
  unavailable: "The team response service did not answer. Refresh before retrying; the action may have completed.",
  unconfirmed: "The action could not be confirmed. Refresh before retrying; it may have completed.",
} as const;
const pick = (table: Record<string, string>, key: string | null | undefined): string | null =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
export const responseStateLabel = (state: string | null | undefined): string => pick(RESPONSE_STATE_LABELS, state) ?? codeLabel(state);
export const reportKindLabel = (kind: string | null | undefined): string => pick(REPORT_KIND_LABELS, kind) ?? codeLabel(kind);
export const authorityLabel = (authority: string | null | undefined): string => pick(AUTHORITY_LABELS, authority) ?? codeLabel(authority);
/** Plain label for a report code; `kind` decides what "other" means. An unknown code is read as plain words, never shown raw. */
export function reportCodeLabel(kind: string | null | undefined, code: string | null | undefined): string {
  if (code === "other") return pick(OTHER_CODE_LABELS, kind) ?? "Something else";
  return pick(REPORT_CODE_LABELS, code) ?? codeLabel(code);
}
const RESPONSE_TEXTS: string[] = [RESPONSE_FAILURE_TEXTS, RESPONSE_STATE_LABELS, REPORT_KIND_LABELS, AUTHORITY_LABELS, REPORT_CODE_LABELS, OTHER_CODE_LABELS, RESPONSE_ACTION_LABELS, RELAY_ACTION_LABELS].flatMap(table => Object.values(table));

/** True when the code has a reviewed label (rather than the generic fallback). */
export const hasLabel = (code: string): boolean => Object.prototype.hasOwnProperty.call(LABELS, code);
export const KNOWN_LABEL_CODES: readonly string[] = Object.keys(LABELS);
export const KNOWN_LABEL_TEXTS: readonly string[] = [...new Set([...Object.values(LABELS), ...RESPONSE_TEXTS])];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);
/** "3f2a9c1e-…-91ab" style short form for a record id; non-UUID text is returned unchanged. */
export function shortId(value: string): string {
  return UUID.test(value) ? value.slice(0, 8) + "…" + value.slice(-4) : value;
}

/** Initials for an avatar: up to two letters from a display name or username; "?" when nothing usable is given. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").replace(/[^\p{L}\p{N}\s._-]/gu, " ").split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0].charAt(0) + words[words.length - 1].charAt(0);
  return letters.toUpperCase();
}

/** "1 h 12 min", "8 min", "under a minute" for a remaining duration in milliseconds; null when it has passed. */
export function timeLeft(ms: number): { hours: number; minutes: number } | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
