import { NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired, upstreamAuthFailure } from "../../../lib/api-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const endpoint = (process.env.API_INTERNAL_URL || "http://localhost:8000") + "/v1/exercise/sources";
    const response = await fetch(endpoint, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(6000) });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    if (!response.ok) throw new Error("Source service unavailable");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" ||
        !("source" in payload) || payload.source !== "synthetic_exercise" ||
        !("sources" in payload) || !Array.isArray(payload.sources)) throw new Error("Invalid source data");
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Exercise source monitor unavailable" }, { status: 503 });
  }
}
