import { proxyUserAdmin } from "../../../../lib/user-admin-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyUserAdmin(request, "accounts"); }
export async function POST(request: Request) { return proxyUserAdmin(request, "create"); }
