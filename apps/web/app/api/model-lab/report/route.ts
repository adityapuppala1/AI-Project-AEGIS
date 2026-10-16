import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const internal = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(internal + "/v1/exercise/model-lab/report", {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Model report unavailable");
    const report: unknown = await response.json();
    if (!report || typeof report !== "object" ||
        !("source" in report) || report.source !== "synthetic_generated_fixture" ||
        !("mode" in report) || report.mode !== "offline_exercise_only" ||
        !("live_inference_enabled" in report) || report.live_inference_enabled !== false ||
        !("calibrated_real_world_probability" in report) || report.calibrated_real_world_probability !== false ||
        !("operational_actions_enabled" in report) || report.operational_actions_enabled !== false) {
      throw new Error("Unsafe report classification");
    }
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Synthetic evaluation report unavailable" }, { status: 503 });
  }
}
