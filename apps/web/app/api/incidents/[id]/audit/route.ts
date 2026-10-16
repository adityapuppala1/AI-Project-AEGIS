import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid exercise case ID" }, { status: 400 });
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/incidents/" + id + "/audit", {
      cache: "no-store", signal: AbortSignal.timeout(7500),
    });
    if (response.status === 404) return NextResponse.json({ error: "Exercise case not found" }, { status: 404 });
    if (!response.ok) throw new Error("Audit snapshot unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" ||
        !("bundle_version" in data) || data.bundle_version !== "aegis.exercise.audit360.v1" ||
        !("source" in data) || data.source !== "synthetic_exercise" ||
        !("incident_id" in data) || data.incident_id !== id ||
        !("contains_real_agency_records" in data) || data.contains_real_agency_records !== false ||
        !("outbound_messages_sent" in data) || data.outbound_messages_sent !== false ||
        !("operational_actions_enabled" in data) || data.operational_actions_enabled !== false ||
        !("manifest_sha256" in data) || typeof data.manifest_sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.manifest_sha256) ||
        !("playbook_ref" in data) || data.playbook_ref !== "AEGIS-URBAN-FLOOD-EXERCISE-v0.1" ||
        !("incident_workspace" in data) || !data.incident_workspace ||
        typeof data.incident_workspace !== "object" ||
        !("evidence" in data.incident_workspace) ||
        !Array.isArray(data.incident_workspace.evidence) ||
        !("timeline" in data.incident_workspace) ||
        !Array.isArray(data.incident_workspace.timeline) ||
        !("agency_task_board" in data) || !data.agency_task_board ||
        typeof data.agency_task_board !== "object" ||
        !("tasks" in data.agency_task_board) ||
        !Array.isArray(data.agency_task_board.tasks) ||
        !("scripted_task_events" in data) || !Array.isArray(data.scripted_task_events) ||
        data.scripted_task_events.length > 200 ||
        data.scripted_task_events.some((event: unknown) =>
          !event || typeof event !== "object" || !("synthetic" in event) || event.synthetic !== true)) {
      throw new Error("Audit data classification could not be verified");
    }
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="aegis-exercise-audit-${id}.json"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Synthetic audit export unavailable" }, { status: 503 });
  }
}
