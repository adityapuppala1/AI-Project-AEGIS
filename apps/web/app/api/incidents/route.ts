import { NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired } from "../../../lib/api-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const endpoint = (process.env.API_INTERNAL_URL || "http://localhost:8000") + "/v1/exercise/incidents";
    const response = await fetch(endpoint, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("API unavailable");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid API response");
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Exercise incident service unavailable" }, { status: 503 });
  }
}
