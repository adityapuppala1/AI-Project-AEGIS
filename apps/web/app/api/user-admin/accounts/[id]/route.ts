import { proxyUserAdmin } from "../../../../../lib/user-admin-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Params) { return proxyUserAdmin(request, "edit", (await params).id); }
