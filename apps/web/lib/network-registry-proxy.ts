// Browser proxy for the Network Identifier Master (docs/NETWORK_IDENTIFIER_MASTER.md). platform_admin only, except the
// lanes read (names and rehearsal link states for the Resilient Sensor Link page, any signed-in exercise role). Only a
// fixed set of paths and methods is forwarded; writes check the request origin first; the session bearer is added
// server-side through lib/api-auth.ts; the API repeats every check. Nothing here calls a provider.
import { NextResponse } from "next/server";
import { configuration, sameOrigin } from "./auth-server";
import { apiAuthForRoles, upstreamAuthFailure } from "./api-auth";

const ADMIN_ROLES = ["platform_admin"] as const;
const LANE_ROLES = ["incident_operator", "incident_checker", "incident_auditor", "department_operator", "response_team", "platform_admin"] as const;
const MAX_JSON = 8192;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROUTES: Record<string, RegExp[]> = {
  GET: [/^$/, /^audit$/],
  POST: [/^providers$/, /^assets$/, new RegExp(`^(providers|assets)/${UUID}/(enable|disable|delete|restore)$`), new RegExp(`^providers/${UUID}/credential/clear$`)],
  PUT: [new RegExp(`^(providers|assets)/${UUID}$`), new RegExp(`^providers/${UUID}/(rehearsal|credential)$`)],
};
const PREFIX = "/api/networks";
const noStore = { "Cache-Control": "no-store" };
const failure = (status: number, error: string, code?: string) => NextResponse.json(code ? { error, code } : { error }, { status, headers: noStore });
const api = () => process.env.API_INTERNAL_URL || "http://localhost:8000";

/** The sub-path after /api/networks, or null when it is not one of the forwarded routes for this method. */
export function networkRoute(method: string, pathname: string): string | null {
  if (pathname !== PREFIX && !pathname.startsWith(PREFIX + "/")) return null;
  const sub = pathname.slice(PREFIX.length).replace(/^\/+/, "").replace(/\/+$/, "");
  return (ROUTES[method] ?? []).some(pattern => pattern.test(sub)) ? sub : null;
}

async function readJson(request: Request): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON)) return null;
  const raw = await request.text();
  if (raw.length > MAX_JSON) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return JSON.stringify(data);
  } catch { return null; }
}

function codeOf(data: unknown): string {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string" && /^network_[a-z_]{1,40}$/.test(detail)) return detail;
  if (Array.isArray(detail)) {
    const message = String((detail[0] as { msg?: unknown })?.msg ?? "");
    const named = message.match(/network_[a-z_]{1,40}/);
    return named ? named[0] : "network_invalid";
  }
  return "network_registry_unavailable";
}

async function forward(target: string, init: RequestInit, auth: { Authorization: string }) {
  try {
    const response = await fetch(api() + target, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { ...auth, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return failure(response.status, "The network registry could not complete that", codeOf(data));
    return NextResponse.json(data, { status: response.status, headers: noStore });
  } catch { return failure(503, "Network registry unavailable", "network_registry_unavailable"); }
}

export async function proxyNetworkRegistry(request: Request) {
  let config;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const auth = await apiAuthForRoles(ADMIN_ROLES);
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const sub = networkRoute(request.method, url.pathname);
  if (sub === null) return failure(404, "Unknown network registry route");
  const write = request.method !== "GET";
  if (write && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  let query = "";
  if (!write) {
    const keys = [...url.searchParams.keys()];
    const deleted = url.searchParams.get("include_deleted");
    if (keys.length > 1 || (keys.length === 1 && (sub !== "" || keys[0] !== "include_deleted" || !(deleted === "true" || deleted === "false")))) return failure(400, "Unsupported query");
    if (deleted === "true") query = "?include_deleted=true";
  } else if (url.search) return failure(400, "No query parameters are accepted");
  let body: string | undefined;
  if (write) {
    const json = await readJson(request);
    if (json === null) return failure(400, "Send one JSON object up to 8 KB");
    body = json;
  }
  return forward("/v1/admin/networks" + (sub ? "/" + sub : "") + query, { method: request.method, body }, auth);
}

export async function proxyNetworkLanes() {
  const auth = await apiAuthForRoles(LANE_ROLES);
  if (auth instanceof NextResponse) return auth;
  return forward("/v1/network-lanes", { method: "GET" }, auth);
}
