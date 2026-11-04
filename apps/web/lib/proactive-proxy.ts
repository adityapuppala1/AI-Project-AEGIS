/** Same-origin backend-for-frontend proxy for the proactive multi-hazard API.
 * Bearer tokens stay server-side; secrets are forwarded once and never logged or echoed.
 */
import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "./auth-server";
import {
  cleanAudit, cleanConnector, cleanConnectors, cleanHistory, cleanPause, cleanRefresh, cleanRun, cleanRunList, cleanTestResult, cleanTriggersConfig, cleanWatch,
  isConnectorId, isObject, isRunStep, isUuid,
} from "./proactive";

export type ProactiveRoute =
  | "connectors" | "connector_save" | "connector_test" | "connector_audit"
  | "watch" | "watch_history" | "watch_refresh" | "triggers_config"
  | "run_create" | "run_list" | "run_get" | "run_advance" | "run_cancel" | "run_cap"
  | "pause_get" | "pause_set";

const MAX_BODY = 8000;
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
const SETTING_KEY = /^[a-z][a-z0-9_]{0,59}$/;
const SECRET_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const CODE = /^[a-z][a-z0-9_]{1,40}$/;
const PUBLIC_ROUTES = new Set<ProactiveRoute>(["watch", "watch_history", "triggers_config"]);

function failure(status: number, error: string, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}
const hasRole = (roles: Role[], ...expected: Role[]) => roles.some(role => expected.includes(role));

function rolesFor(route: ProactiveRoute): Role[] {
  if (route === "connectors" || route === "connector_save" || route === "connector_test" || route === "connector_audit") return ["platform_admin"];
  if (route === "watch_refresh") return ["incident_operator", "platform_admin"];
  // Kill switch: any signed-in operator may read it; only platform_admin may change it.
  if (route === "pause_get") return ["incident_operator", "incident_checker", "incident_auditor", "department_operator", "platform_admin"];
  if (route === "pause_set") return ["platform_admin"];
  return ["incident_operator"];
}

type Built = { path: string; method: "GET" | "POST" | "PUT"; body?: string } | { error: Response };
const bad = (message: string): { error: Response } => ({ error: failure(400, message) });

function validateSave(data: Record<string, unknown>): string | { error: Response } {
  if (Object.keys(data).some(key => !["expected_version", "enabled", "settings", "secrets"].includes(key))) return bad("Unexpected connector attributes");
  if (!Number.isSafeInteger(data.expected_version) || Number(data.expected_version) < 0) return bad("Valid expected version required");
  if (typeof data.enabled !== "boolean") return bad("Enabled must be true or false");
  const settings: Record<string, string | number | boolean> = {};
  if (data.settings !== undefined) {
    if (!isObject(data.settings)) return bad("Invalid settings");
    const keys = Object.keys(data.settings);
    if (keys.length > 20) return bad("Too many settings");
    for (const key of keys) {
      const value = data.settings[key];
      if (!SETTING_KEY.test(key) || RESERVED.has(key)) return bad("Invalid setting name");
      if (typeof value === "string" ? value.length > 512 : typeof value === "number" ? !Number.isFinite(value) : typeof value !== "boolean") return bad("Invalid setting value");
      settings[key] = value as string | number | boolean;
    }
  }
  const secrets: Record<string, string | null> = {};
  if (data.secrets !== undefined) {
    if (!isObject(data.secrets)) return bad("Invalid secrets");
    const keys = Object.keys(data.secrets);
    if (keys.length > 6) return bad("Too many secrets");
    for (const key of keys) {
      const value = data.secrets[key];
      if (!SECRET_KEY.test(key) || RESERVED.has(key)) return bad("Invalid secret name");
      if (value !== null && (typeof value !== "string" || value.length < 1 || value.length > 512)) return bad("Secret values must be 1-512 characters or null");
      secrets[key] = value;
    }
  }
  return JSON.stringify({ expected_version: data.expected_version, enabled: data.enabled, settings, secrets });
}

function buildRequest(route: ProactiveRoute, id: string | undefined, url: URL, data: Record<string, unknown> | null): Built {
  const base = "/v1/proactive";
  switch (route) {
    case "connectors": return { path: `${base}/connectors`, method: "GET" };
    case "connector_save": case "connector_test": case "connector_audit": {
      if (!isConnectorId(id)) return bad("Unknown connector");
      if (route === "connector_audit") return { path: `${base}/connectors/${id}/audit`, method: "GET" };
      if (route === "connector_test") return { path: `${base}/connectors/${id}/test`, method: "POST", body: "{}" };
      const body = validateSave(data ?? {});
      return typeof body === "string" ? { path: `${base}/connectors/${id}`, method: "PUT", body } : body;
    }
    case "watch": return { path: `${base}/watch`, method: "GET" };
    case "watch_history": {
      const raw = url.searchParams.get("days") ?? "7";
      const days = /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
      return days >= 1 && days <= 31 ? { path: `${base}/watch/history?days=${days}`, method: "GET" } : bad("Days must be 1-31");
    }
    case "watch_refresh": return { path: `${base}/watch/refresh`, method: "POST", body: "{}" };
    case "triggers_config": return { path: `${base}/triggers/config`, method: "GET" };
    case "pause_get": return { path: `${base}/pause`, method: "GET" };
    case "pause_set": {
      if (!data || Object.keys(data).some(key => key !== "paused" && key !== "reason") || typeof data.paused !== "boolean") return bad("Paused must be true or false");
      if (typeof data.reason !== "string" || data.reason.trim().length < 10 || data.reason.length > 500 || [...data.reason].some(c => c.charCodeAt(0) < 32)) return bad("A reason of 10-500 characters is required");
      return { path: `${base}/pause`, method: "PUT", body: JSON.stringify({ paused: data.paused, reason: data.reason.trim() }) };
    }
    case "run_list": return { path: `${base}/runs`, method: "GET" };
    case "run_create": {
      if (!data || Object.keys(data).some(key => key !== "trigger_event_id") || !isUuid(data.trigger_event_id)) return bad("Valid trigger event required");
      return { path: `${base}/runs`, method: "POST", body: JSON.stringify({ trigger_event_id: data.trigger_event_id }) };
    }
    case "run_get": case "run_cap": case "run_advance": case "run_cancel": {
      if (!isUuid(id)) return bad("Invalid run identifier");
      if (route === "run_get") return { path: `${base}/runs/${id}`, method: "GET" };
      if (route === "run_cap") return { path: `${base}/runs/${id}/cap.xml`, method: "GET" };
      if (route === "run_advance") {
        if (!data || Object.keys(data).some(key => key !== "expected_step") || !isRunStep(data.expected_step)) return bad("Valid expected step required");
        return { path: `${base}/runs/${id}/advance`, method: "POST", body: JSON.stringify({ expected_step: data.expected_step }) };
      }
      if (!data || Object.keys(data).some(key => key !== "rationale") || typeof data.rationale !== "string" ||
        data.rationale.trim().length < 10 || data.rationale.length > 2000) return bad("Cancellation rationale of 10-2000 characters required");
      return { path: `${base}/runs/${id}/cancel`, method: "POST", body: JSON.stringify({ rationale: data.rationale }) };
    }
  }
}

function clean(route: ProactiveRoute, payload: unknown): unknown {
  switch (route) {
    case "connectors": return cleanConnectors(payload);
    case "connector_save": { const c = cleanConnector(payload); if (!c) throw new Error("invalid"); return c; }
    case "connector_test": { const r = cleanTestResult(payload); if (!r) throw new Error("invalid"); return r; }
    case "connector_audit": return { rows: cleanAudit(payload) };
    case "watch": return cleanWatch(payload);
    case "watch_history": return cleanHistory(payload);
    case "watch_refresh": return cleanRefresh(payload);
    case "triggers_config": return cleanTriggersConfig(payload);
    case "pause_get": case "pause_set": return cleanPause(payload);
    case "run_list": return cleanRunList(payload);
    default: return cleanRun(payload);
  }
}

const GENERIC: Record<number, string> = {
  400: "Request rejected", 401: "Secure operator sign-in required", 403: "Insufficient role", 404: "Proactive watch is not enabled or the record was not found",
  409: "Conflict: the record changed or the action is not allowed", 422: "Request rejected", 429: "Too many requests", 503: "Proactive service unavailable",
};

export async function proxyProactive(request: Request, route: ProactiveRoute, id?: string): Promise<NextResponse> {
  const isPublic = PUBLIC_ROUTES.has(route);
  const isWrite = request.method !== "GET";
  let session: Awaited<ReturnType<typeof readSession>> = null;
  if (!isPublic || isWrite) {
    let config: ReturnType<typeof configuration>;
    try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
    if (!config) return failure(503, "Identity provider not configured");
    session = await readSession();
    if (!session) return failure(401, "Secure operator sign-in required");
    if (isWrite && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
    if (!hasRole(session.roles, ...rolesFor(route))) return failure(403, "Insufficient role");
  }
  const expectedMethod = ({ connector_save: "PUT", pause_set: "PUT", connector_test: "POST", watch_refresh: "POST", run_create: "POST", run_advance: "POST", run_cancel: "POST" } as Partial<Record<ProactiveRoute, string>>)[route] ?? "GET";
  if (request.method !== expectedMethod) return failure(405, "Method not allowed");

  let data: Record<string, unknown> | null = null;
  const needsBody = route === "connector_save" || route === "pause_set" || route === "run_create" || route === "run_advance" || route === "run_cancel";
  if (needsBody) {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return failure(413, "Payload too large");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return failure(400, "Invalid JSON body"); }
    if (!isObject(parsed)) return failure(400, "Invalid payload");
    data = parsed;
  }
  const built = buildRequest(route, id, new URL(request.url), data);
  if ("error" in built) return built.error as NextResponse;

  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + built.path, {
      method: built.method,
      headers: { ...(session ? { Authorization: "Bearer " + session.accessToken } : {}), ...(built.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: built.body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      // Only a short machine code (for example version_mismatch) is relayed; never the raw body.
      const raw = await response.json().catch(() => null) as unknown;
      const candidate = isObject(raw) ? (typeof raw.code === "string" ? raw.code : typeof raw.detail === "string" ? raw.detail : typeof raw.error === "string" ? raw.error : "") : "";
      return failure(GENERIC[response.status] ? response.status : 502, GENERIC[response.status] ?? "Proactive service error", CODE.test(candidate) ? candidate : undefined);
    }
    if (route === "run_cap") {
      if (!response.headers.get("content-type")?.startsWith("application/xml")) return failure(502, "Proactive service returned an invalid XML artifact");
      const xml = await response.text();
      if (xml.length > 400_000) return failure(502, "Proactive service returned an oversized artifact");
      return new NextResponse(xml, { headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="aegis-exercise-cap-${id}.xml"`,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        ...(response.headers.get("x-cap-sha256") && /^[0-9a-f]{64}$/i.test(response.headers.get("x-cap-sha256") ?? "") ? { "X-CAP-SHA256": response.headers.get("x-cap-sha256") as string } : {}),
      } });
    }
    const output = clean(route, await response.json());
    return NextResponse.json(output, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure(503, "Proactive service unavailable");
  }
}
