import type { ExerciseAgencyTask } from "./agency-sync";

/** Synthetic planning parameter for the exercise board only; not real staffing or capacity data. */
export const DEMO_CAPACITY = 3;

export type TeamStatus = "available" | "engaged" | "at_capacity";
export type TeamKind = "police" | "transport" | "municipal" | "rescue" | "health" | "comms" | "general";
export interface TeamSummary {
  label: string; kind: TeamKind; prepared: number; acknowledged: number; closed: number;
  open: number; overdue: number; nextDueAt: string | null; load: number; status: TeamStatus;
}

export function teamKind(label: string): TeamKind {
  const text = label.toLowerCase();
  if (/police|law|security/.test(text)) return "police";
  if (/transport|traffic|road|transit/.test(text)) return "transport";
  if (/municipal|ghmc|drain|water|works|civic|infrastructure/.test(text)) return "municipal";
  if (/rescue|fire|disaster|sdrf|ndrf|emergency/.test(text)) return "rescue";
  if (/health|medical|hospital|ambulance/.test(text)) return "health";
  if (/guidance|information|communication|media|public/.test(text)) return "comms";
  return "general";
}

/** Group scripted exercise tasks by agency label. Read-only; never changes task state. */
export function summarizeTeams(tasks: ExerciseAgencyTask[], capacity = DEMO_CAPACITY): TeamSummary[] {
  const groups = new Map<string, ExerciseAgencyTask[]>();
  for (const task of tasks) groups.set(task.agency_label, [...(groups.get(task.agency_label) ?? []), task]);
  const cap = Math.max(1, Math.floor(capacity));
  return [...groups.entries()].map(([label, items]) => {
    const prepared = items.filter(task => task.state === "prepared").length;
    const acknowledged = items.filter(task => task.state === "acknowledged").length;
    const closed = items.filter(task => task.state === "closed").length;
    const open = prepared + acknowledged;
    const dues = items.filter(task => task.state !== "closed").map(task => task.due_at).filter(due => !Number.isNaN(Date.parse(due))).sort();
    return {
      label, kind: teamKind(label), prepared, acknowledged, closed, open,
      overdue: items.filter(task => task.demo_due_window_elapsed).length,
      nextDueAt: dues[0] ?? null,
      load: Math.min(1, open / cap),
      status: open === 0 ? "available" : open >= cap ? "at_capacity" : "engaged",
    } satisfies TeamSummary;
  }).sort((a, b) => b.load - a.load || b.overdue - a.overdue || a.label.localeCompare(b.label));
}
