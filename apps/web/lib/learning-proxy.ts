/** Same-origin BFF for A8 post-event learning (/api/learning/...) and A9 exercise drills (/api/drills/...).
 * Bearer tokens stay server-side. Every write is Origin-checked and role-checked here, then again by the API
 * (which also enforces maker-checker independence, agency scope and the kill switch). Only allowlisted
 * fields are forwarded and only re-validated output is returned.
 */
import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "./auth-server";
import {
  buildDrills, buildLearning, cleanConfig, cleanDrill, cleanProposal, cleanReport, cleanScenarios, cleanWindow, isObject,
  type Built, type Rejection,
} from "./learning";

export type Area = "learning" | "drills";
const READ: Role[] = ["incident_operator", "incident_checker", "incident_auditor", "platform_admin"];
const MAX_BODY = 6000;
const CODE = /^[a-z][a-z0-9_]{1,40}$/;
const GENERIC: Record<number, string> = {
  400: "Request rejected", 401: "Secure operator sign-in required", 403: "Insufficient role", 404: "Not enabled or not found",
  409: "Conflict: the record changed or the action is not allowed", 422: "Request rejected", 429: "Too many requests", 503: "Service unavailable",
};

function failure(status: number, error: string, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Roles the BFF requires for a write, by its upstream path. Reads need any READ role. */
export function writeRoles(path: string): Role[] {
  if (/\/proposals\/[^/]+\/review$/.test(path)) return ["incident_checker", "platform_admin"];
  if (/\/proposals\/[^/]+\/apply$/.test(path)) return ["platform_admin"];
  if (/\/drills\/[^/]+\/respond$/.test(path)) return ["incident_operator", "incident_checker"];
  return ["incident_operator"];
}

function clean(area: Area, path: string, payload: unknown): unknown {
  if (area === "drills") {
    if (path.endsWith("/scenarios")) return cleanScenarios(payload);
    if (path.endsWith("/report")) return cleanReport(payload);
    if (path === "/v1/proactive/drills" && isObject(payload) && Array.isArray(payload.drills)) return { drills: payload.drills.slice(0, 30).map(cleanDrill).filter(Boolean) };
    return cleanDrill(payload);
  }
  if (path.endsWith("/config")) return cleanConfig(payload);
  if (path.endsWith("/scenarios")) return cleanScenarios(payload);
  if (path.endsWith("/windows") && isObject(payload) && Array.isArray(payload.windows)) return { windows: payload.windows.slice(0, 50).map(cleanWindow).filter(Boolean) };
  if (path.endsWith("/proposals") && isObject(payload) && Array.isArray(payload.proposals)) return { proposals: payload.proposals.slice(0, 50).map(cleanProposal).filter(Boolean) };
  if (/\/windows\/(close|replay|[0-9a-f-]{36})$/.test(path)) return cleanWindow(payload);
  return cleanProposal(payload);
}

export async function proxyLearning(request: Request, area: Area, segments: string[] = []): Promise<NextResponse> {
  let config: ReturnType<typeof configuration>;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const session = await readSession();
  if (!session) return failure(401, "Secure operator sign-in required");
  const isWrite = request.method !== "GET";
  if (request.method !== "GET" && request.method !== "POST") return failure(405, "Method not allowed");
  if (isWrite && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  if (!session.roles.some(role => READ.includes(role))) return failure(403, "Insufficient role");
  if (segments.length > 4 || segments.some(s => typeof s !== "string" || s.length > 80)) return failure(400, "Unknown route");

  let data: Record<string, unknown> | null = null;
  if (isWrite) {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return failure(413, "Payload too large");
    let parsed: unknown = {};
    if (raw.trim()) { try { parsed = JSON.parse(raw); } catch { return failure(400, "Invalid JSON body"); } }
    if (!isObject(parsed)) return failure(400, "Invalid payload");
    data = parsed;
  }
  const built: Built | Rejection = area === "learning" ? buildLearning(request.method, segments, data) : buildDrills(request.method, segments, data);
  if ("error" in built) return failure(400, built.error);
  if (isWrite && !session.roles.some(role => writeRoles(built.path).includes(role))) return failure(403, "Insufficient role");

  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + built.path, {
      method: built.method, body: built.body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { Authorization: "Bearer " + session.accessToken, ...(built.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    });
    if (!response.ok) {
      const raw = await response.json().catch(() => null) as unknown;
      const candidate = isObject(raw) && typeof raw.detail === "string" ? raw.detail : "";
      return failure(GENERIC[response.status] ? response.status : 502, GENERIC[response.status] ?? "Service error", CODE.test(candidate) ? candidate : undefined);
    }
    const output = clean(area, built.path, await response.json());
    if (!output) return failure(502, "Service returned an invalid response");
    return NextResponse.json(output, { status: response.status === 201 ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure(503, "Service unavailable");
  }
}

