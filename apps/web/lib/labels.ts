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

/** True when the code has a reviewed label (rather than the generic fallback). */
export const hasLabel = (code: string): boolean => Object.prototype.hasOwnProperty.call(LABELS, code);
export const KNOWN_LABEL_CODES: readonly string[] = Object.keys(LABELS);
export const KNOWN_LABEL_TEXTS: readonly string[] = [...new Set(Object.values(LABELS))];

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
