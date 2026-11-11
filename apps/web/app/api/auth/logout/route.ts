import { NextResponse } from "next/server";
import { configuration, cookieName, cookieOptions, oidcDocument, readIdToken, sameOrigin } from "../../../../lib/auth-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = configuration();
  if (!config) return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  if (!sameOrigin(request, config)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  // Clearing the local session cookies is the primary, always-successful step: an operator must be
  // able to sign out of AEGIS even if the identity provider is briefly unreachable. Ending the
  // provider's own browser SSO session is a second, best-effort step layered on top of that — without
  // it, a same-browser "sign in" immediately after "sign out" can silently re-authenticate with no
  // login prompt, because the provider still sees an active session. No id_token (or any other extra
  // token) needs to be retained for this: Keycloak accepts client_id + post_logout_redirect_uri alone.
  let logoutUrl: string | undefined;
  try {
    const doc = await oidcDocument(config);
    if (doc.end_session_endpoint) {
      const target = new URL(doc.end_session_endpoint);
      target.searchParams.set("client_id", config.clientId);
      target.searchParams.set("post_logout_redirect_uri", config.origin);
      const hint = await readIdToken(config);
      if (hint) target.searchParams.set("id_token_hint", hint);
      logoutUrl = target.toString();
    }
  } catch { /* Local sign-out below still proceeds; the provider session may outlive this app session. */ }
  const response = NextResponse.json({ loggedOut: true, logoutUrl },
    { headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cache"' } });
  for (const type of ["flow", "session"] as const) {
    response.cookies.set(cookieName(config, type), "", cookieOptions(config, 0));
  }
  response.cookies.set(cookieName(config, "idt"), "", { ...cookieOptions(config, 0), path: "/api/auth" });
  return response;
}
