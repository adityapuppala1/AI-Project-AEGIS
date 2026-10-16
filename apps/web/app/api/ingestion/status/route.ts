import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/ingestion/status", {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Exercise ingestion service unavailable");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" ||
        !("mode" in result) || result.mode !== "synthetic_exercise" ||
        !("live_ingestion_enabled" in result) || result.live_ingestion_enabled !== false) {
      throw new Error("Unexpected ingestion classification");
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Synthetic ingestion status unavailable" }, { status: 503 });
  }
}
