import { NextRequest, NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired } from "../../../../../lib/api-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== (process.env.APP_ORIGIN || "http://localhost:3000")) return json({ error: "Origin rejected" }, 403);
  const { id } = await params;
  if (!uuid.test(id)) return json({ error: "Invalid exercise case" }, 400);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "question") ||
      typeof body.question !== "string" || body.question.trim().length < 3 || body.question.length > 300) {
    return json({ error: "A bounded question is required" }, 400);
  }
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(`${base}/v1/exercise/incidents/${id}/grounded-guide`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ question: body.question }), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return json({ error: "Synthetic context not found" }, 404);
    if (!response.ok) throw new Error("Unavailable");
    const value = await response.json();
    const ids = (items: unknown) => Array.isArray(items) && items.length <= 50 && items.every(item => typeof item === "string" && uuid.test(item));
    if (value?.version !== "aegis.exercise.grounded-guide.v1" || value.incident_id !== id ||
        value.source !== "synthetic_exercise" || value.operational_actions_enabled !== false ||
        value.needs_accountable_human_review !== true ||
        !["summary", "evidence", "review_options", "unknowns", "abstain"].includes(value.answer_kind) ||
        !["answered", "abstained"].includes(value.status) || !Array.isArray(value.claims) || value.claims.length > 10 ||
        value.claims.some((claim: Record<string, unknown>) => typeof claim?.text !== "string" || !ids(claim.evidence_ids) || !ids(claim.source_ids)) ||
        !Array.isArray(value.review_options) || value.review_options.length > 10 ||
        value.review_options.some((option: Record<string, unknown>) => typeof option?.text !== "string" || !["URB-01", "URB-03", "URB-04"].includes(String(option.playbook_step))) ||
        !Array.isArray(value.unknowns) || !value.unknowns.every((item: unknown) => typeof item === "string") ||
        value.generated_by !== "deterministic_grounded_template_no_model") throw new Error("Unsafe response");
    return json(value);
  } catch {
    return json({ error: "Grounded guide unavailable; inspect the ordinary evidence checklist" }, 503);
  }
}
