import { proxyStaffEmail } from "../../../../lib/staff-email-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyStaffEmail(request, "preference"); }
export async function PUT(request: Request) { return proxyStaffEmail(request, "preference"); }
