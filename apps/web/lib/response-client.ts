// Browser calls to the same-origin team response routes (lib/response-proxy.ts). Exercise only: nothing here contacts
// anyone outside AEGIS. Every answer is re-validated before the screens use it, and every failure becomes one plain
// sentence. The server's own sentence is shown for a refused write (409/400/422); it never carries a raw exception.
import { RESPONSE_FAILURE_TEXTS as TEXT } from "./labels";
import { cleanRequest, cleanRequests, cleanSuggestions, type ResponseRequest, type TeamSuggestions } from "./response-ui";

export interface Outcome<T> { ok: boolean; status: number; data?: T; message: string }

const fixed = (data: unknown): string | null => {
  if (typeof data !== "object" || data === null) return null;
  const { detail, error } = data as { detail?: unknown; error?: unknown };
  const text = typeof detail === "string" ? detail : typeof error === "string" ? error : null;
  return text && text.length <= 300 ? text : null;
};
/** The sentence for a failed call (English; callers pass it through t()). */
export function failureMessage(status: number, data: unknown): string {
  if (status === 401) return TEXT.signedOut;
  if (status === 403) return TEXT.forbidden;
  if (status === 409) return fixed(data) ?? TEXT.changed;
  if (status === 400 || status === 413 || status === 422) return fixed(data) ?? TEXT.invalid;
  if (status === 503 || status === 0) return TEXT.unavailable;
  return TEXT.unconfirmed;
}

async function call<T>(url: string, init: RequestInit, parse: (data: unknown) => T | null): Promise<Outcome<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status, message: failureMessage(response.status, data) };
    const parsed = parse(data);
    return parsed === null ? { ok: false, status: response.status, message: failureMessage(500, null) } : { ok: true, status: response.status, data: parsed, message: "" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { ok: false, status: -1, message: "" };
    return { ok: false, status: 0, message: failureMessage(0, null) };
  }
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const one = (data: unknown) => cleanRequest((data as { request?: unknown } | null)?.request);

export const listRequests = (incidentId: string | undefined, signal?: AbortSignal): Promise<Outcome<ResponseRequest[]>> =>
  call("/api/response/requests" + (incidentId ? "?incident_id=" + encodeURIComponent(incidentId) : ""), { signal }, cleanRequests);

export const submitReport = (requestId: string, body: { kind: string; expected_version: number; note: string; code?: string }): Promise<Outcome<ResponseRequest>> =>
  call(`/api/response/requests/${encodeURIComponent(requestId)}/reports`, json("POST", body), one);

export const createRequest = (body: { proposal_id: string; task_id: string; team_id: string; expected_assignment_version: number; note: string }): Promise<Outcome<ResponseRequest>> =>
  call("/api/response/requests", json("POST", body), one);

export const loadSuggestions = (proposalId: string, taskId: string, signal?: AbortSignal): Promise<Outcome<TeamSuggestions>> =>
  call("/api/response/teams?" + new URLSearchParams({ proposal_id: proposalId, task_id: taskId }).toString(), { signal }, cleanSuggestions);

export const loadAlertCount = (signal?: AbortSignal): Promise<Outcome<number>> =>
  call("/api/response/alerts", { signal }, data => {
    const count = (data as { count?: unknown } | null)?.count;
    return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
  });
