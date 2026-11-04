import { proxyProactive } from "../../../../lib/proactive-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) { return proxyProactive(request, "run_create"); }
export async function GET(request: Request) { return proxyProactive(request, "run_list"); }
