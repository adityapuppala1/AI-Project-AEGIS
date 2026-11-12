import { proxyStaffEmail } from "../../../../lib/staff-email-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyStaffEmail(request, "test"); }
