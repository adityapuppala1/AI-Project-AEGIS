/** Validation and rendering for the A7 shift-handover brief and the A6 read-only operator copilot.
 * Every value from the API is re-validated here: ids must be canonical UUIDs (or allowlisted codes) and
 * text is template text from the API, bounded and stripped of control characters. Nothing here writes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE = /^[a-z][a-z0-9_.-]{0,79}$/;
export const COPILOT_MIN = 3;
export const COPILOT_MAX = 300;

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, max = 400) => (typeof value === "string" ? value : "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const code = (value: unknown): string | null => typeof value === "string" && CODE.test(value) ? value : null;
const uuid = (value: unknown): string | null => typeof value === "string" && UUID.test(value) ? value : null;
const ref = (value: unknown): string | null => uuid(value) ?? code(value);
const refs = (value: unknown, max = 20): string[] => Array.isArray(value) ? value.map(ref).filter((v): v is string => v !== null).slice(0, max) : [];
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const iso = (value: unknown): string | null => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
const arr = (value: unknown, max = 50): Record<string, unknown>[] => Array.isArray(value) ? value.filter(isObject).slice(0, max) : [];
const oneOf = <T extends string>(value: unknown, options: readonly T[]): T | null => options.includes(value as T) ? value as T : null;

/** Rejects control/format characters and enforces the same bounds as the API. */
export function validateQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length < COPILOT_MIN || text.length > COPILOT_MAX) return null;
  if (/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/.test(text)) return null;
  return text;
}

export type SectionStatus = "ok" | "disabled" | "unavailable";
export interface HandoverLine { section: string; code: string; text: string; refs: string[] }
export interface Handover {
  version: string; generated_at: string; since: string; hours: number;
  sections: Record<string, { status: SectionStatus; code: string | null }>;
  pending: { proposal_id: string; incident_id: string | null }[];
  counts: Record<string, number>;
  sla: { proposal_id: string; task_id: string; due_at: string; sla_status: string }[];
  runs: { run_id: string; status: string; next_step: string | null; awaiting_handoff: boolean }[];
  paused: boolean | null;
  lines: HandoverLine[];
  note: string;
}
const SECTIONS = ["watch", "runs", "evidence_changes", "scheduler", "approvals", "sla", "failures"] as const;

export function cleanHandover(payload: unknown): Handover | null {
  if (!isObject(payload) || payload.version !== "aegis.exercise.shift-handover.v1" || payload.read_only !== true || payload.operational_actions_enabled !== false) return null;
  const sections: Handover["sections"] = {};
  for (const key of SECTIONS) {
    const s = isObject(payload[key]) ? payload[key] as Record<string, unknown> : {};
    sections[key] = { status: oneOf(s.status, ["ok", "disabled", "unavailable"] as const) ?? "unavailable", code: code(s.code) };
  }
  const approvals = isObject(payload.approvals) ? payload.approvals : {};
  const counts: Record<string, number> = {};
  if (isObject(approvals.counts)) for (const k of ["draft", "submitted", "approved", "rejected"]) { const n = num(approvals.counts[k]); if (n !== null) counts[k] = n; }
  const sla = isObject(payload.sla) ? payload.sla : {};
  const runs = isObject(payload.runs) ? payload.runs : {};
  const scheduler = isObject(payload.scheduler) ? payload.scheduler : {};
  return {
    version: payload.version as string, generated_at: iso(payload.generated_at) ?? "", since: iso(payload.since) ?? "",
    hours: num(payload.hours) ?? 12, sections, counts,
    pending: arr(approvals.pending).map(p => ({ proposal_id: uuid(p.proposal_id), incident_id: uuid(p.incident_id) }))
      .filter((p): p is { proposal_id: string; incident_id: string | null } => p.proposal_id !== null),
    sla: arr(sla.tasks).map(t => ({ proposal_id: uuid(t.proposal_id) ?? "", task_id: code(t.task_id) ?? "", due_at: iso(t.due_at) ?? "", sla_status: code(t.sla_status) ?? "" }))
      .filter(t => t.proposal_id && t.task_id),
    runs: arr(runs.runs).map(r => ({ run_id: uuid(r.run_id) ?? "", status: code(r.status) ?? "", next_step: code(r.next_step), awaiting_handoff: r.awaiting_handoff === true }))
      .filter(r => r.run_id),
    paused: typeof scheduler.paused === "boolean" ? scheduler.paused : null,
    lines: arr(payload.lines, 200).map(l => ({ section: code(l.section) ?? "", code: code(l.code) ?? "", text: str(l.text, 300), refs: refs(l.refs) }))
      .filter(l => l.section && l.text && l.refs.length > 0),
    note: str(payload.note, 600),
  };
}

export type CopilotIntent = "find_incidents" | "incident_evidence" | "source_freshness" | "compare_sources" | "run_status" | "pending_approvals" | "handover_summary" | "explain_trigger" | "unsupported";
const INTENTS: readonly CopilotIntent[] = ["find_incidents", "incident_evidence", "source_freshness", "compare_sources", "run_status", "pending_approvals", "handover_summary", "explain_trigger", "unsupported"];
export interface CopilotAnswer {
  intent: CopilotIntent; status: "answered" | "abstained"; reason: string | null; tools: string[];
  facts: { text: string; refs: string[] }[]; cited: string[]; summary: string | null; generatedBy: string; modelStatus: string | null; note: string;
}

export function cleanCopilot(payload: unknown): CopilotAnswer | null {
  if (!isObject(payload) || payload.version !== "aegis.exercise.operator-copilot.v1" || payload.read_only !== true || payload.operational_actions_enabled !== false) return null;
  const intent = oneOf(payload.intent, INTENTS), status = oneOf(payload.status, ["answered", "abstained"] as const);
  if (!intent || !status) return null;
  const cited = refs(payload.cited_ids, 200);
  const citedSet = new Set(cited);
  const facts = arr(payload.facts, 50).map(f => ({ text: str(f.text, 400), refs: refs(f.refs).filter(r => citedSet.has(r)) })).filter(f => f.text && f.refs.length);
  // Defence in depth: a summary that mentions an id outside the cited set is dropped (template facts still show).
  let summary = typeof payload.summary === "string" ? str(payload.summary, 1200) : null;
  if (summary && (summary.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []).some(id => !citedSet.has(id.toLowerCase()))) summary = null;
  return { intent, status, reason: code(payload.reason), tools: refs(payload.tools_called, 4), facts, cited, summary,
    generatedBy: code(payload.generated_by) ?? "deterministic_template", modelStatus: code(payload.model_status), note: str(payload.note, 600) };
}

const ist = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) + " IST";
};
const SECTION_TITLE: Record<string, string> = {
  watch: "Open watches and candidates", runs: "Proactive runs", evidence_changes: "Evidence changes (sentinel)", approvals: "Pending approvals",
  sla: "Overdue synthetic SLA tasks", failures: "Connector and scheduler failures", scheduler: "Scheduler ticks",
};

/** Deterministic Markdown export; only cited template lines from the API. */
export function handoverMarkdown(brief: Handover): string {
  const out = [
    "# AEGIS shift-handover brief — EXERCISE ONLY", "",
    "> **SYNTHETIC.** Agency-scoped exercise records. Not a warning, forecast, approval or dispatch. Synthetic SLA targets are rehearsal targets, not contractual SLAs.",
    "> Generated from a fixed template; no AI model wrote any text below.", "",
    `Window: ${ist(brief.since)} to ${ist(brief.generated_at)} (${brief.hours} h)`,
    `Kill switch: ${brief.paused === null ? "unknown" : brief.paused ? "PAUSED" : "not paused"}`,
    `Proposals: ${Object.entries(brief.counts).map(([k, v]) => `${k} ${v}`).join(", ") || "unavailable"}`, "",
  ];
  for (const key of SECTIONS) {
    out.push(`## ${SECTION_TITLE[key]}`);
    const s = brief.sections[key];
    if (s.status !== "ok") { out.push(`_Section ${s.status}${s.code ? ` (${s.code})` : ""}._`, ""); continue; }
    const lines = brief.lines.filter(l => l.section === key);
    if (!lines.length) out.push("_Nothing in this window._");
    for (const line of lines) out.push(`- ${line.text.replace(/\|/g, "\\|")} — ${line.refs.map(r => `\`${r}\``).join(", ")}`);
    out.push("");
  }
  out.push("## Scope and limits", `- ${brief.note}`, "- Nothing was submitted, approved, notified or dispatched by producing this brief.", "");
  return out.join("\n");
}

export const handoverFileName = (generatedAt: string, ext: "md" | "json") => `aegis-shift-handover-${(generatedAt || "now").replace(/[^0-9]/g, "").slice(0, 12) || "now"}.${ext}`;
