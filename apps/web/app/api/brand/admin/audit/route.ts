import { proxyBrandAdmin } from "../../../../../lib/brand-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyBrandAdmin(request, "audit"); }
