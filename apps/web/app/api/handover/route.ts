import { proxyAssist } from "../../../lib/assist-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return proxyAssist(request, "handover"); }
