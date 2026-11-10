import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Display-only relay for public satellite orbital elements (CelesTrak). One shared server-side cache means many
// browsers cause at most one upstream request per group every 3 hours (CelesTrak refreshes about every 2 hours and
// blocks clients that poll more often). Nothing is stored in the database or used by AEGIS workflows.
const GROUPS: Record<string, string> = {
  weather: "GROUP=weather", resource: "GROUP=resource", noaa: "GROUP=noaa",
  navic: "NAME=IRNSS", insat: "NAME=INSAT", cartosat: "NAME=CARTOSAT", sentinel: "NAME=SENTINEL",
};
const TTL_MS = 3 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 20 * 60 * 1000;
const MAX_BYTES = 400_000;
const cache = new Map<string, { at: number; body: string }>();
const lastFailure = new Map<string, number>();
const headers = (state: string) => ({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, max-age=1800", "X-Aegis-Relay": state });

async function publicFeedsEnabled(): Promise<boolean> {
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/public-reference/earth-watch/status", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const payload = await response.json() as { enabled?: unknown; display_only?: unknown };
    return payload.enabled === true && payload.display_only === true;
  } catch { return false; }
}

// Fallback when CelesTrak refuses this server: SatNOGS DB publishes open orbital elements (CC BY-SA 4.0).
const FALLBACK_NAMES: Record<string, RegExp> = {
  weather: /NOAA|METEOR|METOP|FENGYUN|FY-|GOES|HIMAWARI|METEOSAT|ELEKTRO|INSAT|SUOMI NPP|JPSS|DMSP/i,
  noaa: /^0? ?NOAA/i,
  resource: /CARTOSAT|RESOURCESAT|LANDSAT|TERRA|AQUA|OCEANSAT|RISAT|EOS-|SCATSAT/i,
  navic: /IRNSS|NAVIC|NVS-/i, insat: /INSAT|GSAT/i, cartosat: /CARTOSAT/i, sentinel: /SENTINEL/i,
};
type Elements = { tle0: string; tle1: string; tle2: string };
let satnogs: { at: number; rows: Elements[] } | null = null;
async function fromSatnogs(group: string): Promise<string | null> {
  try {
    if (!satnogs || Date.now() - satnogs.at > 6 * 60 * 60 * 1000) {
      const response = await fetch("https://db.satnogs.org/api/tle/?format=json", {
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000),
        headers: { "User-Agent": "AEGIS-exercise-prototype/0.2 (display-only orbit relay; cached 6h)" },
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > 3_000_000) return null;
      const data: unknown = JSON.parse(text);
      if (!Array.isArray(data)) return null;
      const rows = data.filter((row): row is Elements => typeof row?.tle0 === "string" && typeof row?.tle1 === "string" && typeof row?.tle2 === "string"
        && row.tle0.length <= 60 && /^1 \d{5}/.test(row.tle1) && row.tle1.length === 69 && /^2 \d{5}/.test(row.tle2) && row.tle2.length === 69);
      satnogs = { at: Date.now(), rows };
    }
    const names = FALLBACK_NAMES[group];
    const sets = satnogs.rows.filter(row => names.test(row.tle0)).slice(0, 150)
      .map(row => row.tle0.replace(/^0 /, "").replace(/[^\x20-\x7E]/g, "") + "\n" + row.tle1 + "\n" + row.tle2);
    return sets.length ? sets.join("\n") + "\n" : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const group = new URL(request.url).searchParams.get("group") ?? "";
  if (!Object.hasOwn(GROUPS, group)) return NextResponse.json({ error: "Unknown satellite group" }, { status: 404 });
  if (!(await publicFeedsEnabled())) return NextResponse.json({ error: "disabled" }, { status: 503 });
  const hit = cache.get(group), now = Date.now();
  if (hit && now - hit.at < TTL_MS) return new NextResponse(hit.body, { headers: headers("cached") });
  const failedAt = lastFailure.get(group) ?? 0;
  if (now - failedAt < RETRY_AFTER_FAILURE_MS) {
    if (hit) return new NextResponse(hit.body, { headers: headers("stale") });
    return NextResponse.json({ error: "Orbit source temporarily unavailable" }, { status: 502 });
  }
  try {
    const upstream = await fetch("https://celestrak.org/NORAD/elements/gp.php?" + GROUPS[group] + "&FORMAT=tle", {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "AEGIS-exercise-prototype/0.2 (display-only orbit relay; cached 3h)" },
    });
    if (!upstream.ok) throw new Error("Upstream status " + upstream.status);
    const body = await upstream.text();
    // Three-line element sets only: a name line, then lines starting "1 " and "2 ".
    if (body.length > MAX_BYTES || !/^1 \d{5}/m.test(body) || !/^2 \d{5}/m.test(body)) throw new Error("Unexpected orbit data");
    // Name lines are shown in the page: keep letters, digits and plain punctuation only.
    const clean = body.split(/\r?\n/).map(line => /^[12] /.test(line) ? line : line.replace(/[^A-Za-z0-9 ()\[\]._+\/-]/g, "").slice(0, 40)).join("\n");
    cache.set(group, { at: now, body: clean });
    return new NextResponse(clean, { headers: headers("fresh") });
  } catch {
    lastFailure.set(group, now);
    if (hit) return new NextResponse(hit.body, { headers: headers("stale") });
    const fallback = await fromSatnogs(group);
    if (fallback) { cache.set(group, { at: now, body: fallback }); return new NextResponse(fallback, { headers: headers("fallback-satnogs") }); }
    return NextResponse.json({ error: "Orbit source temporarily unavailable" }, { status: 502 });
  }
}
