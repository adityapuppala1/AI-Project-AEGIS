import { publicLogo } from "../../../../lib/brand-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Public by design (lib/session-gate.ts): the logo image only, with nosniff and a deny-all policy.
export async function GET(request: Request) { return publicLogo(request); }
