import { NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired, upstreamAuthFailure } from "../../../../lib/api-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Display-only public reference data. Nothing here is stored or sent to IndTrana workflows.
const FEEDS = new Set(["status", "earthquakes", "events", "imagery"]);
const HEADERS = { "Cache-Control": "no-store" };
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : null;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const httpsUrl = (value: unknown) => {
  if (typeof value !== "string") return null;
  try { return new URL(value).protocol === "https:" ? value.slice(0, 500) : null; } catch { return null; }
};
const timestamp = (value: unknown) => {
  const raw = text(value, 40);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
};

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype", "hasownproperty", "tostring", "valueof"]);
const safeCategory = (value: unknown) => {
  const raw = text(value, 40);
  return raw && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(raw) && !RESERVED_KEYS.has(raw.toLowerCase()) ? raw : "other";
};

function cleanRecords(value: unknown) {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Invalid records");
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!isObject(item)) return [];
    const id = text(item.id, 80), lat = finite(item.lat), lon = finite(item.lon);
    if (!id || seen.has(id) || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    seen.add(id);
    return [{
      id, source: text(item.source, 40) ?? "unknown", category: safeCategory(item.category),
      kind: text(item.kind, 120) ?? "Event", title: text(item.title, 160) ?? "Untitled",
      observed_at: timestamp(item.observed_at), updated_at: timestamp(item.updated_at),
      lat, lon, magnitude: finite(item.magnitude), status: text(item.status, 60) ?? "not supplied",
      url: httpsUrl(item.url),
    }];
  });
}

function cleanLayers(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 6) throw new Error("Invalid layers");
  return value.map(item => {
    if (!isObject(item)) throw new Error("Invalid layer");
    const id = text(item.id, 80), latest = text(item.latest, 12), start = text(item.start, 12),
      matrix = text(item.matrix, 60), title = text(item.title, 120);
    const ranges = Array.isArray(item.ranges) ? item.ranges.map(r => text(r, 40)).filter((r): r is string => !!r).slice(0, 200) : [];
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if (!id || !matrix || !latest || !start || !date.test(latest) || !date.test(start) || ranges.length === 0) throw new Error("Invalid layer");
    return { id, title: title ?? id, latest, start, ranges, matrix };
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ feed: string }> }) {
  const { feed } = await params;
  if (!FEEDS.has(feed)) return NextResponse.json({ error: "Unknown public reference feed" }, { status: 404, headers: HEADERS });
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/public-reference/earth-watch/" + feed, {
      headers: auth, cache: "no-store", signal: AbortSignal.timeout(30000),
    });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    if (response.status === 503) return NextResponse.json({ error: "disabled" }, { status: 503, headers: HEADERS });
    if (!response.ok) throw new Error("Public feed unavailable");
    const payload: unknown = await response.json();
    if (!isObject(payload) || payload.classification !== "public_reference") throw new Error("Unexpected classification");
    if (feed === "status") {
      if (typeof payload.enabled !== "boolean" || payload.display_only !== true || payload.writes_to_database !== false) throw new Error("Invalid status");
      return NextResponse.json({ classification: "public_reference", enabled: payload.enabled, display_only: true, writes_to_database: false }, { headers: HEADERS });
    }
    if (payload.feed !== feed) throw new Error("Feed mismatch");
    const fetchedAt = timestamp(payload.fetched_at);
    if (!fetchedAt || typeof payload.stale !== "boolean") throw new Error("Invalid freshness");
    const common = {
      classification: "public_reference", feed, fetched_at: fetchedAt, stale: payload.stale,
      warning: text(payload.warning, 200), attribution: text(payload.attribution, 120),
      cache_seconds: finite(payload.cache_seconds),
      limitations: Array.isArray(payload.limitations) ? payload.limitations.map(l => text(l, 240)).filter(Boolean).slice(0, 6) : [],
    };
    return NextResponse.json(feed === "imagery" ? { ...common, layers: cleanLayers(payload.layers) } : { ...common, records: cleanRecords(payload.records) }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ error: "Public data source unavailable. No substitute data is shown." }, { status: 502, headers: HEADERS });
  }
}
