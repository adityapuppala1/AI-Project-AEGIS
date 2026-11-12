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

/** The Authorization header for a server-to-API call, or null when there is no verified session. */
export async function apiAuthHeaders(): Promise<{ Authorization: string } | null> {
  const session = await readSession();
  return session?.accessToken ? { Authorization: "Bearer " + session.accessToken } : null;
}
