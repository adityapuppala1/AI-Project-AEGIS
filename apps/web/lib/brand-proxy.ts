// Browser proxy for brand settings (docs/BRANDING.md). Two deliberate public reads, listed in lib/session-gate.ts:
// /api/brand (name and logo version only) and /api/brand/logo (the image). Everything else is platform_admin only
// and forwards the session bearer server-side through lib/api-auth.ts; the API repeats every check made here.
// A failed public read answers the default brand, so the sign-in page never breaks.
import { cache } from "react";
import { NextResponse } from "next/server";
import { configuration, sameOrigin } from "./auth-server";
import { apiAuthForRoles, upstreamAuthFailure } from "./api-auth";
import { BRAND_LOGO_MAX_BYTES, BRAND_LOGO_TYPES, DEFAULT_BRAND, checkBrandName, parseBrand, type Brand } from "./brand";

export type BrandAdminRoute = "settings" | "name" | "logo" | "reset" | "audit";
const METHODS: Record<BrandAdminRoute, string> = { settings: "GET", name: "PUT", logo: "PUT", reset: "POST", audit: "GET" };
const ADMIN_ROLES = ["platform_admin"] as const;
const MAX_JSON = 300;
const LOGO_FILENAMES: Record<string, string> = { "image/png": "brand-logo.png", "image/jpeg": "brand-logo.jpg", "image/webp": "brand-logo.webp" };
const noStore = { "Cache-Control": "no-store" };
const failure = (status: number, error: string, code?: string) => NextResponse.json(code ? { error, code } : { error }, { status, headers: noStore });
const api = () => process.env.API_INTERNAL_URL || "http://localhost:8000";

const publicBody = (brand: Brand) => ({ name: brand.name, logo_version: brand.logoVersion, version: brand.version });

/** Server components and the public route: the current brand, or the default on any failure. Runs once per render. */
export const fetchBrand = cache(async (): Promise<Brand> => {
  try {
    const response = await fetch(api() + "/v1/brand", { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!response.ok) return DEFAULT_BRAND;
    return parseBrand(await response.json());
  } catch { return DEFAULT_BRAND; }
});

export async function publicBrand() {
  return NextResponse.json(publicBody(await fetchBrand()), { headers: { "Cache-Control": "no-cache" } });
}

const ETAG = /^(W\/)?"brand-logo-\d{1,9}"$/;
const logoHeaders = (type: string, etag: string | null): Record<string, string> => ({
  "Content-Type": type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": `inline; filename="${LOGO_FILENAMES[type]}"`, "Cache-Control": "public, max-age=300",
  ...(etag ? { ETag: etag } : {}),
});

export async function publicLogo(request?: Request) {
  try {
    // Only a well-formed version tag is forwarded; the API answers 304 when it still matches.
    const tags = (request?.headers.get("if-none-match") || "").split(",").map(tag => tag.trim()).filter(tag => ETAG.test(tag)).slice(0, 4);
    const response = await fetch(api() + "/v1/brand/logo", { cache: "no-store", signal: AbortSignal.timeout(5000),
      ...(tags.length ? { headers: { "If-None-Match": tags.join(", ") } } : {}) });
    const etag = response.headers.get("etag");
    const safeTag = etag && ETAG.test(etag) ? etag : null;
    if (response.status === 304 && safeTag) {
      return new NextResponse(null, { status: 304, headers: { ETag: safeTag, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
    }
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!response.ok || !(BRAND_LOGO_TYPES as readonly string[]).includes(type)) return failure(404, "No logo is set", "brand_logo_not_set");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > BRAND_LOGO_MAX_BYTES) return failure(404, "No logo is set", "brand_logo_not_set");
    return new NextResponse(bytes, { status: 200, headers: logoHeaders(type, safeTag) });
  } catch { return failure(404, "No logo is set", "brand_logo_not_set"); }
}

async function readCapped(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

function jsonBody(raw: string, keys: string[]): Record<string, unknown> | null {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== [...keys].sort().join()) return null;
  const expected = record.expected_version;
  if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected < 0) return null;
  return record;
}

export async function proxyBrandAdmin(request: Request, route: BrandAdminRoute) {
  let config;
  try { config = configuration(); } catch { return failure(503, "Identity provider configuration invalid"); }
  if (!config) return failure(503, "Identity provider not configured");
  const auth = await apiAuthForRoles(ADMIN_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (request.method !== METHODS[route]) return failure(405, "Unsupported operation");
  const write = request.method !== "GET";
  if (write && !sameOrigin(request, config)) return failure(403, "Invalid request origin");
  const url = new URL(request.url);
  let target = "/v1/brand/" + route, body: BodyInit | undefined, contentType: string | undefined;

  if (route === "logo") {
    const keys = [...url.searchParams.keys()];
    const expected = url.searchParams.get("expected_version");
    if (keys.length !== 1 || keys[0] !== "expected_version" || !expected || !/^\d{1,9}$/.test(expected)) return failure(400, "Send expected_version only");
    const bytes = await readCapped(request, BRAND_LOGO_MAX_BYTES);
    if (!bytes) return failure(413, "The logo is larger than 256 KB", "brand_logo_too_large");
    if (bytes.byteLength === 0) return failure(422, "Choose a logo file", "brand_logo_empty");
    target += "?expected_version=" + expected;
    body = bytes.buffer as ArrayBuffer; contentType = "application/octet-stream";
  } else {
    if (url.search) return failure(400, "No query parameters are accepted");
    if (write) {
      const capped = await readCapped(request, MAX_JSON);
      if (!capped) return failure(413, "Request payload too large");
      const raw = new TextDecoder().decode(capped);
      const data = jsonBody(raw, route === "name" ? ["name", "expected_version"] : ["expected_version"]);
      if (!data) return failure(400, route === "name" ? "Send only { name, expected_version }" : "Send only { expected_version }");
      if (route === "name") {
        const checked = checkBrandName(data.name);
        if (!checked.ok) return failure(422, "That name cannot be used", checked.code);
        body = JSON.stringify({ name: checked.name, expected_version: data.expected_version });
      } else body = JSON.stringify({ expected_version: data.expected_version });
      contentType = "application/json";
    }
  }
  try {
    const response = await fetch(api() + target, {
      method: request.method, body, cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { ...auth, ...(contentType ? { "Content-Type": contentType } : {}) },
    });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof data?.detail === "string" && /^brand_[a-z_]{1,40}$/.test(data.detail) ? data.detail : "brand_unavailable";
      return failure(response.status, "The brand settings could not be changed", code);
    }
    return NextResponse.json(data, { status: response.status, headers: noStore });
  } catch { return failure(503, "Brand settings unavailable", "brand_unavailable"); }
}
