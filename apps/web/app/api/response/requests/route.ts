import { proxyResponse } from "../../../../lib/response-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyResponse(request, "requests"); }
export async function POST(request: Request) { return proxyResponse(request, "requests"); }
