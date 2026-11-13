// Browser proxy for staff email notices (docs/COMMUNICATION_CHANNELS.md). It forwards to the IndTrana API only; the API
// (services/api/app/staff_messages.py) is the one place that sends, and it repeats every check made here. The email
// address is never accepted from the browser: the API reads it from the verified sign-in token. Only the opt-in flag
// travels in a body. Role lists mirror the API: any staff role for the preference and the self-test, platform_admin
// for the message log.
import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "./auth-server";

export type StaffEmailRoute = "preference" | "test" | "log";
export const STAFF_ROLES: Role[] = ["incident_operator", "incident_checker", "incident_auditor", "department_operator", "response_team", "platform_admin"];
const ADMIN_ROLES: Role[] = ["platform_admin"];
const METHODS: Record<StaffEmailRoute, string[]> = { preference: ["GET", "PUT"], test: ["POST"], log: ["GET"] };
const MAX_BODY = 200;
const headers = { "Cache-Control": "no-store" };
const failure = (status: number, error: string, code?: string) => NextResponse.json(code ? { error, code } : { error }, { status, headers });

export async function proxyStaffEmail(request: Request, route: StaffEmailRoute) {
  let config;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const session = await readSession();
  if (!session?.accessToken) return failure(401, "Sign-in required", "SIGN_IN_REQUIRED");
  if (!METHODS[route].includes(request.method)) return failure(405, "Unsupported operation");
  const allowed = route === "log" ? ADMIN_ROLES : STAFF_ROLES;
  if (!allowed.some(role => (session.roles ?? []).includes(role))) return failure(403, "Not permitted for your role or agency", "FORBIDDEN");
  const write = request.method !== "GET";
  if (write && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  if (new URL(request.url).search) return failure(400, "No query parameters are accepted");

  let body: string | undefined;
  if (request.method === "PUT") {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return failure(413, "Request payload too large");
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return failure(400, "Send only { opted_in: true or false }"); }
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).join() !== "opted_in" ||
        typeof (data as { opted_in: unknown }).opted_in !== "boolean") return failure(400, "Send only { opted_in: true or false }");
    body = JSON.stringify({ opted_in: (data as { opted_in: boolean }).opted_in });
  }
  try {
    const response = await fetch((process.env.API_INTERNAL_URL || "http://localhost:8000") + "/v1/staff-messages/" + route, {
      method: request.method, body, cache: "no-store", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${session.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    });
    if (response.status === 401) return failure(401, "Sign-in required", "SIGN_IN_REQUIRED");
    if (response.status === 403) return failure(403, "Not permitted for your role or agency", "FORBIDDEN");
    if (response.status === 404) return failure(404, "Email notices are switched off on this server", "host_switch_off");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof data?.detail === "string" && /^[a-z_]{1,48}$/.test(data.detail) ? data.detail : "staff_messages_unavailable";
      return failure(response.status, "Email notices could not complete this request", code);
    }
    return NextResponse.json(data, { status: response.status, headers });
  } catch { return failure(503, "Email notice service unavailable. Refresh before retrying; a test may already have been sent.", "staff_messages_unavailable"); }
}
