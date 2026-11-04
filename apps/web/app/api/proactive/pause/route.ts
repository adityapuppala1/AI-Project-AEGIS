import { proxyProactive } from "../../../../lib/proactive-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return proxyProactive(request, "pause_get"); }
export async function PUT(request: Request) { return proxyProactive(request, "pause_set"); }
