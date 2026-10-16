import { NextResponse } from "next/server";
import { configuration, readSession } from "../../../../lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const operator = await readSession();
  let configured = false;
  try { configured = configuration() !== null; } catch { /* misconfigured provider remains disabled */ }
  return NextResponse.json(operator ?
    { authenticated: true, configured, subject: operator.subject, agencyId: operator.agencyId, roles: operator.roles, expiresAt: operator.exp } :
    { authenticated: false, configured },
    { headers: { "Cache-Control": "no-store" } });
}
