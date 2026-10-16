import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const radius = request.nextUrl.searchParams.get("radius_m") ?? "3000";
  if (!UUID.test(id) || !/^[1-9]\d{2,3}$/.test(radius) ||
      Number(radius) < 100 || Number(radius) > 5000) {
    return NextResponse.json({ error: "Invalid exercise incident or radius" }, { status: 400 });
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(
      base + "/v1/exercise/incidents/" + id + "/readiness?radius_m=" + radius,
      { cache: "no-store", signal: AbortSignal.timeout(6000) },
    );
    if (response.status === 404) {
      return NextResponse.json({ error: "Synthetic case not found" }, { status: 404 });
    }
    if (!response.ok) throw new Error("Exercise assessment service unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" ||
        !("source" in data) || data.source !== "synthetic_exercise" ||
        !("incident_id" in data) || data.incident_id !== id ||
        !("assessment_kind" in data) || data.assessment_kind !== "explainable_context_checklist_only" ||
        !("model_eligible_for_real_forecast" in data) || data.model_eligible_for_real_forecast !== false ||
        !("real_world_risk_probability" in data) || data.real_world_risk_probability !== null ||
        !("real_world_asset_impact_known" in data) || data.real_world_asset_impact_known !== false ||
        !("operational_actions_enabled" in data) || data.operational_actions_enabled !== false ||
        !("needs_accountable_human_review" in data) || data.needs_accountable_human_review !== true ||
        !("reasons" in data) || !Array.isArray(data.reasons) ||
        !("playbook" in data) || !data.playbook || typeof data.playbook !== "object" ||
        !("version" in data.playbook) ||
        data.playbook.version !== "AEGIS-URBAN-FLOOD-EXERCISE-v0.1" ||
        !("operational_actions_enabled" in data.playbook) ||
        data.playbook.operational_actions_enabled !== false) {
      throw new Error("Unexpected or unsafe assessment classification");
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Synthetic assessment currently unavailable" }, { status: 503 });
  }
}
