// Display-only public reference data (USGS, NASA EONET, NASA GIBS). Never workflow input.
export type EarthFeedName = "earthquakes" | "events" | "imagery";
export type Region = "india" | "global";

export interface PublicRecord {
  id: string; source: string; category: string; kind: string; title: string;
  observed_at: string | null; updated_at: string | null; lat: number; lon: number;
  magnitude: number | null; status: string; url: string | null;
}
interface FeedBase {
  classification: "public_reference"; feed: EarthFeedName; fetched_at: string; stale: boolean;
  warning: string | null; attribution: string | null; cache_seconds: number | null; limitations: string[];
}
export interface RecordFeed extends FeedBase { records: PublicRecord[] }
export interface ImageryLayer { id: string; title: string; latest: string; start: string; ranges: string[]; matrix: string }
export interface ImageryFeed extends FeedBase { layers: ImageryLayer[] }

const IMAGERY_LABELS: Record<string, string> = {
  MODIS_Terra_CorrectedReflectance_TrueColor: "Terra / MODIS",
  MODIS_Aqua_CorrectedReflectance_TrueColor: "Aqua / MODIS",
  VIIRS_NOAA20_CorrectedReflectance_TrueColor: "NOAA-20 / VIIRS",
};
export const imageryLabel = (layerId: string) => IMAGERY_LABELS[layerId] ?? layerId;

export const INDIA_BOUNDS = { south: 5, north: 38, west: 65, east: 100 } as const;

export const CATEGORY_STYLE: Record<string, { label: string; color: string }> = {
  earthquakes: { label: "Earthquakes", color: "#b486d5" },
  wildfires: { label: "Wildfires", color: "#ed9955" },
  severeStorms: { label: "Severe storms", color: "#62a6d5" },
  floods: { label: "Floods", color: "#34b4a6" },
  volcanoes: { label: "Volcanoes", color: "#d77b74" },
  landslides: { label: "Landslides", color: "#b5a16d" },
  other: { label: "Other events", color: "#90a8a3" },
};
// Own keys only: an upstream category such as "__proto__" or "constructor" must never resolve to a prototype member.
export const categoryStyle = (category: string) =>
  Object.prototype.hasOwnProperty.call(CATEGORY_STYLE, category) ? CATEGORY_STYLE[category] : CATEGORY_STYLE.other;

export function inRegion(record: Pick<PublicRecord, "lat" | "lon">, region: Region) {
  return region === "global" || (record.lat >= INDIA_BOUNDS.south && record.lat <= INDIA_BOUNDS.north &&
    record.lon >= INDIA_BOUNDS.west && record.lon <= INDIA_BOUNDS.east);
}

export const markerRadius = (record: Pick<PublicRecord, "magnitude">) =>
  record.magnitude === null ? 6 : Math.min(13, Math.max(5, record.magnitude * 1.6));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** True when `value` (YYYY-MM-DD, UTC) lies in a GIBS availability range such as "2000-02-24/2026-11-01/P1D". */
export function dateAvailable(value: string, ranges: string[]) {
  if (!DATE.test(value)) return false;
  return ranges.some(range => {
    const [start, end] = range.split("/");
    return value >= start && value <= (end || start);
  });
}

/** MapLibre tile template for a supported GIBS layer, or null when any part looks unsafe. */
export function gibsTileUrl(layerId: string, date: string, matrix: string) {
  if (!/^[A-Za-z0-9_]{1,80}$/.test(layerId) || !/^[A-Za-z0-9_]{1,60}$/.test(matrix) || !DATE.test(date)) return null;
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerId}/default/${date}/${matrix}/{z}/{y}/{x}.jpeg`;
}

export function formatIst(value: string | null | undefined) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid time";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) + " IST";
}

export function ageLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const countdownLabel = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const EARTH_RADIUS_KM = 6371;
const toRad = (degrees: number) => degrees * Math.PI / 180;
/** Great-circle distance in kilometres. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Initial compass bearing from `a` to `b`, degrees clockwise from north (0–360). */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compassLabel = (degrees: number) => COMPASS[Math.round(degrees / 22.5) % 16];

export interface NearbySignal { record: PublicRecord; km: number; bearing: number }
/** Public records within `radiusKm` of a case, nearest first. Context only; never stored or treated as evidence. */
export function nearbySignals(records: PublicRecord[], origin: { lat: number; lon: number }, radiusKm: number): NearbySignal[] {
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) || !(radiusKm > 0)) return [];
  return records
    .map(record => ({ record, km: haversineKm(origin, record), bearing: bearingDeg(origin, record) }))
    .filter(item => item.km <= radiusKm)
    .sort((a, b) => a.km - b.km || a.record.id.localeCompare(b.record.id));
}

/** Fetch one sanitized public-reference feed through the web proxy; rejects any other classification. */
export async function fetchEarthFeed<T>(name: EarthFeedName, signal: AbortSignal): Promise<T> {
  const response = await fetch("/api/earth-watch/" + name, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Public data source unavailable");
  const payload = await response.json() as { classification?: string; feed?: string };
  if (payload.classification !== "public_reference" || payload.feed !== name) throw new Error("Unexpected data classification");
  return payload as T;
}

/** India-region summary for the Command Center strip. Context only; never an assessment. */
export function summarizeSignals(quakes: PublicRecord[], events: PublicRecord[]) {
  const nearbyQuakes = quakes.filter(record => inRegion(record, "india"));
  const nearbyEvents = events.filter(record => inRegion(record, "india"));
  const strongest = nearbyQuakes.reduce<PublicRecord | null>(
    (best, record) => (record.magnitude ?? -1) > (best?.magnitude ?? -1) ? record : best, null);
  return { quakeCount: nearbyQuakes.length, eventCount: nearbyEvents.length, strongest };
}

export type Freshness = "fresh" | "aging" | "stale";
/** Cached-feed freshness from the time we fetched it; unrelated to when the hazard was observed. */
export function feedFreshness(feed: Pick<RecordFeed, "fetched_at" | "stale" | "cache_seconds">, nowMs: number): Freshness {
  if (feed.stale) return "stale";
  const age = nowMs - Date.parse(feed.fetched_at);
  const ttl = (feed.cache_seconds ?? 300) * 1000;
  return age <= ttl * 1.5 ? "fresh" : "aging";
}
