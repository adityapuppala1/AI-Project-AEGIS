import { NextRequest, NextResponse } from "next/server";
import { configuration, cookieName, cookieOptions, encryptData, equalSecret, extractScope, oidcDocument, readFlow, verifyToken } from "../../../../lib/auth-server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const config = configuration();
  if (!config) return NextResponse.json({ error: "Identity provider unavailable" }, { status: 503 });
  const errorResult = (status: number) => {
    const response = NextResponse.json({ error: "Sign-in could not be verified. Try again." }, { status });
    response.cookies.set(cookieName(config, "flow"), "", cookieOptions(config, 0));
    return response;
  };
  try {
    const query = request.nextUrl.searchParams;
    const state = query.get("state");
    const code = query.get("code");
    const flow = await readFlow(config);
    if (!code || code.length > 4096 || !state || !flow || !equalSecret(state, flow.state) || query.has("error")) {
      return errorResult(400);
    }
    const doc = await oidcDocument(config);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.origin + "/api/auth/callback",
      client_id: config.clientId,
      code_verifier: flow.verifier,
    });
    const headers: Record<string,string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (config.clientSecret) {
      headers.Authorization = "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64");
    }
    const exchanged = await fetch(doc.token_endpoint, {
      method: "POST", body, headers, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!exchanged.ok) return errorResult(401);
    const tokens: { access_token?: unknown; id_token?: unknown; token_type?: unknown } = await exchanged.json();
    if (tokens.token_type !== "Bearer" || typeof tokens.access_token !== "string" ||
      typeof tokens.id_token !== "string" || tokens.access_token.length > 2600) return errorResult(401);
    const idClaims = await verifyToken(config, tokens.id_token, config.clientId);
    const accessClaims = await verifyToken(config, tokens.access_token, config.audience);
    if (typeof idClaims.nonce !== "string" || !equalSecret(idClaims.nonce, flow.nonce) ||
      idClaims.sub !== accessClaims.sub) return errorResult(401);
    const operator = extractScope(accessClaims);
    const ttl = Math.min(900, Math.floor(operator.exp - Date.now()/1000));
    if (ttl <= 0) return errorResult(401);
    const encrypted = await encryptData(config, {
      accessToken: tokens.access_token, sub: operator.subject,
      agencyId: operator.agencyId, roles: operator.roles,
    }, ttl);
    if (encrypted.length > 3900) return errorResult(401);
    const response = NextResponse.redirect(config.origin + "/approvals");
    response.cookies.set(cookieName(config, "flow"), "", cookieOptions(config, 0));
    response.cookies.set(cookieName(config, "session"), encrypted, cookieOptions(config, ttl));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch { return errorResult(401); }
}
