/** Same-origin BFF for the read-only shift-handover brief (GET) and operator copilot (POST).
 * Bearer tokens stay server-side. The copilot POST is Origin-checked; only a validated question is forwarded,
 * and only re-validated, cited output is returned. Neither route can write anything.
 */
import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "./auth-server";
import { cleanCopilot, cleanHandover, isObject, validateQuestion } from "./operator-assist";

export type AssistRoute = "handover" | "copilot";
const READ_ROLES: Role[] = ["incident_operator", "incident_checker", "incident_auditor", "platform_admin"];
const MAX_BODY = 4000;
const CODE = /^[a-z][a-z0-9_]{1,40}$/;
const GENERIC: Record<number, string> = {
  400: "Request rejected", 401: "Secure operator sign-in required", 403: "Insufficient role", 404: "Not found",
  422: "Question rejected", 429: "Too many requests", 503: "Assistant sources unavailable",
};

function failure(status: number, error: string, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function proxyAssist(request: Request, route: AssistRoute): Promise<NextResponse> {
  let config: ReturnType<typeof configuration>;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const session = await readSession();
  if (!session) return failure(401, "Secure operator sign-in required");
  const expected = route === "copilot" ? "POST" : "GET";
  if (request.method !== expected) return failure(405, "Method not allowed");
  if (route === "copilot" && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  if (!session.roles.some(role => READ_ROLES.includes(role))) return failure(403, "Insufficient role");

  let path: string, body: string | undefined;
  if (route === "handover") {
    const raw = new URL(request.url).searchParams.get("hours") ?? "12";
    const hours = /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
    if (hours < 1 || hours > 72) return failure(400, "Hours must be 1-72");
    path = `/v1/exercise/handover?hours=${hours}`;
  } else {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return failure(413, "Payload too large");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return failure(400, "Invalid JSON body"); }
    if (!isObject(parsed) || Object.keys(parsed).some(key => key !== "question")) return failure(400, "Only a question is accepted");
    const question = validateQuestion(parsed.question);
    if (!question) return failure(400, "Ask a question of 3-300 characters without control characters");
    path = "/v1/copilot/ask"; body = JSON.stringify({ question });
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + path, {
      method: expected, body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(25000),
      headers: { Authorization: "Bearer " + session.accessToken, ...(body ? { "Content-Type": "application/json" } : {}) },
    });
    if (!response.ok) {
      const raw = await response.json().catch(() => null) as unknown;
      const candidate = isObject(raw) && typeof raw.detail === "string" ? raw.detail : "";
      return failure(GENERIC[response.status] ? response.status : 502, GENERIC[response.status] ?? "Assistant service error", CODE.test(candidate) ? candidate : undefined);
    }
    const payload = await response.json() as unknown;
    const output = route === "handover" ? cleanHandover(payload) : cleanCopilot(payload);
    if (!output) return failure(502, "Assistant returned an invalid response");
    return NextResponse.json(output, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure(503, "Assistant sources unavailable");
  }
}
