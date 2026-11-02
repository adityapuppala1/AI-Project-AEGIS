"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useT } from "../language-provider";
import { ariaSort, nextSort, type SortDirection } from "./helpers";

/**
 * Sortable column header. `direction` is the current sort of THIS column (null when unsorted); `onSort` receives the
 * next direction (asc, desc, then cleared). Renders a <th aria-sort> holding a button. `label` is already translated.
 */
export function SortableHeader({ label, direction, onSort, className = "" }: Readonly<{
  label: string; direction: SortDirection | null; onSort: (next: SortDirection | null) => void; className?: string;
}>) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  return <th scope="col" aria-sort={ariaSort(direction)} className={`px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted ${className}`}>
    <button type="button" onClick={() => onSort(nextSort(direction))} className="inline-flex min-h-8 items-center gap-1 rounded-md hover:text-ink">
      {label}<Icon size={12} aria-hidden="true" /></button>
  </th>;
}

/**
 * Horizontal-scroll table container: a focusable named region (so keyboard users can scroll) with a visually hidden
 * caption. Pass <thead>/<tbody> as children.
 *
 * Mobile card-list fallback pattern (below md, wide tables are hard to scan): render the same rows twice and toggle
 * with Tailwind, keeping the HTML table as the source of truth for screen readers on desktop:
 *   <ResponsiveTable className="hidden md:block" ...>...</ResponsiveTable>
 *   <ul className="space-y-2 md:hidden">{rows.map(r => <li key={r.id} className="panel p-3">
 *     <dl className="grid grid-cols-2 gap-1 text-xs"><dt className="text-muted">Name</dt><dd>{r.name}</dd></dl></li>)}</ul>
 * Use KeyValueList for the card body. Both views must expose the same fields and actions.
 */
export function ResponsiveTable({ label, caption, children, className = "" }: Readonly<{ label: string; caption: string; children: ReactNode; className?: string }>) {
  return <div role="region" aria-label={label} tabIndex={0} className={`overflow-x-auto ${className}`}>
    <table className="w-full min-w-[40rem] border-collapse text-sm"><caption className="sr-only">{caption}</caption>{children}</table>
  </div>;
}

/** Visible hint under a scrollable table; optional. */
export function ScrollHint() {
  const t = useT();
  return <p className="px-3 py-1 text-[11px] text-muted sm:hidden">{t("Scroll sideways to see all columns")}</p>;
}
