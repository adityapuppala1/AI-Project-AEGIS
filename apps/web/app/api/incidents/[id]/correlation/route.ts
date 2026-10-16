import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const radius = request.nextUrl.searchParams.get("radius_m") || "3000";
  if (!UUID.test(id) || !/^(100|[1-9]\d{2,3})$/.test(radius) ||
      Number(radius) < 100 || Number(radius) > 5000) {
    return NextResponse.json({ error: "Invalid exercise incident or radius" }, { status: 400 });
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(
      base + "/v1/exercise/incidents/" + id + "/correlation?radius_m=" + radius,
      { cache: "no-store", signal: AbortSignal.timeout(6000) },
    );
    if (response.status === 404) {
      return NextResponse.json({ error: "Synthetic incident not found" }, { status: 404 });
    }
    if (!response.ok) throw new Error("Correlation service unavailable");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" ||
        !("source" in payload) || payload.source !== "synthetic_exercise" ||
        !("analysis_kind" in payload) || payload.analysis_kind !== "geographic_proximity_only" ||
        !("operational_actions_enabled" in payload) || payload.operational_actions_enabled !== false ||
        !("validated_risk_model" in payload) || payload.validated_risk_model !== false ||
        !("nearby_sources" in payload) || !Array.isArray(payload.nearby_sources) ||
        !("nearby_assets" in payload) || !Array.isArray(payload.nearby_assets)) {
      throw new Error("Unexpected correlation response");
    }
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Synthetic geospatial service unavailable" }, { status: 503 });
  }
}
