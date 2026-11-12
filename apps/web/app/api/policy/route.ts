import { NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired, upstreamAuthFailure } from "../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/policy", {
      headers: auth, cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    if (!response.ok) throw new Error("Exercise policy unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" ||
        !("source" in data) || data.source !== "synthetic_exercise" ||
        !("policy_version" in data) || data.policy_version !== "aegis.exercise.policy.v1" ||
        !("policy_editor_enabled" in data) || data.policy_editor_enabled !== false ||
        !("live_public_warning_enabled" in data) || data.live_public_warning_enabled !== false ||
        !("live_dispatch_enabled" in data) || data.live_dispatch_enabled !== false ||
        !("executing_suggested_actions_enabled" in data) ||
        data.executing_suggested_actions_enabled !== false) {
      throw new Error("Unsafe policy profile classification");
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "PolicyStudio manifest unavailable" }, { status: 503 });
  }
}
