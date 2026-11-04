import { proxyProactive } from "../../../../../../lib/proactive-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyProactive(request, "run_observability", (await params).id);
}
