import { proxyBrandAdmin } from "../../../../../lib/brand-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PUT(request: Request) { return proxyBrandAdmin(request, "name"); }
