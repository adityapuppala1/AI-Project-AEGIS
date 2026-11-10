import { NextResponse, type NextRequest } from "next/server";

import { buildCsp } from "./lib/csp";
import { fixtureAgency, gateSession, isFixturePath, isPublicPath, sessionCookieName } from "./lib/session-gate";

// Two jobs on every request:
// 1. Sign-in gate. Only the landing page, the sign-in page and the sign-in endpoints are open. Every other page
//    redirects to /sign-in and every other API route answers 401 until the visitor has a valid session. The seeded
//    exercise records are served only to operators of the agency that owns them.
// 2. Page security policy. Adds a per-request nonce and the Content-Security-Policy; Next.js stamps the nonce on its
//    own scripts and app/layout.tsx passes it to the theme script.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl, isApi = pathname.startsWith("/api/");
  if (!isPublicPath(pathname)) {
    const session = await gateSession(request.cookies.get(sessionCookieName())?.value);
    if (!session) {
      if (isApi) return NextResponse.json({ error: "Sign-in required", code: "SIGN_IN_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
      const target = request.nextUrl.clone(); target.pathname = "/sign-in"; target.search = "";
      return NextResponse.redirect(target, 307);
    }
    if (isFixturePath(pathname) && session.agencyId !== fixtureAgency()) {
      if (isApi) return NextResponse.json({ error: "No records for your agency", code: "OUT_OF_SCOPE" }, { status: 403, headers: { "Cache-Control": "no-store" } });
      return new NextResponse("No exercise records are available for your agency.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
  }
  if (isApi) return NextResponse.next();
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
  runtime: "nodejs",
  // Everything except build assets, the map worker and the site icon. Prefetch requests are gated too.
  matcher: ["/((?!_next/static|_next/image|maplibre/|favicon.ico|icon.svg).*)"],
};
