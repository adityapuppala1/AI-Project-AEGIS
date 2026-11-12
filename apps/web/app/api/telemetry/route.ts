import { NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired } from "../../../lib/api-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const endpoint = (process.env.API_INTERNAL_URL || "http://localhost:8000") + "/v1/exercise/telemetry";
    const response = await fetch(endpoint, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("API unavailable");
    return NextResponse.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Exercise telemetry service unavailable" }, { status: 503 });
  }
}
