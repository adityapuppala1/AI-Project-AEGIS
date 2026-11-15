// Browser proxy for user administration (docs/USER_MANAGEMENT.md). platform_admin only: the session bearer is
// forwarded server-side through lib/api-auth.ts, every write checks the request origin, bodies are size-capped and
// re-encoded with only the known fields, and only fixed user_admin_* codes pass back. The API repeats every check.
// Temporary passwords pass through once, with Cache-Control: no-store, and are never logged or kept here.
import { NextResponse } from "next/server";
import { configuration, sameOrigin } from "./auth-server";
import { apiAuthForRoles, forbidden, signInRequired } from "./api-auth";

export type UserAdminRoute = "status" | "accounts" | "create" | "edit" | "enable" | "disable" | "reset-password" | "sign-out" | "audit";
const METHODS: Record<UserAdminRoute, string> = {
  status: "GET", accounts: "GET", create: "POST", edit: "PATCH", enable: "POST", disable: "POST",
  "reset-password": "POST", "sign-out": "POST", audit: "GET",
};
const ACTIONS = new Set<UserAdminRoute>(["enable", "disable", "reset-password", "sign-out"]);
const CREATE_FIELDS = ["username", "first_name", "last_name", "email", "role", "department", "team"];
const REQUIRED_CREATE = ["username", "first_name", "last_name", "email", "role"];
const EDIT_FIELDS = ["first_name", "last_name", "email", "role", "department", "team"];
const ADMIN_ROLES = ["platform_admin"] as const;
const MAX_BODY = 2048;
const MAX_FIELD = 254;
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE = /^user_admin_[a-z_]{1,40}$/;
/** 403 codes from the API that describe the target account, not the caller; they pass through as they are. */
const TARGET_REFUSALS = new Set(["user_admin_protected", "user_admin_self_change"]);
const noStore = { "Cache-Control": "no-store" };
const failure = (status: number, error: string, code?: string) => NextResponse.json(code ? { error, code } : { error }, { status, headers: noStore });
const api = () => process.env.API_INTERNAL_URL || "http://localhost:8000";

async function readCapped(request: Request): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(out);
}

/** Only the allowed keys, each a string (or null for department/team), at most 254 characters, no NUL. */
export function cleanBody(raw: string, allowed: readonly string[], required: readonly string[]): Record<string, string | null> | null {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some(key => !allowed.includes(key)) || required.some(key => !keys.includes(key))) return null;
  const out: Record<string, string | null> = {};
  for (const key of keys) {
    const value = record[key];
    if (value === null && (key === "department" || key === "team")) { out[key] = null; continue; }
    if (typeof value !== "string" || value.length > MAX_FIELD || value.includes("\u0000")) return null;
    out[key] = value;
  }
  return out;
}

export async function proxyUserAdmin(request: Request, route: UserAdminRoute, accountId?: string) {
  let config;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const auth = await apiAuthForRoles(ADMIN_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (request.method !== METHODS[route]) return failure(405, "Unsupported operation");
  const write = request.method !== "GET";
  if (write && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  if (new URL(request.url).search) return failure(400, "No query parameters are accepted");
  const needsId = route === "edit" || ACTIONS.has(route);
  if (needsId && (!accountId || !ACCOUNT_ID.test(accountId))) return failure(404, "Unknown account", "user_admin_not_found");

  let target = "/v1/user-admin/" + (route === "create" ? "accounts" : route);
  if (route === "edit") target = `/v1/user-admin/accounts/${accountId}`;
  else if (ACTIONS.has(route)) target = `/v1/user-admin/accounts/${accountId}/${route}`;
  let body: string | undefined;
  if (route === "create" || route === "edit") {
    const raw = await readCapped(request);
    if (raw === null) return failure(413, "Request payload too large");
    const clean = route === "create" ? cleanBody(raw, CREATE_FIELDS, REQUIRED_CREATE) : cleanBody(raw, EDIT_FIELDS, []);
    if (!clean) return failure(400, "Send only the account fields", "user_admin_invalid_request");
    body = JSON.stringify(clean);
  } else if (write) {
    const raw = await readCapped(request);
    if (raw === null) return failure(413, "Request payload too large");
    if (raw.trim() !== "" && raw.trim() !== "{}") return failure(400, "This action takes no body", "user_admin_invalid_request");
  }
  try {
    const response = await fetch(api() + target, {
      method: request.method, body, cache: "no-store", signal: AbortSignal.timeout(30000),
      headers: { ...auth, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    });
    const data = await response.json().catch(() => ({}));
    const detail = typeof data?.detail === "string" && CODE.test(data.detail) ? data.detail : null;
    if (response.status === 401) return signInRequired();
    if (response.status === 403) return detail && TARGET_REFUSALS.has(detail) ? failure(403, "This account cannot be changed here", detail) : forbidden();
    if (!response.ok) return failure(response.status, "The account could not be changed", detail ?? "user_admin_unavailable");
    return NextResponse.json(data, { status: response.status, headers: noStore });
  } catch { return failure(503, "User administration unavailable", "user_admin_unavailable"); }
}
