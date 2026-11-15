import { proxyProactive } from "../../../../../../../lib/proactive-proxy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// proxyProactive checks the request origin, the session and the platform_admin role before forwarding.
export async function POST(request: Request, { params }: { params: Promise<{ theme: string }> }) {
  return proxyProactive(request, "bhuvan_token_test", (await params).theme);
}
