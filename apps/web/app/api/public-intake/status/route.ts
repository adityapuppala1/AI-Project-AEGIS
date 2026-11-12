import { NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired, upstreamAuthFailure } from "../../../../lib/api-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/public-intake/status", { headers: auth, cache: "no-store", signal: AbortSignal.timeout(6000) });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    if (!response.ok) throw new Error("status unavailable");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("unexpected");
    const status = payload as Record<string, unknown>;
    if (status.classification !== "public_unverified_intake" || typeof status.enabled !== "boolean" ||
        status.quarantine_only !== true || status.creates_cases !== false || status.notifies_responders !== false) throw new Error("unexpected");
    return NextResponse.json({ classification: "public_unverified_intake", enabled: status.enabled, quarantine_only: true, creates_cases: false, notifies_responders: false },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Intake status unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
