/** Same-origin, authorized backend-for-frontend exercise workflow proxy. */
import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "./auth-server";

type Operation = "submit" | "approve" | "reject";
const ACTIONS = new Set(["internal_triage", "prepare_warning", "propose_dispatch"]);
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
function hasRole(roles: Role[], ...expected: Role[]): boolean {
  return roles.some((role) => expected.includes(role));
}
export async function proxyProposals(request: Request, proposalId?: string): Promise<NextResponse> {
  let config: ReturnType<typeof configuration>;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const session = await readSession();
  if (!session) return failure(401, "Secure operator sign-in required");
  if (proposalId && !UUID.test(proposalId)) return failure(400, "Invalid proposal identifier");
  const isWrite = request.method === "POST";
  if (isWrite && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  let body: string | undefined;
  if (isWrite) {
    const raw = await request.text();
    if (raw.length > 8000) return failure(413, "Proposal payload too large");
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return failure(400, "Invalid JSON body"); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return failure(400, "Invalid proposal payload");
    const data = payload as Record<string, unknown>;
    if (proposalId) {
      const operation = data.operation;
      if (!["submit", "approve", "reject"].includes(String(operation))) return failure(400, "Unsupported workflow operation");
      if (Object.keys(data).some((key) => !["operation", "rationale"].includes(key))) return failure(400, "Unexpected proposal attributes");
      const role = operation === "submit" ? "incident_operator" : "incident_checker";
      if (!hasRole(session.roles, role)) return failure(403, "Insufficient role");
      if (data.rationale !== undefined && (typeof data.rationale !== "string" || data.rationale.length > 2000)) return failure(400, "Invalid review rationale");
      body = JSON.stringify({ operation: operation as Operation, rationale: data.rationale });
    } else {
      if (!hasRole(session.roles, "incident_operator")) return failure(403, "Operator role required");
      if (Object.keys(data).some((key) => !["incident_id", "action_type", "rationale"].includes(key))) return failure(400, "Unexpected proposal attributes");
      if (typeof data.incident_id !== "string" || !UUID.test(data.incident_id) ||
          typeof data.action_type !== "string" || !ACTIONS.has(data.action_type) ||
          typeof data.rationale !== "string" || data.rationale.trim().length < 10 || data.rationale.length > 2000)
        return failure(400, "Invalid proposal fields");
      body = JSON.stringify({ incident_id: data.incident_id, action_type: data.action_type, rationale: data.rationale });
    }
  } else if (!hasRole(session.roles, "incident_operator", "incident_checker", "incident_auditor")) {
    return failure(403, "No workflow access");
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const endpoint = base + "/v1/exercise/proposals" + (proposalId ? "/" + proposalId + "/transition" : "");
    const response = await fetch(endpoint, {
      method: request.method,
      headers: { Authorization: "Bearer " + session.accessToken, ...(isWrite ? { "Content-Type": "application/json" } : {}) },
      body, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    const output = await response.json().catch(() => ({ error: "Exercise service returned an invalid response" }));
    return NextResponse.json(output, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure(503, "Exercise workflow service unavailable");
  }
}
