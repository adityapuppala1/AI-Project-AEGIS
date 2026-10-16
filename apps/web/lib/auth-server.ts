/** AEGIS browser backend-for-frontend authentication.
 * OIDC Authorization Code + PKCE. Access tokens never enter browser JS.
 * Short-lived encrypted HttpOnly sessions; no refresh tokens are persisted.
 *
 * This pilot BFF still needs real IdP provisioning, MFA policy, revocation,
 * and a shared server-side session store before a production deployment.
 */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { EncryptJWT, createRemoteJWKSet, jwtDecrypt, jwtVerify, type JWTPayload } from "jose";

export type Role = "incident_operator" | "incident_checker" | "incident_auditor";
export interface OperatorSession {
  accessToken: string;
  subject: string;
  agencyId: string;
  roles: Role[];
  exp: number;
}
export interface AuthConfig {
  issuer: string;
  audience: string;
  clientId: string;
  clientSecret?: string;
  jwksUrl: string;
  origin: string;
  key: Uint8Array;
}
interface OidcDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}
interface AuthFlow { state: string; nonce: string; verifier: string }
const ALL_ROLES: Role[] = ["incident_operator", "incident_checker", "incident_auditor"];

export function configuration(): AuthConfig | null {
  const issuer = process.env.OIDC_ISSUER?.trim();
  const audience = process.env.OIDC_AUDIENCE?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const jwksUrl = process.env.OIDC_JWKS_URL?.trim();
  const origin = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
  const rawKey = process.env.BFF_SESSION_KEY_BASE64?.trim();
  if (!issuer || !audience || !clientId || !jwksUrl || !rawKey) return null;
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) throw new Error("BFF_SESSION_KEY_BASE64 must be 32 random bytes, base64-encoded");
  if (!issuer.startsWith("https://") || !jwksUrl.startsWith("https://")) throw new Error("OIDC endpoints must use HTTPS");
  const parsed = new URL(origin);
  const isLocal = parsed.protocol === "http:" && parsed.hostname === "localhost";
  if (parsed.origin !== origin || (!isLocal && parsed.protocol !== "https:")) {
    throw new Error("APP_ORIGIN must be the exact HTTPS origin, except localhost HTTP");
  }
  return { issuer: issuer.replace(/\/$/, ""), audience, clientId, clientSecret: process.env.OIDC_CLIENT_SECRET,
    jwksUrl, origin, key };
}

export function cookieOptions(config: AuthConfig, maxAge: number) {
  return { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax" as const,
    path: "/", maxAge };
}
export function cookieName(config: AuthConfig, type: "flow" | "session") {
  return config.origin.startsWith("https:") ? `__Host-aegis-${type}` : `aegis-${type}`;
}

export async function oidcDocument(config: AuthConfig): Promise<OidcDocument> {
  const response = await fetch(`${config.issuer}/.well-known/openid-configuration`,
    { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("OIDC discovery unavailable");
  const doc: OidcDocument = await response.json();
  if (doc.issuer !== config.issuer || doc.jwks_uri !== config.jwksUrl ||
    !doc.authorization_endpoint?.startsWith("https://") ||
    !doc.token_endpoint?.startsWith("https://")) {
    throw new Error("OIDC provider discovery mismatch");
  }
  return doc;
}

export function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
export function challenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
export function equalSecret(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export async function encryptData(config: AuthConfig, payload: object, ttlSeconds: number): Promise<string> {
  return new EncryptJWT(payload as JWTPayload).setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000) + ttlSeconds).encrypt(config.key);
}
export async function decryptData(config: AuthConfig, value: string): Promise<JWTPayload> {
  return (await jwtDecrypt(value, config.key, { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] })).payload;
}
export async function readFlow(config: AuthConfig): Promise<AuthFlow | null> {
  const raw = (await cookies()).get(cookieName(config, "flow"))?.value;
  if (!raw) return null;
  try {
    const payload = await decryptData(config, raw);
    if (typeof payload.state !== "string" || typeof payload.nonce !== "string" || typeof payload.verifier !== "string") return null;
    return { state: payload.state, nonce: payload.nonce, verifier: payload.verifier };
  } catch { return null; }
}

export async function verifyToken(config: AuthConfig, token: string, audience: string): Promise<JWTPayload> {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 5000, cooldownDuration: 30000 });
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer, audience, algorithms: ["RS256"], clockTolerance: 30,
    requiredClaims: ["iss", "aud", "sub", "exp", "iat"],
  });
  return payload;
}

export function extractScope(payload: JWTPayload): Omit<OperatorSession, "accessToken"> {
  const subject = payload.sub;
  const agency = payload.aegis_agency_id;
  const roles = payload.aegis_roles;
  const exp = payload.exp;
  const agencyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof subject !== "string" || !subject || subject.length > 256 ||
    typeof agency !== "string" || !agencyUuid.test(agency) ||
    !Array.isArray(roles) || roles.length === 0 ||
    roles.some((role) => typeof role !== "string" || !ALL_ROLES.includes(role as Role)) ||
    typeof exp !== "number" || exp <= Date.now()/1000) throw new Error("Access token scope invalid");
  return { subject, agencyId: agency, roles: [...new Set(roles)] as Role[], exp };
}

export async function readSession(): Promise<OperatorSession | null> {
  let config: AuthConfig | null;
  try { config = configuration(); } catch { return null; }
  if (!config) return null;
  const token = (await cookies()).get(cookieName(config, "session"))?.value;
  if (!token) return null;
  try {
    const payload = await decryptData(config, token);
    if (typeof payload.accessToken !== "string" || payload.accessToken.length > 10000 ||
      typeof payload.sub !== "string" || typeof payload.agencyId !== "string" ||
      !Array.isArray(payload.roles) || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()/1000) return null;
    if (payload.roles.some((role) => typeof role !== "string" || !ALL_ROLES.includes(role as Role))) return null;
    return { accessToken: payload.accessToken, subject: payload.sub,
      agencyId: payload.agencyId, roles: payload.roles as Role[], exp: payload.exp };
  } catch { return null; }
}

export function sameOrigin(request: Request, config: AuthConfig): boolean {
  // For state-changing browser operations, require a matching Origin header.
  return request.headers.get("origin") === config.origin;
}
