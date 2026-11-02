import { proxyProactive } from "../../../../../../lib/proactive-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyProactive(request, "run_advance", (await params).id);
}
