import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin } from "./auth-server";
const failure = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
export async function proxyDepartmentTasks(request: Request, proposalId?: string) {
  let config;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const session = await readSession();
  if (!session) return failure(401, "Secure department sign-in required");
  if (!session.roles.includes("department_operator") || !session.departmentId ||
      !["control_room", "infrastructure", "communications"].includes(session.departmentId)) return failure(403, "Verified department role required");
  const write = request.method === "POST";
  if ((write && !proposalId) || (!write && (request.method !== "GET" || proposalId))) return failure(405, "Unsupported operation");
  let body: string | undefined;
  if (write) {
    if (!sameOrigin(request, config)) return failure(403, "Invalid request origin");
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(proposalId!)) return failure(400, "Invalid proposal identifier");
    const raw = await request.text();
    if (raw.length > 8000) return failure(413, "Task payload too large");
    let data;
    try { data = JSON.parse(raw); } catch { return failure(400, "Invalid JSON"); }
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        Object.keys(data).some(key => !["operation", "rationale"].includes(key)) ||
        !["acknowledge_task", "close_task"].includes(data.operation) ||
        typeof data.rationale !== "string" || data.rationale.trim().length < 10 || data.rationale.length > 2000) return failure(400, "Task operation and explanatory rationale required");
    body = JSON.stringify({ operation: data.operation, rationale: data.rationale });
  }
  try {
    const response = await fetch((process.env.API_INTERNAL_URL || "http://localhost:8000") +
      "/v1/exercise/department-tasks" + (write ? `/${proposalId}/transition` : ""), {
      method: request.method, body, cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${session.accessToken}`, ...(write ? { "Content-Type": "application/json" } : {}) },
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch { return failure(503, "Department service unavailable. Refresh before retrying; the action may have completed."); }
}
