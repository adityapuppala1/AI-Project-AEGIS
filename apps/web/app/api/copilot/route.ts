import { proxyAssist } from "../../../lib/assist-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) { return proxyAssist(request, "copilot"); }
