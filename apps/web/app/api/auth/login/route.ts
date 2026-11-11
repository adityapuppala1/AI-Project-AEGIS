import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "../../../../lib/session-gate";
import { challenge, configuration, cookieName, cookieOptions, encryptData, oidcDocument, randomBase64Url } from "../../../../lib/auth-server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const config = configuration();
    if (!config) return NextResponse.json({ error: "Identity provider not configured" }, { status: 503 });
    const doc = await oidcDocument(config);
    const state = randomBase64Url();
    const nonce = randomBase64Url();
    const verifier = randomBase64Url();
    const authorize = new URL(doc.authorization_endpoint);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", config.origin + "/api/auth/callback");
    authorize.searchParams.set("scope", "openid profile");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("code_challenge", challenge(verifier));
    authorize.searchParams.set("code_challenge_method", "S256");
    // The page to return to travels only inside this encrypted cookie, never through the identity provider.
    const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
    const flow = await encryptData(config, { state, nonce, verifier, ...(next ? { next } : {}) }, 600);
    const response = NextResponse.redirect(authorize);
    response.cookies.set(cookieName(config, "flow"), flow, cookieOptions(config, 600));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Secure sign-in cannot be started" }, { status: 503 });
  }
}
