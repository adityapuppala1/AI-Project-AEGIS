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
  // Connector test results (services/api/app/connectors.py `_result` messages; shown on /admin/connectors)
  reachable: "The service answered", upstream_status: "The service answered with an error",
  secret_missing: "The key for this connector has not been entered", network_error: "Could not reach the service",
  exporter_valid_exercise_only: "Exercise alert file checked; nothing is ever sent", connector_key_missing: "The server's connector vault key is not set",
  connector_secret_unreadable: "The stored key could not be read; enter it again", invalid_response: "The service sent an answer IndTrana could not read",
  no_send_path: "This connector cannot send anything, by design", terms_not_accepted: "The source's terms have not been confirmed",
  credentials_accepted_nothing_sent: "The provider accepted the credentials; no message was sent", credentials_rejected: "The provider refused the credentials",
  key_lacks_mail_send: "The key is valid but lacks the Mail Send permission", setting_missing: "A required setting is empty or not valid", built_in_no_transport: "Built in; nothing leaves this server",
  test_failed: "The test did not pass", timeout: "The service took too long to answer", token_request_failed: "The service refused the sign-in for its key",
  // Staff email notices (services/api/app/staff_messages.py reason codes and states; docs/COMMUNICATION_CHANNELS.md)
  host_switch_off: "Email notices are switched off on this server", channel_unavailable: "The email channel setting could not be read",
  channel_disabled: "The email channel is switched off", no_consent: "This person has not turned on email notices",
  agency_mismatch: "The person belongs to another agency", recipient_cap: "Hourly limit for this person reached",
  agency_cap: "Daily limit for this agency reached", provider_rejected: "The email provider refused the key",
  provider_status: "The email provider answered with an error", send_failed: "The email could not be sent",
  store_unavailable: "The message log could not be written", verified_email_required: "Your sign-in account has no verified email address", undeliverable_address: "Your sign-in address uses a reserved test domain that cannot receive email",
  test_notice: "Test notice", approval_waiting: "Proposal waiting for review",
  sent: "Sent", suppressed: "Not sent (blocked by a rule)",
  stale_contact: "This person has not used IndTrana in the last 24 hours", send_lock_unavailable: "Another email was being prepared; try again",
  test_in_flight: "A test email is already on its way",
  // Brand settings (services/api/app/brand.py codes; docs/BRANDING.md)
  name_set: "Name changed", logo_set: "Logo changed", reset: "Defaults restored",
  brand_name_invalid: "Enter a name", brand_name_length: "The name must be 2 to 40 characters",
  brand_name_characters: "Use only letters, digits, single spaces and . - & '",
  brand_name_control_character: "The name contains a hidden or control character",
  brand_logo_empty: "Choose a logo file", brand_logo_too_large: "The logo is larger than 256 KB",
  brand_logo_unsupported_type: "Only PNG, JPEG or WebP images are accepted",
  brand_logo_malformed: "The file is damaged or is not a complete image", brand_logo_dimensions: "The image is larger than 4096 × 4096 pixels",
  brand_logo_not_set: "No logo is set", brand_version_conflict: "Someone else changed the brand first; the latest settings are shown",
  brand_unavailable: "Brand settings are unavailable right now",
};

/**
 * Plain titles for the documents that administrator pages name. Show the title; add the file path as secondary text
 * only where an administrator needs it to find the file (see `documentParts`).
 */
export const DOCUMENT_TITLES: Record<string, string> = {
  "docs/COMMUNICATION_CHANNELS.md": "Communication channels guide",
  "docs/GDACS_INQUIRY_DRAFT.md": "GDACS inquiry draft",
  "docs/GOVT_DEPLOYMENT_READINESS.md": "Government deployment readiness notes",
  "docs/OIDC_IDENTITY_AND_AUTHORIZATION.md": "Sign-in and roles guide",
  "docs/PROACTIVE_IMPLEMENTATION_CONTRACT.md": "Hazard watch design contract",
  "research/real-data/LICENCES.md": "Public data licences register",
};
const DOCUMENT_PATH = /(?:docs|research)\/[\w./-]+\.md/g;
/** The plain title for a document path; unknown paths read as "<file words> document", never the raw path. */
export function documentTitle(path: string): string {
  if (Object.prototype.hasOwnProperty.call(DOCUMENT_TITLES, path)) return DOCUMENT_TITLES[path];
  const base = path.split("/").pop() ?? path;
  return sentenceCase(base.replace(/\.md$/i, "")) + " document";
}
/** "the <title>" for use inside a sentence ("the public data licences register"); acronyms keep their capitals. */
export function documentPhrase(path: string): string {
  return "the " + documentTitle(path).replace(/^([A-Z])(?=[a-z])/, letter => letter.toLowerCase());
}
/** Prose with every document path replaced by its plain title. */
export function documentText(text: string): string {
  return text.replace(DOCUMENT_PATH, documentPhrase);
}
/** Splits prose into text and document parts, so a page can show the title with the path as secondary text. */
export function documentParts(text: string): Array<{ text: string } | { path: string; title: string }> {
  const parts: Array<{ text: string } | { path: string; title: string }> = [];
  let last = 0;
  for (const match of text.matchAll(DOCUMENT_PATH)) {
    if (match.index! > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ path: match[0], title: documentPhrase(match[0]) });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

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
  // Ids keep the old technical prefix "aegis" (docs/BRANDING.md); people read the product name.
  return words.map((word, index) => word === "aegis" ? "IndTrana" : ACRONYMS.has(word) ? word.toUpperCase() : index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(" ");
}

/**
 * Stored, validated ids that keep their original spelling (docs/BRANDING.md) but are shown by a plain title. The raw id
 * belongs in a title attribute only; API payloads and exports keep it unchanged.
 */
export const RECORD_ID_TITLES: Record<string, string> = {
  "AEGIS-URBAN-FLOOD-EXERCISE-v0.1": "IndTrana urban flood exercise playbook v0.1",
  "AEGIS-EXERCISE-ONLY": "Exercise-only source",
};
/** The plain title for a playbook or other stored record id; an unknown id reads as its sentence-cased words. */
export function recordIdTitle(id: string | null | undefined): string {
  if (typeof id === "string" && Object.prototype.hasOwnProperty.call(RECORD_ID_TITLES, id)) return RECORD_ID_TITLES[id];
  return codeLabel(id);
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
/** Plain sentences for the fixed failure codes the learning, drill and proactive APIs return. A raw code is never shown. */
export const API_CODE_SENTENCES: Record<string, string> = {
  raw_archive_missing: "The offline rainfall archive is not installed on this computer, so catalogue replay is unavailable. Use scenario replay instead.",
  training_years_only: "Catalogue replay only covers the training years. Choose a window inside them.",
  invalid_window: "That time window is not valid. Check the start and end dates and try again.",
  window_required: "Choose a time window first, then try again.",
  stats_do_not_support_change: "The statistics for this window do not support a threshold change, so no proposal was made.",
  hazard_not_configurable: "Thresholds for this hazard cannot be changed here.",
  proposal_would_invert_levels: "That change would put the alert levels in the wrong order, so no proposal was made.",
  forbidden_wording: "The proposal text was refused because it makes a claim this rehearsal cannot support.",
  independent_checker_required: "A different person with the checker role must make this decision.",
  base_version_stale: "The thresholds changed after this proposal was written. Refresh the page and write a new proposal.",
  proposal_not_applicable: "This proposal cannot be applied. It may already be applied or not yet approved.",
  overlay_invalid: "The new thresholds failed a safety check and were not applied.",
  window_config_outdated: "The thresholds changed since this window was closed. Close a new window and try again.",
  learning_conflict: "The record changed while you were working. Refresh the page and try again.",
  system_actor_cannot_close: "Only a signed-in person can close a window.",
  system_actor_cannot_apply: "Only a signed-in person can apply a proposal.",
  system_actor_cannot_respond: "Only a signed-in person can respond in a drill.",
  unknown_hazard: "That hazard is not recognised. Choose one from the list.",
  event_outside_window: "That event falls outside the chosen window.",
  scenario_not_found: "That scenario was not found. Refresh the page and choose another.",
  window_not_found: "That window was not found. Refresh the page and try again.",
  proposal_not_found: "That proposal was not found. Refresh the page and try again.",
  drill_not_found: "That drill was not found. Refresh the page and try again.",
  not_found: "That record was not found. Refresh the page and try again.",
  run_not_found: "That run was not found. Refresh the page and try again.",
  learning_store_unavailable: "The learning records are not available right now. Try again in a moment.",
  drill_store_unavailable: "The drill records are not available right now. Try again in a moment.",
  proactive_store_unavailable: "The watch records are not available right now. Try again in a moment.",
  not_an_exercise: "Drills only work on exercise records.",
  drill_completed: "This drill has finished. Start a new drill to keep practising.",
  clock_stale: "The drill clock moved on. Refresh the page and try again.",
  invalid_advance: "The clock cannot move by that amount.",
  unknown_action: "That drill step is not recognised.",
  no_watch_yet: "No watch has been raised yet. Move the clock forward first.",
  handoff_not_ready: "Acknowledge the watch before taking the hand-off.",
  submit_not_ready: "Take the hand-off before submitting.",
  approve_not_ready: "Submit first, then a checker can approve.",
  operator_role_required: "Only the incident operator role can do this step.",
  cap_not_drafted: "The draft has not been prepared yet. Move the run forward first.",
  plan_not_ready: "The plan is not ready yet. Move the run forward first.",
  invalid_reason: "The reason cannot contain line breaks or control characters. Shorten it and try again.",
  proactive_paused: "Automation is paused by the administrator's kill switch. Drills, runs and threshold changes are blocked until it is released. Reading is not affected.",
  invalid_proposal_fields: "Some text could not be saved. Remove unsupported characters and check the lengths, then try again.",
  unknown_code: "That did not work. Refresh the page and try again.",
};
export const API_CODE_FALLBACK = API_CODE_SENTENCES.unknown_code;
/** Sentence for a failed learning, drill or proactive call: from the fixed code when there is one, never the raw code. */
export function apiFailureText(error: unknown, fallback: string = API_CODE_FALLBACK): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string" && code) return pick(API_CODE_SENTENCES, code) ?? API_CODE_FALLBACK;
  return error instanceof Error && error.message ? error.message : fallback;
}
const RESPONSE_TEXTS: string[] = [API_CODE_SENTENCES, RESPONSE_FAILURE_TEXTS, RESPONSE_STATE_LABELS, REPORT_KIND_LABELS, AUTHORITY_LABELS, REPORT_CODE_LABELS, OTHER_CODE_LABELS, RESPONSE_ACTION_LABELS, RELAY_ACTION_LABELS].flatMap(table => Object.values(table));

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
