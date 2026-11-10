import { NextResponse, type NextRequest } from "next/server";

import { buildCsp } from "./lib/csp";

// Adds a per-request nonce and the page Content-Security-Policy. Next.js reads the policy from the request headers
// and stamps the nonce on its own scripts; app/layout.tsx passes it to the theme script.
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID() + crypto.randomUUID());
  const policy = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [{
    // Pages only: API routes, build assets and the map worker get their headers from next.config.ts.
    source: "/((?!api/|_next/static|_next/image|maplibre/|favicon.ico).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
  }],
};
