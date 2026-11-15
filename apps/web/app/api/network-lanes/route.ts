import { proxyNetworkLanes } from "../../../lib/network-registry-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return proxyNetworkLanes(); }
