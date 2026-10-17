/** Same-origin, authorized backend-for-frontend exercise workflow proxy. */
import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "./auth-server";

type Operation = "submit" | "approve" | "reject" | "simulate" | "prepare_tasks" | "acknowledge_task" | "close_task" | "reassign_task" | "start_assistance" | "advance_assistance" | "cancel_assistance";
const ACTIONS = new Set(["internal_triage", "prepare_warning", "propose_dispatch"]);
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
function hasRole(roles: Role[], ...expected: Role[]): boolean {
  return roles.some((role) => expected.includes(role));
}
export async function proxyProposals(request: Request, proposalId?: string, exportKind?: "audit" | "cap-draft"): Promise<NextResponse> {
  let config: ReturnType<typeof configuration>;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const session = await readSession();
  if (!session) return failure(401, "Secure operator sign-in required");
  if (proposalId && !UUID.test(proposalId)) return failure(400, "Invalid proposal identifier");
  const isWrite = request.method === "POST";
  if (isWrite && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  let body: string | undefined;
  let timeoutMs = 8000;
  if (isWrite) {
    const raw = await request.text();
    if (raw.length > 8000) return failure(413, "Proposal payload too large");
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return failure(400, "Invalid JSON body"); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return failure(400, "Invalid proposal payload");
    const data = payload as Record<string, unknown>;
    if (proposalId) {
      const operation = data.operation;
      if (typeof operation !== "string" || !["submit", "approve", "reject", "simulate", "prepare_tasks", "acknowledge_task", "close_task", "reassign_task", "start_assistance", "advance_assistance", "cancel_assistance"].includes(operation)) return failure(400, "Unsupported workflow operation");
      if (Object.keys(data).some((key) => !["operation", "rationale", "task_id", "assistance_step", "target_department", "expected_assignment_version"].includes(key))) return failure(400, "Unexpected proposal attributes");
      const role = ["submit", "simulate", "prepare_tasks", "acknowledge_task", "close_task", "reassign_task", "start_assistance", "advance_assistance", "cancel_assistance"].includes(String(operation)) ? "incident_operator" : "incident_checker";
      if (!hasRole(session.roles, role)) return failure(403, "Insufficient role");
      if (data.rationale !== undefined && (typeof data.rationale !== "string" || data.rationale.length > 2000)) return failure(400, "Invalid review rationale");
      if (operation === "cancel_assistance" && (typeof data.rationale !== "string" || data.rationale.trim().length < 10)) return failure(400, "Cancellation rationale required");
      const taskOperation = operation === "acknowledge_task" || operation === "close_task" || operation === "reassign_task";
      if (taskOperation) {
        if (typeof data.task_id !== "string" || !["control_room", "infrastructure", "communications"].includes(data.task_id) ||
            typeof data.rationale !== "string" || data.rationale.trim().length < 10)
          return failure(400, "Task identifier and explanatory rationale required");
      } else if (data.task_id !== undefined) return failure(400, "Unexpected task identifier");
      const reassignment = operation === "reassign_task";
      if (reassignment) {
        if (typeof data.target_department !== "string" || !["control_room", "infrastructure", "communications"].includes(data.target_department) ||
          !Number.isSafeInteger(data.expected_assignment_version) || Number(data.expected_assignment_version) < 0) return failure(400, "Expected assignment version and target department required");
      } else if (data.target_department !== undefined || data.expected_assignment_version !== undefined) return failure(400, "Unexpected assignment fields");
      const assistanceAdvance = operation === "advance_assistance";
      if (assistanceAdvance) {
        if (typeof data.assistance_step !== "string" || !["gather_references", "check_quality", "validate_draft"].includes(data.assistance_step)) return failure(400, "Valid assistance step required");
      } else if (data.assistance_step !== undefined) return failure(400, "Unexpected assistance step");
      body = JSON.stringify({ operation: operation as Operation, rationale: data.rationale,
        ...(taskOperation ? { task_id: data.task_id } : {}), ...(reassignment ? { target_department: data.target_department, expected_assignment_version: data.expected_assignment_version } : {}), ...(assistanceAdvance ? { assistance_step: data.assistance_step } : {}) });
    } else {
      if (!hasRole(session.roles, "incident_operator")) return failure(403, "Operator role required");
      if (Object.keys(data).some((key) => !["incident_id", "action_type", "rationale", "include_review_focus"].includes(key))) return failure(400, "Unexpected proposal attributes");
      if (typeof data.incident_id !== "string" || !UUID.test(data.incident_id) ||
          typeof data.action_type !== "string" || !ACTIONS.has(data.action_type) ||
          typeof data.rationale !== "string" || data.rationale.trim().length < 10 || data.rationale.length > 2000)
        return failure(400, "Invalid proposal fields");
      if (data.include_review_focus !== undefined && typeof data.include_review_focus !== "boolean") return failure(400, "Invalid review focus choice");
      if (data.include_review_focus === true) timeoutMs = 30000;
      body = JSON.stringify({ incident_id: data.incident_id, action_type: data.action_type, rationale: data.rationale,
        ...(data.include_review_focus !== undefined ? { include_review_focus: data.include_review_focus } : {}) });
    }
  } else if (!hasRole(session.roles, "incident_operator", "incident_checker", "incident_auditor")) {
    return failure(403, "No workflow access");
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const endpoint = base + "/v1/exercise/proposals" + (proposalId ? "/" + proposalId + (exportKind ? "/" + exportKind : "/transition") : "");
    const response = await fetch(endpoint, {
      method: request.method,
      headers: { Authorization: "Bearer " + session.accessToken, ...(isWrite ? { "Content-Type": "application/json" } : {}) },
      body, cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
    });
    if (exportKind === "cap-draft" && response.ok) {
      if (!response.headers.get("content-type")?.startsWith("application/xml"))
        return failure(502, "Exercise service returned an invalid XML artifact");
      return new NextResponse(await response.text(), { headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="aegis-exercise-${proposalId}-draft.xml"`,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      } });
    }
    const output = await response.json().catch(() => ({ error: "Exercise service returned an invalid response" }));
    return NextResponse.json(output, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure(503, "Exercise workflow service unavailable. Refresh the queue before retrying a save; it may have completed.");
  }
}
