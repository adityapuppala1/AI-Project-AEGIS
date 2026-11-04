import { proxyLearning } from "../../../../lib/learning-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, { params }: Context) { return proxyLearning(request, "learning", (await params).path ?? []); }
export async function POST(request: Request, { params }: Context) { return proxyLearning(request, "learning", (await params).path ?? []); }
