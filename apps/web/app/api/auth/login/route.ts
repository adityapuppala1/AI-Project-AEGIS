import { NextResponse } from "next/server";
import { challenge, configuration, cookieName, cookieOptions, encryptData, oidcDocument, randomBase64Url } from "../../../../lib/auth-server";

export const runtime = "nodejs";
export async function GET() {
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
    const flow = await encryptData(config, { state, nonce, verifier }, 600);
    const response = NextResponse.redirect(authorize);
    response.cookies.set(cookieName(config, "flow"), flow, cookieOptions(config, 600));
    return response;
  } catch {
    return NextResponse.json({ error: "Secure sign-in cannot be started" }, { status: 503 });
  }
}
