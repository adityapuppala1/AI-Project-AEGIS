import type { IncidentStatus } from "../lib/types";
import { STATUS_LABELS } from "../lib/types";

const variants: Record<IncidentStatus, string> = {
  new: "bg-sky-500/10 text-sky-600 dark:text-sky-300 ring-sky-500/20",
  review: "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/20",
  active: "bg-rose-500/10 text-rose-600 dark:text-rose-300 ring-rose-500/20",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${variants[status] ?? variants.new}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABELS[status] ?? status}
  </span>;
}
