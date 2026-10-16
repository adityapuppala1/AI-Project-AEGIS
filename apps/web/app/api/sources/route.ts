import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const endpoint = (process.env.API_INTERNAL_URL || "http://localhost:8000") + "/v1/exercise/sources";
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(6000) });
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
