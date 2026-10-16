import { NextResponse } from "next/server";
import { configuration, cookieName, cookieOptions, sameOrigin } from "../../../../lib/auth-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = configuration();
  if (!config) return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  if (!sameOrigin(request, config)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const response = NextResponse.json({ loggedOut: true }, { headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cache"' } });
  for (const type of ["flow", "session"] as const) {
    response.cookies.set(cookieName(config, type), "", cookieOptions(config, 0));
  }
  return response;
}
