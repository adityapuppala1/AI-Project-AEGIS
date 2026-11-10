import { NextResponse } from "next/server";
import { configuration, readSession, sameOrigin, type Role } from "../../../lib/auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Same-origin relay for the optional TimesFM statistical forecast (display-only, off by default on the API).
// The bearer token stays on the server. Only a bounded list of numbers is forwarded, and only a re-validated
// forecast is returned. Nothing is stored and nothing here can create or change a case, proposal or alert.
const READ_ROLES: Role[] = ["incident_operator", "incident_checker", "incident_auditor", "platform_admin"];
const KINDS = new Set(["river_discharge", "rainfall"]);
const MIN_POINTS = 60, MAX_POINTS = 2048, MAX_HORIZON = 64, MAX_VALUE = 1_000_000, MAX_BODY = 40_000;
const CODES = new Set(["switched_off", "model_unavailable", "series_out_of_range", "series_is_constant"]);

const fail = (status: number, error: string, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const numbers = (value: unknown, length: number): number[] | null =>
  Array.isArray(value) && value.length === length && value.every(item => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= MAX_VALUE) ? value as number[] : null;

async function operatorToken(request: Request, write: boolean): Promise<string | NextResponse> {
  let config: ReturnType<typeof configuration>;
  try { config = configuration(); } catch { return fail(503, "Identity provider configuration invalid"); }
  if (!config) return fail(503, "Identity provider not configured");
  const session = await readSession();
  if (!session) return fail(401, "Secure operator sign-in required");
  if (write && !sameOrigin(request, config)) return fail(403, "Invalid request origin");
  if (!session.roles.some(role => READ_ROLES.includes(role))) return fail(403, "Insufficient role");
  return session.accessToken;
}

async function upstream(path: string, token: string, body?: string) {
  const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
  return fetch(base + path, {
    method: body ? "POST" : "GET", body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(60_000),
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
  });
}

export async function GET(request: Request) {
  const token = await operatorToken(request, false);
  if (typeof token !== "string") return token;
  try {
    const response = await upstream("/v1/statistical-forecast/status", token);
    const data = response.ok ? await response.json() as unknown : null;
    const enabled = isObject(data) && data.enabled === true && data.display_only === true;
    const reason = isObject(data) && typeof data.reason_code === "string" && CODES.has(data.reason_code) ? data.reason_code : enabled ? null : "model_unavailable";
    return NextResponse.json({ enabled, reason, model: "timesfm-2.5-200m" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ enabled: false, reason: "model_unavailable", model: "timesfm-2.5-200m" }, { headers: { "Cache-Control": "no-store" } }); }
}

export async function POST(request: Request) {
  const token = await operatorToken(request, true);
  if (typeof token !== "string") return token;
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) return fail(413, "Too much data");
  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, "Too much data");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return fail(400, "Invalid request"); }
  if (!isObject(parsed) || Object.keys(parsed).some(key => !["kind", "series", "horizon"].includes(key))) return fail(400, "Invalid request");
  const { kind, series, horizon } = parsed;
  if (typeof kind !== "string" || !KINDS.has(kind)) return fail(400, "Unknown series kind");
  if (typeof horizon !== "number" || !Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON) return fail(400, "Horizon must be 1-64");
  if (!Array.isArray(series) || series.length < MIN_POINTS || series.length > MAX_POINTS) return fail(400, "Between 60 and 2048 values are needed");
  const clean = numbers(series.map(value => typeof value === "number" ? Math.round(value * 1000) / 1000 : value), series.length);
  if (!clean) return fail(400, "Values must be numbers from 0 to 1,000,000");
  try {
    const response = await upstream("/v1/statistical-forecast", token, JSON.stringify({ kind, series: clean, horizon }));
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as unknown;
      const code = isObject(detail) && typeof detail.detail === "string" && CODES.has(detail.detail) ? detail.detail : undefined;
      return fail([401, 403, 422, 503].includes(response.status) ? response.status : 502, "Statistical forecast unavailable", code);
    }
    const data = await response.json() as unknown;
    if (!isObject(data) || data.status !== "ok" || data.classification !== "statistical_estimate" || data.display_only !== true || data.is_accuracy !== false) return fail(502, "Unexpected forecast reply");
    const point = numbers(data.point, horizon), q10 = numbers(data.q10, horizon), q90 = numbers(data.q90, horizon);
    if (!point || !q10 || !q90) return fail(502, "Unexpected forecast reply");
    const check = isObject(data.holdout) && data.holdout.is_accuracy === false && [data.holdout.points, data.holdout.model_mean_abs_error, data.holdout.repeat_last_value_mean_abs_error, data.holdout.inside_10_90_range].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
      ? { points: data.holdout.points as number, modelError: data.holdout.model_mean_abs_error as number, repeatLastError: data.holdout.repeat_last_value_mean_abs_error as number, insideRange: data.holdout.inside_10_90_range as number } : null;
    return NextResponse.json({ model: "timesfm-2.5-200m", kind, horizon, point, q10, q90, holdout: check, statisticalEstimate: true, isAccuracy: false }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail(503, "Statistical forecast unavailable", "model_unavailable"); }
}
