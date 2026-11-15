import { NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired, upstreamAuthFailure } from "../../../../../lib/api-auth";
import { bhuvanCode, bhuvanQuery, cleanBhuvanLive, isBhuvanKind } from "../../../../../lib/bhuvan";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Display-only live reference from ISRO Bhuvan. Read-only (GET); nothing is stored or sent to IndTrana workflows.
const HEADERS = { "Cache-Control": "no-store" };
const fail = (status: number, code: string) => NextResponse.json({ error: code, code }, { status, headers: HEADERS });

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isBhuvanKind(kind)) return fail(404, "unknown_reference");
  const query = bhuvanQuery(kind, new URL(request.url).searchParams);
  if (query === null) return fail(422, kind === "village" ? "invalid_place_name" : "point_outside_india");
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(`${base}/v1/reference/bhuvan/${kind}${query ? "?" + query : ""}`, {
      headers: auth, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000),
    });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload && typeof payload === "object" ? (payload as Record<string, unknown>).detail : null;
      return fail(response.status === 403 ? 403 : response.status === 422 ? 422 : 503, response.status === 403 ? "forbidden" : bhuvanCode(detail));
    }
    if (kind === "status") {
      const p = payload as Record<string, unknown> | null;
      if (!p || p.classification !== "live" || p.display_only !== true) throw new Error("invalid");
      const themes: Record<string, { ready: boolean; expires_at: string | null }> = {};
      if (p.themes && typeof p.themes === "object") for (const [name, entry] of Object.entries(p.themes as Record<string, unknown>).slice(0, 8)) {
        if (!/^[a-z_]{2,20}$/.test(name) || !entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        themes[name] = { ready: e.ready === true, expires_at: typeof e.expires_at === "string" && !Number.isNaN(Date.parse(e.expires_at)) ? e.expires_at : null };
      }
      return NextResponse.json({ classification: "live", display_only: true, themes }, { headers: HEADERS });
    }
    return NextResponse.json(cleanBhuvanLive(payload), { headers: HEADERS });
  } catch {
    return fail(503, "bhuvan_unavailable");
  }
}
