"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useT } from "../language-provider";
import { ariaSort, nextSort, sortRows, type SortDirection } from "./helpers";

/**
 * Sortable column header. `direction` is the current sort of THIS column (null when unsorted); `onSort` receives the
 * next direction (asc, desc, then cleared). Renders a <th aria-sort> holding a button. `label` is already translated.
 */
export function SortableHeader({ label, direction, onSort, numeric = false, className = "" }: Readonly<{
  label: string; direction: SortDirection | null; onSort: (next: SortDirection | null) => void; numeric?: boolean; className?: string;
}>) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  return <th scope="col" aria-sort={ariaSort(direction)} className={`px-3 py-2 text-left text-xs font-semibold text-muted ${numeric ? "num" : ""} ${className}`}>
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
    <table className="data-table min-w-[40rem]"><caption className="sr-only">{caption}</caption>{children}</table>
  </div>;
}

/** Visible hint under a scrollable table; optional. */
export function ScrollHint() {
  const t = useT();
  return <p className="px-3 py-1 text-[11px] text-muted sm:hidden">{t("Scroll sideways to see all columns")}</p>;
}

/**
 * The one table pattern. A named, keyboard-scrollable region holding a .data-table: sticky header (set maxHeight for
 * long tables), row hover and focus, tabular numbers, and an empty row when there is nothing to list. Numeric columns
 * take className="num" on both <th> and <td>. Pass <thead>/<tbody> as children; "empty" replaces the body when "rows" is 0.
 */
export function DataTable({ label, caption, children, rows, empty, columns, minWidth = "36rem", maxHeight, className = "" }: Readonly<{
  label: string; caption?: string; children: ReactNode; rows?: number; empty?: ReactNode; columns?: number; minWidth?: string; maxHeight?: string; className?: string;
}>) {
  const t = useT();
  return <div role="region" aria-label={label} tabIndex={0} className={`table-scroll overflow-auto ${className}`} style={maxHeight ? { maxHeight } : undefined}>
    <table className="data-table" style={{ minWidth }}><caption className="sr-only">{caption ?? label}</caption>
      {children}
      {rows === 0 && <tbody><tr><td colSpan={columns ?? 99} className="!py-6 text-center text-muted">{empty ?? t("Nothing to show")}</td></tr></tbody>}
    </table>
  </div>;
}

export interface TableColumn<T> {
  key: string;
  /** Already-translated column heading. Also the label on the phone card. */
  label: string;
  numeric?: boolean;
  /** Present = the column sorts by this value. Missing values sort last. */
  sortValue?: (row: T) => string | number | null | undefined;
  cell: (row: T) => ReactNode;
  /** Extra classes for the cell (desktop and phone card value). */
  className?: string;
}

/**
 * The sortable table: one column list drives the desktop DataTable (sortable headers with aria-sort, numeric columns
 * right-aligned with tabular numbers) and the stacked-card list shown below the md breakpoint, so both expose the same
 * fields. On phones a small "Sort by" select replaces the headers. Sorting never changes the data, only the order.
 */
export function SortableTable<T>({ label, caption, rows, columns, rowKey, defaultSort, minWidth, maxHeight, className = "", empty }: Readonly<{
  label: string; caption?: string; rows: readonly T[]; columns: readonly TableColumn<T>[]; rowKey: (row: T, index: number) => string;
  defaultSort?: { key: string; direction: SortDirection }; minWidth?: string; maxHeight?: string; className?: string; empty?: ReactNode;
}>) {
  const t = useT();
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(defaultSort ?? null);
  const active = sort ? columns.find(column => column.key === sort.key) : undefined;
  const sorted = useMemo(() => active?.sortValue && sort ? sortRows(rows, active.sortValue, sort.direction) : [...rows], [rows, active, sort]);
  const sortable = columns.filter(column => column.sortValue);
  const encoded = sort ? `${sort.key}|${sort.direction}` : "";
  const [lead, ...others] = columns;
  return <div className={className}>
    <div className="hidden md:block">
      <DataTable label={label} caption={caption} rows={sorted.length} empty={empty} columns={columns.length} minWidth={minWidth} maxHeight={maxHeight}>
        <thead><tr>{columns.map(column => column.sortValue
          ? <SortableHeader key={column.key} label={column.label} numeric={column.numeric} direction={sort?.key === column.key ? sort.direction : null}
              onSort={next => setSort(next ? { key: column.key, direction: next } : null)}/>
          : <th key={column.key} scope="col" className={column.numeric ? "num" : ""}>{column.label}</th>)}</tr></thead>
        {sorted.length > 0 && <tbody>{sorted.map((row, index) => <tr key={rowKey(row, index)}>{columns.map(column =>
          <td key={column.key} className={`${column.numeric ? "num" : ""} ${column.className ?? ""}`}>{column.cell(row)}</td>)}</tr>)}</tbody>}
      </DataTable>
    </div>
    <div className="md:hidden">
      {sortable.length > 0 && <label className="mb-2 flex items-center gap-2 text-xs font-semibold">{t("Sort by")}
        <select className="field !w-auto" value={encoded} onChange={event => { const [key, direction] = event.target.value.split("|"); setSort(key ? { key, direction: direction as SortDirection } : null); }}>
          <option value="">{t("Original order")}</option>
          {sortable.flatMap(column => (["asc", "desc"] as const).map(direction =>
            <option key={`${column.key}|${direction}`} value={`${column.key}|${direction}`}>{column.label} · {direction === "asc" ? t("ascending") : t("descending")}</option>))}
        </select></label>}
      {sorted.length === 0 ? <p className="py-4 text-center text-sm text-muted">{empty ?? t("Nothing to show")}</p>
        : <ul aria-label={label} className="space-y-2">{sorted.map((row, index) => <li key={rowKey(row, index)} className="panel p-3 text-sm">
          <div className="font-semibold">{lead.cell(row)}</div>
          <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">{others.map(column => <div key={column.key} className="contents">
            <dt className="text-muted">{column.label}</dt><dd className={`min-w-0 break-words ${column.numeric ? "tnum" : ""} ${column.className ?? ""}`}>{column.cell(row)}</dd></div>)}</dl>
        </li>)}</ul>}
    </div>
  </div>;
}
