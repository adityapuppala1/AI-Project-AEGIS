// Browser proxy for the team response loop (docs/RESPONSE_LOOP.md). Exercise only: nothing here calls, texts,
// emails or pushes to anyone; it forwards to the AEGIS API only. These checks mirror the server role rules as a
// convenience layer; services/api/app/response_routes.py stays the control. Scope (agency, department, team, actor)
// travels only inside the signed access token, never in a body or query this proxy forwards.
import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "./auth-server";
import { isResponseTeamId } from "./response-teams";

export type ResponseRoute = "teams" | "requests" | "reports" | "alerts";
const READERS: Role[] = ["incident_operator", "incident_checker", "incident_auditor"];
const DEPARTMENTS = ["control_room", "infrastructure", "communications"];
const TEAM_KINDS = ["accepted", "declined", "en_route", "on_site", "completed", "situation_report", "needs_support"];
const DESK_KINDS = [...TEAM_KINDS, "stood_down", "desk_handled"];
const CODES = ["already_committed", "out_of_area", "not_equipped", "off_shift", "other", "as_expected", "worse_than_expected",
  "better_than_expected", "access_blocked", "nothing_found", "more_people", "equipment", "medical", "transport"];
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const MAX_BODY = 4000;
const headers = { "Cache-Control": "no-store" };
const failure = (status: number, error: string) => NextResponse.json({ error }, { status, headers });

type View = "team" | "department" | "reader" | "none";
/** Same order as the server: administrators and tokens holding both team and desk roles get nothing here. */
export function responseView(session: { roles: string[]; departmentId?: string; teamId?: string }): View {
  const roles = session.roles;
  if (roles.includes("platform_admin")) return "none";
  const team = roles.includes("response_team"), desk = roles.includes("department_operator");
  if (team && desk) return "none";
  if (team) return isResponseTeamId(session.teamId) ? "team" : "none";
  if (desk) return session.departmentId && DEPARTMENTS.includes(session.departmentId) ? "department" : "none";
  return READERS.some(role => roles.includes(role)) ? "reader" : "none";
}

const validNote = (value: unknown) => typeof value === "string" && value.length <= 1000 && value.trim().length >= 10 &&
  value.trim().length <= 1000 && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value); // same categories as the API
const validVersion = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const onlyKeys = (data: Record<string, unknown>, allowed: string[]) => Object.keys(data).every(key => allowed.includes(key));

async function readJson(request: Request): Promise<Record<string, unknown> | string> {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return "too_large";
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" && !Array.isArray(data) ? data : "invalid";
  } catch { return "invalid"; }
}

export async function proxyResponse(request: Request, route: ResponseRoute, requestId?: string) {
  let config;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const session = await readSession();
  if (!session) return failure(401, "Secure sign-in required");
  const view = responseView(session);
  const write = request.method === "POST";
  const allowedMethod = route === "requests" ? ["GET", "POST"] : route === "reports" ? ["POST"] : ["GET"];
  if (!allowedMethod.includes(request.method) || (route === "reports") !== (requestId !== undefined)) return failure(405, "Unsupported operation");
  if (write && !sameOrigin(request, config)) return failure(403, "Invalid request origin");

  let path = "/v1/exercise/response/" + route;
  let body: string | undefined;
  const query = new URL(request.url).searchParams;
  if (route === "alerts") {
    // Any signed-in role; the API answers 0 for roles without requests.
  } else if (route === "teams") {
    if (view !== "department") return failure(403, "Verified department role required");
    const proposalId = query.get("proposal_id"), taskId = query.get("task_id");
    if (!proposalId || !UUID.test(proposalId) || !taskId || !DEPARTMENTS.includes(taskId) ||
        [...query.keys()].some(key => key !== "proposal_id" && key !== "task_id")) return failure(400, "Proposal and task required");
    path += "?" + new URLSearchParams({ proposal_id: proposalId, task_id: taskId }).toString();
  } else if (route === "requests" && !write) {
    if (view === "none") return failure(403, "Insufficient role for team requests");
    const incidentId = query.get("incident_id");
    if ([...query.keys()].some(key => key !== "incident_id") || (incidentId !== null && !UUID.test(incidentId))) return failure(400, "Invalid incident filter");
    if (incidentId) path += "?" + new URLSearchParams({ incident_id: incidentId }).toString();
  } else if (route === "requests") {
    if (view !== "department") return failure(403, "Verified department role required");
    const data = await readJson(request);
    if (data === "too_large") return failure(413, "Request payload too large");
    if (typeof data === "string" || !onlyKeys(data, ["proposal_id", "task_id", "team_id", "expected_assignment_version", "note"]) ||
        typeof data.proposal_id !== "string" || !UUID.test(data.proposal_id) ||
        typeof data.task_id !== "string" || !DEPARTMENTS.includes(data.task_id) || !isResponseTeamId(data.team_id) ||
        !validVersion(data.expected_assignment_version) || !validNote(data.note)) return failure(400, "Task, team, version and a 10 to 1000 character note required");
    body = JSON.stringify({ proposal_id: data.proposal_id, task_id: data.task_id, team_id: data.team_id,
      expected_assignment_version: data.expected_assignment_version, note: data.note });
  } else {
    if (view !== "team" && view !== "department") return failure(403, "Verified team or department role required");
    if (!UUID.test(requestId!)) return failure(400, "Invalid request identifier");
    path = `/v1/exercise/response/requests/${requestId}/reports`;
    const data = await readJson(request);
    if (data === "too_large") return failure(413, "Report payload too large");
    const kinds = view === "team" ? TEAM_KINDS : DESK_KINDS;
    if (typeof data === "string" || !onlyKeys(data, ["kind", "expected_version", "note", "code"]) ||
        typeof data.kind !== "string" || !kinds.includes(data.kind) || !validVersion(data.expected_version) ||
        !validNote(data.note) || (data.code !== undefined && data.code !== null &&
          (typeof data.code !== "string" || !CODES.includes(data.code)))) return failure(400, "Report kind, version and a 10 to 1000 character note required");
    body = JSON.stringify({ kind: data.kind, expected_version: data.expected_version, note: data.note,
      ...(typeof data.code === "string" ? { code: data.code } : {}) });
  }
  try {
    const response = await fetch((process.env.API_INTERNAL_URL || "http://localhost:8000") + path, {
      method: request.method, body, cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${session.accessToken}`, ...(write ? { "Content-Type": "application/json" } : {}) },
    });
    return NextResponse.json(await response.json(), { status: response.status, headers });
  } catch { return failure(503, "Team response service unavailable. Refresh before retrying; the action may have completed."); }
}
