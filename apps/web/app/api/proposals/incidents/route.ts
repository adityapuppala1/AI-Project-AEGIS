/** Protected BFF: agency-scoped synthetic cases eligible for the approval form. */
import { NextResponse } from "next/server";
import { configuration, readSession } from "../../../../lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let configured: ReturnType<typeof configuration>;
  try { configured = configuration(); }
  catch { return NextResponse.json({ error: "Identity provider configuration invalid" }, { status: 503 }); }
  if (!configured) return NextResponse.json({ error: "Identity provider not configured" }, { status: 503 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Secure operator sign-in required" }, { status: 401 });
  if (!session.roles.some(role => ["incident_operator", "incident_checker", "incident_auditor"].includes(role))) {
    return NextResponse.json({ error: "No agency workflow role" }, { status: 403 });
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/proposals/incidents", {
      method: "GET",
      headers: { Authorization: "Bearer " + session.accessToken },
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: "Agency incident registry unavailable" },
        { status: response.status === 401 || response.status === 403 ? response.status : 503 });
    }
    if (!Array.isArray(body)) throw new Error("Unexpected eligible incident response");
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Agency incident registry unavailable" }, { status: 503 });
  }
}
