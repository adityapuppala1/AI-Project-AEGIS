// Pure helpers for the IndTrana UI kit. No React or DOM imports so they can be unit tested directly.

export const TONES = ["neutral", "info", "success", "warning", "danger", "sample"] as const;
export type Tone = (typeof TONES)[number];
export type ToneIconName = "circle" | "info" | "check" | "alert" | "shield-alert" | "flask";

/** Every tone carries an icon so meaning never relies on colour alone. */
export const TONE_ICON_NAME: Record<Tone, ToneIconName> = {
  neutral: "circle", info: "info", success: "check", warning: "alert", danger: "shield-alert", sample: "flask",
};
/** Pill classes: tinted background, AA-contrast text in both themes, ring. */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30",
  info: "bg-sky-500/10 text-sky-800 dark:text-sky-300 ring-sky-500/30",
  success: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 ring-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-500/35",
  danger: "bg-rose-500/10 text-rose-800 dark:text-rose-300 ring-rose-500/30",
  sample: "bg-amber-500/10 text-amber-800 dark:text-amber-200 ring-amber-500/40",
};
export const TONE_BAR_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-500", info: "bg-sky-600", success: "bg-emerald-600", warning: "bg-amber-500", danger: "bg-rose-600", sample: "bg-amber-500",
};

export const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

export type AgeUnit = "now" | "min" | "hr" | "days";
export interface AgeParts { n: number; unit: AgeUnit }
/** Relative age of an ISO timestamp, or null when it is missing or unparseable. Same bands as the Hazard Watch. */
export function relativeAge(iso: string | null | undefined, nowMs: number): AgeParts | null {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return null;
  const minutes = Math.max(0, Math.round((nowMs - time) / 60_000));
  if (minutes < 1) return { n: 0, unit: "now" };
  if (minutes < 90) return { n: minutes, unit: "min" };
  if (minutes < 48 * 60) return { n: Math.round(minutes / 60), unit: "hr" };
  return { n: Math.round(minutes / 1440), unit: "days" };
}

export const DEFAULT_STALE_HOURS = 48;
/** Honest staleness: an unknown or unparseable time counts as stale, never as fresh. */
export function isStaleAge(iso: string | null | undefined, nowMs: number, thresholdHours = DEFAULT_STALE_HOURS): boolean {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return true;
  return nowMs - time > thresholdHours * 3_600_000;
}

/** Deterministic absolute time (UTC) used for title tooltips; identical on server and client. */
export function formatAbsolute(iso: string | null | undefined): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return "";
  return new Date(time).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Roving-focus target for a key press, or null when the key is not a navigation key. */
export function nextIndex(key: string, current: number, count: number, orientation: "horizontal" | "vertical" | "both" = "horizontal"): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const forward = key === "ArrowRight" ? orientation !== "vertical" : key === "ArrowDown" ? orientation !== "horizontal" : false;
  const back = key === "ArrowLeft" ? orientation !== "vertical" : key === "ArrowUp" ? orientation !== "horizontal" : false;
  if (forward) return (current + 1) % count;
  if (back) return (current - 1 + count) % count;
  return null;
}

export type SortDirection = "asc" | "desc";
export const ariaSort = (direction: SortDirection | null): "ascending" | "descending" | "none" =>
  direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";
export const nextSort = (direction: SortDirection | null): SortDirection | null =>
  direction === null ? "asc" : direction === "asc" ? "desc" : null;

/**
 * Stable sort of rows by one key. Numbers compare numerically, other values as text with embedded numbers in order
 * (item 2 before item 10). Missing values (null, undefined, NaN) always sort last, in both directions. A null direction
 * returns the rows in their original order. Never mutates the input.
 */
export function sortRows<T>(rows: readonly T[], value: (row: T) => string | number | null | undefined, direction: SortDirection | null): T[] {
  if (direction === null) return [...rows];
  const sign = direction === "asc" ? 1 : -1;
  const missing = (v: unknown): boolean => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) || v === "";
  return rows.map((row, index) => ({ row, index, key: value(row) })).sort((a, b) => {
    const am = missing(a.key), bm = missing(b.key);
    if (am || bm) return am && bm ? a.index - b.index : am ? 1 : -1;
    const order = typeof a.key === "number" && typeof b.key === "number" ? a.key - b.key
      : String(a.key).localeCompare(String(b.key), "en", { numeric: true, sensitivity: "base" });
    return order === 0 ? a.index - b.index : order * sign;
  }).map(entry => entry.row);
}

export const STEP_STATUSES = ["pending", "current", "done", "blocked"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
