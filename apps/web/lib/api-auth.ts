// Server-side bearer forwarding for the formerly open API read routes (docs/SECURITY_ASSESSMENT.md).
// The access token comes only from the sealed HttpOnly session and is placed on the server-to-API request.
// It is never returned to, or readable by, browser code. Without a session the route answers 401
// { error, code: "SIGN_IN_REQUIRED" } and makes no API call.
import { NextResponse } from "next/server";
import { readSession } from "./auth-server";

export const SIGN_IN_REQUIRED = { error: "Sign-in required", code: "SIGN_IN_REQUIRED" } as const;

export function signInRequired() {
  return NextResponse.json(SIGN_IN_REQUIRED, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export const FORBIDDEN = { error: "Not permitted for your role or agency", code: "FORBIDDEN" } as const;

export function forbidden() {
  return NextResponse.json(FORBIDDEN, { status: 403, headers: { "Cache-Control": "no-store" } });
}

/**
 * The one mapping for an API refusal of a forwarded call: 401 becomes SIGN_IN_REQUIRED, 403 becomes FORBIDDEN, both
 * fixed replies (the upstream body is never passed through). Anything else returns null and the caller continues.
 */
export function upstreamAuthFailure(response: { status: number }): NextResponse | null {
  if (response.status === 401) return signInRequired();
  if (response.status === 403) return forbidden();
  return null;
}

/**
 * Like apiAuthHeaders, but also requires one of `allowed` roles from the verified session: 401 SIGN_IN_REQUIRED
 * without a session, 403 FORBIDDEN for another role. The API repeats the same check; this only saves the call.
 */
export async function apiAuthForRoles(allowed: readonly string[]): Promise<{ Authorization: string } | NextResponse> {
  const session = await readSession();
  if (!session?.accessToken) return signInRequired();
  if (!allowed.some(role => (session.roles ?? []).includes(role as never))) return forbidden();
  return { Authorization: "Bearer " + session.accessToken };
}

/** The Authorization header for a server-to-API call, or null when there is no verified session. */
export async function apiAuthHeaders(): Promise<{ Authorization: string } | null> {
  const session = await readSession();
  return session?.accessToken ? { Authorization: "Bearer " + session.accessToken } : null;
}
