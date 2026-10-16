import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid source ID" }, { status: 400 });
  const limit = request.nextUrl.searchParams.get("limit") || "24";
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 48) {
    return NextResponse.json({ error: "Invalid history limit" }, { status: 400 });
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/sources/" + id + "/history?limit=" + limit, {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (response.status === 404) return NextResponse.json({ error: "Exercise source not found" }, { status: 404 });
    if (!response.ok) throw new Error("Source history service unavailable");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" ||
        !("source" in payload) || payload.source !== "synthetic_exercise" ||
        !("samples" in payload) || !Array.isArray(payload.samples)) throw new Error("Invalid source history");
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Exercise source history unavailable" }, { status: 503 });
  }
}
