import { proxyBrandAdmin } from "../../../../../lib/brand-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyBrandAdmin(request, "reset"); }
