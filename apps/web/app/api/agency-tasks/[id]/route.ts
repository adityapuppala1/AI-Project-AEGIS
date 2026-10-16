import { NextResponse } from "next/server";
import { isSyntheticTaskPayload } from "../../../../lib/agency-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid synthetic task ID" }, { status: 400 });
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/agency-tasks/" + id, {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (response.status === 404) return NextResponse.json({ error: "Synthetic task not found" }, { status: 404 });
    if (!response.ok) throw new Error("Exercise task detail unavailable");
    const data: unknown = await response.json();
    if (!isSyntheticTaskPayload(data) ||
        !("task" in data) || !data.task || typeof data.task !== "object" ||
        !("synthetic" in data.task) || data.task.synthetic !== true ||
        !("id" in data.task) || data.task.id !== id ||
        !("events" in data) || !Array.isArray(data.events) ||
        data.events.length > 40 || data.events.some((event: unknown) =>
          !event || typeof event !== "object" || !("synthetic" in event) || event.synthetic !== true)) {
      throw new Error("Unexpected scripted task history");
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Synthetic task history unavailable" }, { status: 503 });
  }
}
