import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fields = new Set(["search", "status", "sort", "direction", "page", "page_size"]);

export async function GET(request: NextRequest) {
  try {
    // Explicit parameter allowlist: never pass arbitrary client parameters to the API.
    const input = request.nextUrl.searchParams;
    const params = new URLSearchParams();
    for (const field of fields) {
      const value = input.get(field);
      if (value !== null) params.set(field, value);
    }
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/incidents/query?" + params.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: "Invalid filter or incident service unavailable" }, { status: response.status === 422 ? 422 : 503 });
    }
    if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) {
      throw new Error("Invalid incident page");
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Incident search temporarily unavailable" }, { status: 503 });
  }
}
