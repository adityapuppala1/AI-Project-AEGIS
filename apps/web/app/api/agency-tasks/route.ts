import { NextRequest, NextResponse } from "next/server";
import { isSyntheticTaskPayload } from "../../../lib/agency-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set(["prepared", "acknowledged", "closed"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const incident = params.get("incident_id");
  const state = params.get("state");
  const limit = params.get("limit") ?? "50";
  if ((incident !== null && !UUID.test(incident)) ||
      (state !== null && !STATES.has(state)) ||
      !/^[1-9]\d?$/.test(limit) || Number(limit) > 50) {
    return NextResponse.json({ error: "Invalid synthetic task filter" }, { status: 400 });
  }
  try {
    const query = new URLSearchParams({ limit });
    if (incident) query.set("incident_id", incident);
    if (state) query.set("state", state);
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/agency-tasks?" + query.toString(), {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Exercise task service unavailable");
    const data: unknown = await response.json();
    if (!isSyntheticTaskPayload(data) ||
        !("tasks" in data) || !Array.isArray(data.tasks) ||
        data.tasks.length > 50 || data.tasks.some((item: unknown) =>
          !item || typeof item !== "object" || !("synthetic" in item) || item.synthetic !== true)) {
      throw new Error("Unexpected task classification");
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Synthetic task board unavailable" }, { status: 503 });
  }
}
