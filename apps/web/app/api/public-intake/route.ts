import { NextResponse } from "next/server";
import { apiAuthForRoles, upstreamAuthFailure } from "../../../lib/api-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Quarantine-only proxy. Never forwards anything but the five report fields.
const HEADERS = { "Cache-Control": "no-store" };
const MAX_BODY = 4096;
const HAZARDS = new Set(["flood", "waterlogging", "wildfire", "landslide", "cyclone", "other"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_DETAILS = new Set([
  "Please remove personal contact details and links; reports are reviewed without identifying anyone.",
  "Please check the form fields.",
  "Too many reports right now. Please wait a moment and try again.",
  "The quarantine queue has reached its daily limit.",
]);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : null;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const timestamp = (value: unknown) => { const raw = text(value, 40); return raw && !Number.isNaN(Date.parse(raw)) ? raw : null; };
const base = () => process.env.API_INTERNAL_URL || "http://localhost:8000";
const fail = (status: number, error: string, extra: Record<string, string> = {}) => NextResponse.json({ error }, { status, headers: { ...HEADERS, ...extra } });

// The queue holds unreviewed public text: incident desk and administrators only (INTAKE_QUEUE_ROLES in
// services/api/app/public_intake.py; read_intake_queue in lib/roles.ts). The status route stays open to every role.
const QUEUE_ROLES = ["incident_operator", "incident_checker", "incident_auditor", "platform_admin"];

export async function GET() {
  const auth = await apiAuthForRoles(QUEUE_ROLES);
  if (auth instanceof Response) return auth;
  try {
    const response = await fetch(base() + "/v1/public-intake/reports?limit=50", { headers: auth, cache: "no-store", signal: AbortSignal.timeout(8000) });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    if (response.status === 503) return fail(503, "disabled");
    if (!response.ok) throw new Error("queue unavailable");
    const payload: unknown = await response.json();
    if (!isObject(payload) || payload.classification !== "public_unverified_intake" || payload.creates_cases !== false || !Array.isArray(payload.reports)) throw new Error("unexpected");
    const reports = payload.reports.slice(0, 100).flatMap(item => {
      if (!isObject(item)) return [];
      const id = text(item.id, 40), title = text(item.title, 100), description = text(item.description, 1000), hazard = text(item.hazard_type, 20);
      const lat = finite(item.lat), lon = finite(item.lon), submitted = timestamp(item.submitted_at);
      if (!id || !UUID.test(id) || !title || !description || !hazard || !HAZARDS.has(hazard) || lat === null || lon === null || !submitted) return [];
      return [{ id, submitted_at: submitted, title, description, hazard_type: hazard, lat, lon, status: "quarantined" }];
    });
    return NextResponse.json({ classification: "public_unverified_intake", total: finite(payload.total) ?? reports.length, reports }, { headers: HEADERS });
  } catch {
    return fail(502, "Quarantine queue unavailable");
  }
}

/** Read at most MAX_BODY bytes; returns null (and stops reading) as soon as the limit is exceeded. */
async function readCapped(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request) {
  const origin = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
  if (request.headers.get("origin") !== origin) return fail(403, "Invalid request origin");
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d{1,9}$/.test(declared)) return fail(400, "Invalid request");
  if (declared !== null && Number(declared) > MAX_BODY) return fail(413, "Report is too large");
  let raw: string | null;
  try { raw = await readCapped(request); } catch { return fail(400, "Invalid request"); }
  if (raw === null) return fail(413, "Report is too large");
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return fail(422, "Please check the form fields."); }
  if (!isObject(input)) return fail(422, "Please check the form fields.");
  const forward = { title: input.title, description: input.description, hazard_type: input.hazard_type, lat: input.lat, lon: input.lon };
  try {
    const response = await fetch(base() + "/v1/public-intake/reports", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { "content-type": "application/json" }, body: JSON.stringify(forward),
    });
    if (response.status === 503) return fail(503, "disabled");
    if (response.status === 413) return fail(413, "Report is too large");
    if (response.status === 422 || response.status === 429) {
      const body: unknown = await response.json().catch(() => null);
      const detail = isObject(body) && typeof body.detail === "string" && SAFE_DETAILS.has(body.detail) ? body.detail : "Please check the form fields.";
      return fail(response.status, detail, response.status === 429 ? { "Retry-After": response.headers.get("retry-after") === "3600" ? "3600" : "60" } : {});
    }
    if (response.status !== 201) throw new Error("unexpected status");
    const payload: unknown = await response.json();
    if (!isObject(payload) || payload.classification !== "public_unverified_intake" || payload.status !== "quarantined") throw new Error("unexpected");
    // A repeat of an earlier report gets a generic receipt: no id or time of the original is revealed.
    if (payload.duplicate === true) {
      return NextResponse.json({ classification: "public_unverified_intake", status: "quarantined", duplicate: true,
        message: "This report was already received. It is unverified and creates no case." }, { status: 201, headers: HEADERS });
    }
    const id = text(payload.id, 40), submitted = timestamp(payload.submitted_at);
    if (!id || !UUID.test(id) || !submitted) throw new Error("unexpected");
    return NextResponse.json({ classification: "public_unverified_intake", status: "quarantined", id, submitted_at: submitted,
      duplicate: payload.duplicate === true, message: "Received for human review. It is unverified, creates no case and notifies no responder." }, { status: 201, headers: HEADERS });
  } catch {
    return fail(502, "The report could not be submitted. Nothing was saved.");
  }
}
