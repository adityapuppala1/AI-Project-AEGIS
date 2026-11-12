import { proxyResponse } from "../../../../../../lib/response-proxy";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxyResponse(request, "reports", (await context.params).id);
}
