import { proxyNetworkRegistry } from "../../../../lib/network-registry-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyNetworkRegistry(request); }
export async function POST(request: Request) { return proxyNetworkRegistry(request); }
export async function PUT(request: Request) { return proxyNetworkRegistry(request); }
