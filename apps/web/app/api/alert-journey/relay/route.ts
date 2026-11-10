import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Display-only relay for Alert Journey live mode. The viewer's browser talks only to AEGIS; this route fetches the
// reviewed public source on its behalf, so third parties never see the viewer's network address. It is NOT a general
// proxy: only fixed HTTPS hosts (and path prefixes) are reachable, redirects are refused, responses are size- and
// type-checked, nothing is stored in the database, and it is closed unless the public-feeds switch is on.
type Rule = { prefix?: string; path?: RegExp; noQuery?: boolean; post?: boolean; open?: boolean; types: RegExp; ttl: number };
const JSON_TYPES = /^(application\/(geo\+)?json|text\/plain|application\/rss\+xml)\s*(;|$)/i;
const IMAGE_TYPES = /^image\/(png|jpeg)\s*(;|$)/i;
const MINUTE = 60_000, HOUR = 60 * MINUTE;
const RULES: Record<string, Rule> = {
  "api.open-meteo.com": { types: JSON_TYPES, ttl: 10 * MINUTE },
  "ensemble-api.open-meteo.com": { types: JSON_TYPES, ttl: HOUR },
  "flood-api.open-meteo.com": { types: JSON_TYPES, ttl: HOUR },
  "archive-api.open-meteo.com": { types: JSON_TYPES, ttl: 24 * HOUR },
  "climate-api.open-meteo.com": { types: JSON_TYPES, ttl: 24 * HOUR },
  "marine-api.open-meteo.com": { types: JSON_TYPES, ttl: HOUR },
  "geocoding-api.open-meteo.com": { types: JSON_TYPES, ttl: 24 * HOUR },
  "earthquake.usgs.gov": { types: JSON_TYPES, ttl: 5 * MINUTE },
  "eonet.gsfc.nasa.gov": { types: JSON_TYPES, ttl: 15 * MINUTE },
  "gibs.earthdata.nasa.gov": { prefix: "/wm", types: IMAGE_TYPES, ttl: 6 * HOUR },   // /wms/ and /wmts/
  // Tile sources take an exact path shape and no query string, so a caller cannot defeat the cache with made-up URLs.
  "tile.openstreetmap.org": { open: true, path: /^\/\d{1,2}\/\d{1,7}\/\d{1,7}\.png$/, noQuery: true, types: IMAGE_TYPES, ttl: 24 * HOUR },
  "tiles.maps.eox.at": { prefix: "/wmts/", path: /^\/wmts\/[A-Za-z0-9._/-]{1,160}\.(jpg|jpeg|png)$/, noQuery: true, types: IMAGE_TYPES, ttl: 24 * HOUR },
  "s3.amazonaws.com": { prefix: "/elevation-tiles-prod/", path: /^\/elevation-tiles-prod\/terrarium\/\d{1,2}\/\d{1,7}\/\d{1,7}\.png$/, noQuery: true, types: IMAGE_TYPES, ttl: 24 * HOUR },
  "overpass-api.de": { prefix: "/api/interpreter", post: true, types: JSON_TYPES, ttl: HOUR },
  "overpass.kumi.systems": { prefix: "/api/interpreter", post: true, types: JSON_TYPES, ttl: HOUR },
};
const MAX_URL = 2400, MAX_BODY = 8_000, MAX_RESPONSE = 6_000_000, MAX_CACHED_ITEM = 2_500_000, MAX_CACHE_BYTES = 96_000_000;
const WINDOW_MS = 5 * MINUTE, MAX_PER_WINDOW = 6000, MAX_CLIENTS = 5000;
// Limits on new upstream fetches, whoever asks: at most this many per source per minute, and this many at once.
const MAX_FETCHES_PER_HOST_MINUTE = 900, MAX_IN_FLIGHT = 96;
const USER_AGENT = "AEGIS-exercise-prototype/0.2 (display-only public-reference relay; cached)";

type Entry = { at: number; ttl: number; type: string; body: Uint8Array };
const cache = new Map<string, Entry>();
let cacheBytes = 0;
const inFlight = new Map<string, Promise<Entry>>();
const hits = new Map<string, { start: number; count: number }>();
const hostFetches = new Map<string, { start: number; count: number }>();
let gate = { at: 0, enabled: false };

const refuse = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function resolveTarget(raw: string | null, method: "GET" | "POST"): URL | null {
  if (!raw || raw.length > MAX_URL) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
  if (!Object.hasOwn(RULES, url.hostname)) return null;
  const rule = RULES[url.hostname];
  if (rule.prefix && !url.pathname.startsWith(rule.prefix)) return null;
  if (url.pathname.includes("..") || url.pathname.includes("//")) return null;
  if (rule.path && !rule.path.test(url.pathname)) return null;
  if (rule.noQuery && url.search) return null;
  if (method === "POST" && !rule.post) return null;
  return url;
}

async function publicFeedsEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - gate.at < 30_000) return gate.enabled;
  let enabled = false;
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/public-reference/earth-watch/status", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const payload = await response.json() as { enabled?: unknown; display_only?: unknown };
      enabled = payload.enabled === true && payload.display_only === true;
    }
  } catch { enabled = false; }
  gate = { at: now, enabled };
  return enabled;
}

// The caller's address is only believed when a reverse proxy that AEGIS trusts sets it (AEGIS_TRUSTED_PROXY=1, last
// hop). Otherwise the header is client-controlled, so every caller shares one bucket and the per-source cap protects
// the upstream services.
function withinRate(request: Request): boolean {
  const trusted = process.env.AEGIS_TRUSTED_PROXY === "1";
  const who = trusted ? ((request.headers.get("x-forwarded-for") ?? "").split(",").pop() ?? "").trim().slice(0, 64) || "direct" : "direct";
  const now = Date.now(), record = hits.get(who);
  if (!record || now - record.start > WINDOW_MS) {
    hits.delete(who); hits.set(who, { start: now, count: 1 });
    for (const oldest of hits.keys()) { if (hits.size <= MAX_CLIENTS) break; hits.delete(oldest); }
    return true;
  }
  record.count += 1;
  return record.count <= MAX_PER_WINDOW;
}

function hostHasBudget(host: string): boolean {
  const now = Date.now(), record = hostFetches.get(host);
  if (!record || now - record.start > MINUTE) { hostFetches.set(host, { start: now, count: 1 }); return true; }
  record.count += 1;
  return record.count <= MAX_FETCHES_PER_HOST_MINUTE;
}

// A browser page on another site must not be able to drive the relay. Browsers state where a request came from;
// tools without these headers are still covered by the limits above.
function fromThisSite(request: Request, method: "GET" | "POST"): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host)) return false; } catch { return false; } }
  else if (method === "POST" && !site) return false;
  return true;
}

// Reads a body in pieces and stops as soon as it is larger than allowed, so an oversized body is never held in memory.
async function readCapped(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader(), parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  const joined = new Uint8Array(size); let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
  return joined;
}

function remember(key: string, entry: Entry) {
  if (entry.body.byteLength > MAX_CACHED_ITEM) return;
  const previous = cache.get(key);
  if (previous) { cacheBytes -= previous.body.byteLength; cache.delete(key); }
  cache.set(key, entry); cacheBytes += entry.body.byteLength;
  for (const [oldest, value] of cache) { if (cacheBytes <= MAX_CACHE_BYTES) break; cache.delete(oldest); cacheBytes -= value.body.byteLength; }
}

async function fetchUpstream(url: URL, rule: Rule, method: "GET" | "POST", body: string | undefined): Promise<Entry> {
  const upstream = await fetch(url, {
    method, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000),
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
  });
  if (!upstream.ok) throw Object.assign(new Error("upstream"), { status: upstream.status });
  const type = upstream.headers.get("content-type") ?? "";
  if (!rule.types.test(type)) throw Object.assign(new Error("type"), { status: 502 });
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE) throw Object.assign(new Error("size"), { status: 502 });
  const bytes = await readCapped(upstream.body, MAX_RESPONSE);
  if (!bytes) throw Object.assign(new Error("size"), { status: 502 });
  return { at: Date.now(), ttl: rule.ttl, type: type.split(";")[0].trim() + (JSON_TYPES.test(type) ? "; charset=utf-8" : ""), body: bytes };
}

// Public sources blip now and then: one quiet retry for read requests, never for refused (4xx) answers.
async function fetchWithOneRetry(url: URL, rule: Rule, method: "GET" | "POST", body: string | undefined): Promise<Entry> {
  try { return await fetchUpstream(url, rule, method, body); }
  catch (error) {
    const status = (error as { status?: unknown }).status;
    if (method !== "GET" || (typeof status === "number" && status < 500)) throw error;
    await new Promise(resolve => setTimeout(resolve, 700));
    return fetchUpstream(url, rule, method, body);
  }
}

function reply(entry: Entry, state: string) {
  const seconds = Math.max(60, Math.min(3600, Math.floor(entry.ttl / 1000)));
  return new NextResponse(entry.body.buffer as ArrayBuffer, { headers: { "Content-Type": entry.type, "Cache-Control": "private, max-age=" + seconds, "X-Aegis-Relay": state, "X-Content-Type-Options": "nosniff" } });
}

async function handle(request: Request, method: "GET" | "POST") {
  const url = resolveTarget(new URL(request.url).searchParams.get("u"), method);
  if (!url) return refuse(404, "Source not on the reviewed list");
  if (!fromThisSite(request, method)) return refuse(403, "Cross-site use is not allowed");
  if (!withinRate(request)) return refuse(429, "Too many requests");
  const rule = RULES[url.hostname];
  // OpenStreetMap base tiles belong to the base product (the map on every page); every other source needs the switch.
  if (!rule.open && !(await publicFeedsEnabled())) return refuse(503, "disabled");
  let body: string | undefined;
  if (method === "POST") {
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) return refuse(413, "Query too large");
    const raw = await readCapped(request.body, MAX_BODY);
    if (!raw) return refuse(413, "Query too large");
    body = new TextDecoder().decode(raw);
    if (body.length === 0 || body.length > MAX_BODY || !body.startsWith("data=")) return refuse(400, "Invalid query");
  }
  const key = method + " " + url.href + (body ? " " + body : "");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return reply(cached, "cached");
  try {
    let pending = inFlight.get(key);
    if (!pending) {
      if (inFlight.size >= MAX_IN_FLIGHT || !hostHasBudget(url.hostname)) return cached ? reply(cached, "stale") : refuse(503, "Relay is busy");
      pending = fetchWithOneRetry(url, rule, method, body).finally(() => inFlight.delete(key)); inFlight.set(key, pending);
    }
    const entry = await pending;
    remember(key, entry);
    return reply(entry, "fresh");
  } catch (error) {
    if (cached) return reply(cached, "stale");
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 502;
    // Pass through "busy" and "rate limited" so the client can back off; everything else is a plain gateway error.
    return refuse([429, 502, 503, 504].includes(status) ? status : 502, "Source unavailable");
  }
}

export async function GET(request: Request) { return handle(request, "GET"); }
export async function POST(request: Request) { return handle(request, "POST"); }
