/** ISRO Bhuvan live reference: query validation and response cleaning for the display-only panel.
 * Pure functions (no React, no DOM) so they can be unit tested. See docs/BHUVAN_CONNECTORS.md.
 */
export const BHUVAN_KINDS = ["status", "place", "landuse", "route", "hospitals", "village"] as const;
export type BhuvanKind = (typeof BHUVAN_KINDS)[number];
export const isBhuvanKind = (value: unknown): value is BhuvanKind => typeof value === "string" && (BHUVAN_KINDS as readonly string[]).includes(value);
export const BHUVAN_THEMES = ["proximity", "village_geocode", "reverse_geocode", "lulc_stats", "lulc_aoi", "routing", "geoid"] as const;
export type BhuvanTheme = (typeof BHUVAN_THEMES)[number];
export const isBhuvanTheme = (value: unknown): value is BhuvanTheme => typeof value === "string" && (BHUVAN_THEMES as readonly string[]).includes(value);
export const BHUVAN_ATTRIBUTION = "Data: Bhuvan, NRSC/ISRO";

const INDIA = { lat: [6, 38], lon: [68, 98] } as const;
export const ANDHRA = { lat: [12.6, 19.95], lon: [76.7, 84.8] } as const;
const NUMBER = /^-?\d{1,3}(\.\d{1,8})?$/;
const PLACE = /^[A-Za-z][A-Za-z .'-]{1,39}$/;

export function inBox(lat: number, lon: number, box: { lat: readonly number[]; lon: readonly number[] } = INDIA): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= box.lat[0] && lat <= box.lat[1] && lon >= box.lon[0] && lon <= box.lon[1];
}

/** Rebuilds the upstream query from validated numbers only; anything else is refused (null). */
export function bhuvanQuery(kind: BhuvanKind, params: URLSearchParams): string | null {
  if (kind === "status") return "";
  if (kind === "village") {
    const name = params.get("name") ?? "";
    return PLACE.test(name) ? `name=${encodeURIComponent(name)}` : null;
  }
  const names = kind === "route" ? ["lat1", "lon1", "lat2", "lon2"] : ["lat", "lon"];
  const values: number[] = [];
  for (const name of names) {
    const raw = params.get(name) ?? "";
    if (!NUMBER.test(raw)) return null;
    values.push(Number(raw));
  }
  for (let i = 0; i < values.length; i += 2) if (!inBox(values[i], values[i + 1])) return null;
  return names.map((name, i) => `${name}=${values[i]}`).join("&");
}

export interface BhuvanRow { key: string; value: string | number }
export interface BhuvanLive {
  classification: "live"; kind: Exclude<BhuvanKind, "status">; theme: string; source: string; coverage: string;
  attribution: string; fetched_at: string; cached: boolean; no_data: boolean; limitations: string[];
  fields: BhuvanRow[]; records: BhuvanRow[][]; distance_km: number | null; path: [number, number][];
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f<>]/g, "").slice(0, max) : null;
const KEY = /^[A-Za-z0-9_ ./()%[\]-]{1,60}$/;

function rows(value: unknown, max: number): BhuvanRow[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).flatMap((row): BhuvanRow[] => {
    if (!isObject(row) || typeof row.key !== "string" || !KEY.test(row.key)) return [];
    const v = typeof row.value === "number" && Number.isFinite(row.value) ? row.value : text(row.value, 120);
    return v === null || v === "" ? [] : [{ key: row.key, value: v }];
  });
}

/** Strict cleaner for a live answer; throws when the classification or freshness is missing. */
export function cleanBhuvanLive(payload: unknown): BhuvanLive {
  if (!isObject(payload) || payload.classification !== "live" || payload.display_only !== true || payload.writes_to_database !== false) throw new Error("Unexpected classification");
  const kind = payload.kind;
  if (!isBhuvanKind(kind) || kind === "status") throw new Error("Unexpected kind");
  const fetched = text(payload.fetched_at, 40);
  if (!fetched || Number.isNaN(Date.parse(fetched))) throw new Error("Missing as-of time");
  const path = Array.isArray(payload.path) ? payload.path.slice(0, 301).flatMap((p): [number, number][] =>
    Array.isArray(p) && p.length === 2 && inBox(Number(p[0]), Number(p[1])) ? [[Number(p[0]), Number(p[1])]] : []) : [];
  const distance = typeof payload.distance_km === "number" && Number.isFinite(payload.distance_km) && payload.distance_km >= 0 ? payload.distance_km : null;
  return {
    classification: "live", kind, theme: text(payload.theme, 60) ?? "Bhuvan", source: "Bhuvan", coverage: text(payload.coverage, 160) ?? "",
    attribution: BHUVAN_ATTRIBUTION, fetched_at: fetched, cached: payload.cached === true, no_data: payload.no_data === true,
    limitations: Array.isArray(payload.limitations) ? payload.limitations.map(l => text(l, 240)).filter((l): l is string => !!l).slice(0, 5) : [],
    fields: rows(payload.fields, 40),
    records: Array.isArray(payload.records) ? payload.records.slice(0, 20).map(r => rows(r, 12)).filter(r => r.length > 0) : [],
    distance_km: distance, path,
  };
}

/** Failure codes the API may return; anything else becomes "bhuvan_unavailable". */
export const BHUVAN_CODES = ["bhuvan_disabled", "token_missing", "token_expired", "token_rejected", "connector_key_missing", "upstream_backoff",
  "upstream_status", "timeout", "network_error", "invalid_response", "upstream_too_large", "point_outside_india",
  "outside_coverage_andhra_pradesh", "invalid_place_name", "bhuvan_unavailable"] as const;
export type BhuvanCode = (typeof BHUVAN_CODES)[number];
export const bhuvanCode = (value: unknown): BhuvanCode => (BHUVAN_CODES as readonly string[]).includes(value as string) ? value as BhuvanCode : "bhuvan_unavailable";
export const BHUVAN_CODE_TEXT: Record<BhuvanCode, string> = {
  bhuvan_disabled: "The Bhuvan connector is switched off. An administrator can enable it on the Connectors page.",
  token_missing: "No Bhuvan token is saved for this theme yet. An administrator can paste one on the Connectors page.",
  token_expired: "The Bhuvan token for this theme has expired (tokens last one day). An administrator can paste a new one.",
  token_rejected: "Bhuvan refused the saved token. An administrator should paste a fresh one.",
  connector_key_missing: "The connector master key is missing on this server, so the token cannot be read.",
  upstream_backoff: "Bhuvan did not answer a moment ago. Try again in a minute.",
  upstream_status: "Bhuvan answered with an error. No substitute data is shown.",
  timeout: "Bhuvan took too long to answer. No substitute data is shown.",
  network_error: "Bhuvan could not be reached from this server. No substitute data is shown.",
  invalid_response: "Bhuvan sent an answer IndTrana could not read. No substitute data is shown.",
  upstream_too_large: "Bhuvan sent more data than IndTrana accepts for one view.",
  point_outside_india: "This point is outside India, so it is not sent to Bhuvan.",
  outside_coverage_andhra_pradesh: "Bhuvan's hospital and post office data covers Andhra Pradesh only. This point is outside it.",
  invalid_place_name: "Use letters only for a place name (2 to 40 characters).",
  bhuvan_unavailable: "Bhuvan reference is unavailable right now. No substitute data is shown.",
};

export interface BhuvanTokenState { theme: BhuvanTheme; label: string; coverage: string; set: boolean; saved_at: string | null; expires_at: string | null; expired: boolean; enabled: boolean }
const iso = (value: unknown) => { const raw = text(value, 40); return raw && !Number.isNaN(Date.parse(raw)) ? raw : null; };
/** Admin token list: set/saved/expiry flags only. A value is never present in the API answer and never kept here. */
export function cleanBhuvanTokens(payload: unknown): { themes: BhuvanTokenState[] } {
  if (!isObject(payload) || !Array.isArray(payload.themes)) throw new Error("Invalid token list");
  return { themes: payload.themes.slice(0, 8).flatMap((item): BhuvanTokenState[] => {
    if (!isObject(item) || !isBhuvanTheme(item.theme)) return [];
    return [{ theme: item.theme, label: text(item.label, 60) ?? item.theme, coverage: text(item.coverage, 160) ?? "", set: item.set === true,
      saved_at: iso(item.saved_at), expires_at: iso(item.expires_at), expired: item.expired === true, enabled: item.enabled === true }];
  }) };
}

/** Hours (rounded down) until an ISO expiry, or null when unknown; negative when expired. */
export function hoursLeft(expiresAt: string | null | undefined, now: number): number | null {
  const time = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isNaN(time) ? null : Math.floor((time - now) / 3_600_000);
}
