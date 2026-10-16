import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DRAINAGE = new Set(["good", "moderate", "limited"]);
const ZONED_DATE = /(Z|[+-]\d{2}:\d{2})$/i;

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > 1024) return NextResponse.json({ error: "Oversized exercise input" }, { status: 413 });
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Invalid exercise input" }, { status: 400 });
    }
    const data = input as Record<string,unknown>;
    if (typeof data.source_id !== "string" || data.source_id !== "AEGIS-EXERCISE-ONLY" ||
        typeof data.rainfall_mm_hour !== "number" || !Number.isFinite(data.rainfall_mm_hour) ||
        data.rainfall_mm_hour < 0 || data.rainfall_mm_hour > 500 ||
        typeof data.water_index !== "number" || !Number.isFinite(data.water_index) ||
        data.water_index < 0 || data.water_index > 100 ||
        typeof data.drainage_condition !== "string" || !DRAINAGE.has(data.drainage_condition) ||
        typeof data.observed_at !== "string" || !ZONED_DATE.test(data.observed_at) ||
        Number.isNaN(Date.parse(data.observed_at))) {
      return NextResponse.json({ error: "Invalid synthetic index fields" }, { status: 400 });
    }
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/risk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data), cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Illustrative index unavailable");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" ||
        !("kind" in result) || result.kind !== "synthetic_rule_demo" ||
        !("requires_human_verification" in result) || result.requires_human_verification !== true ||
        !("hazard_index" in result) || typeof result.hazard_index !== "number" ||
        result.hazard_index < 0 || result.hazard_index > 100) {
      throw new Error("Unsafe exercise index response");
    }
    return NextResponse.json({ ...result, real_world_probability: null,
      calibrated_prediction: false, operational_actions_enabled: false },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Illustrative risk computation unavailable" }, { status: 503 });
  }
}
