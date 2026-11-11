// Coarse sign-in gate for middleware.ts: "does this request carry an unexpired AEGIS session, and for which agency?"
// It only decrypts the session cookie that lib/auth-server.ts issued (same key, same algorithms). Every protected
// route still does its own full check (roles, agency, department) with readSession(); this gate only keeps
// signed-out visitors away from pages and data.
import { jwtDecrypt } from "jose";

export type GateSession = { agencyId: string; roles: string[] };

const AGENCY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionKey(): Uint8Array | null {
  const raw = process.env.BFF_SESSION_KEY_BASE64?.trim();
  if (!raw) return null;
  try {
    const bytes = Uint8Array.from(atob(raw), character => character.charCodeAt(0));
    return bytes.length === 32 ? bytes : null;
  } catch { return null; }
}

export function sessionCookieName(): string {
  const origin = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
  return origin.startsWith("https:") ? "__Host-aegis-session" : "aegis-session";
}

export async function gateSession(cookieValue: string | undefined): Promise<GateSession | null> {
  const key = sessionKey();
  if (!key || !cookieValue || cookieValue.length > 20000) return null;
  try {
    const { payload } = await jwtDecrypt(cookieValue, key, { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) return null;
    if (typeof payload.sub !== "string" || typeof payload.agencyId !== "string" || !AGENCY.test(payload.agencyId)) return null;
    if (!Array.isArray(payload.roles) || payload.roles.length === 0 || payload.roles.some(role => typeof role !== "string")) return null;
    return { agencyId: payload.agencyId.toLowerCase(), roles: payload.roles as string[] };
  } catch { return null; }
}

// What a visitor may open without signing in: the landing page, the sign-in page and the sign-in endpoints.
const PUBLIC_PAGES = new Set(["/", "/welcome", "/sign-in"]);
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || pathname.startsWith("/api/auth/");
}

// Where a visitor may be sent back to after signing in. Only a plain in-app page path is accepted: letters, digits,
// "-" and "/" (so no scheme, host, "//", backslash, dot, query or fragment can get through), never an API route or a
// public page. Anything else falls back to the default landing place.
export function safeReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length < 2 || value.length > 120) return null;
  if (!/^(\/[A-Za-z0-9-]+)+$/.test(value)) return null;
  if (value === "/api" || value.startsWith("/api/") || value.startsWith("/_next") || isPublicPath(value)) return null;
  return value;
}

// The seeded exercise records belong to one agency. Operators of any other agency must not see them.
const FIXTURE_API = ["/api/incidents", "/api/sources", "/api/agency-tasks", "/api/telemetry", "/api/ingestion", "/api/model-lab", "/api/exercise", "/api/policy"];
const FIXTURE_PAGES = ["/incidents", "/demo", "/model-lab", "/sources", "/ingestion", "/agency-sync", "/response-teams", "/audit"];
export function fixtureAgency(): string {
  return (process.env.AEGIS_FIXTURE_AGENCY_ID?.trim() || "11111111-1111-4111-8111-111111111111").toLowerCase();
}
export function isFixturePath(pathname: string): boolean {
  return [...FIXTURE_API, ...FIXTURE_PAGES].some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"));
}
