import { proxyDepartmentTasks } from "../../../../../lib/department-proxy";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxyDepartmentTasks(request, (await context.params).id);
}
