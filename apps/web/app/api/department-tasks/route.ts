import { proxyDepartmentTasks } from "../../../lib/department-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyDepartmentTasks(request); }
