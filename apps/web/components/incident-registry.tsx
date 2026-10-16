"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowDownUp, ArrowUp, ChevronLeft, ChevronRight, MapPin, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { AppShell } from "./app-shell";
import { StatusBadge } from "./status-badge";
import type { Incident, IncidentStatus } from "../lib/types";

type SortKey = "created_at" | "hazard_type" | "status";
type Direction = "asc" | "desc";
type StatusFilter = "all" | IncidentStatus;
interface IncidentPage {
  items: Incident[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  source: "synthetic_exercise";
}
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "review", label: "Awaiting review" },
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "created_at", label: "Created" },
  { value: "hazard_type", label: "Incident" },
  { value: "status", label: "Status" },
];

export function IncidentRegistry() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [direction, setDirection] = useState<Direction>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<IncidentPage | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // The URL is read once after hydration, avoiding an SSR dependency on window.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) {
      setQuery(initial.slice(0, 120));
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim().slice(0, 120)), 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => { setPage(1); }, [debounced, filter, sort, direction, pageSize]);

  const params = useMemo(() => {
    const values = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort, direction,
    });
    if (filter !== "all") values.set("status", filter);
    if (debounced) values.set("search", debounced);
    return values.toString();
  }, [page, pageSize, sort, direction, filter, debounced]);

  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    fetch("/api/incidents/query?" + params, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Exercise incident search unavailable");
        const data = await response.json() as IncidentPage;
        if (!Array.isArray(data.items) || !Number.isFinite(data.total)) throw new Error("Unexpected incident response");
        if (!controller.signal.aborted) {
          if (page > data.total_pages) setPage(Math.max(1, data.total_pages));
          else {
            setResult(data);
            setError(null);
            setLastSync(new Date().toISOString());
          }
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Incident search unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [params, page, reload]);

  const items = result?.items || [];
  const count = result?.total ?? 0;
  const totalPages = result?.total_pages ?? 1;
  const first = count ? ((result?.page ?? page) - 1) * pageSize + 1 : 0;
  const last = Math.min(count, ((result?.page ?? page) - 1) * pageSize + items.length);
  function sortBy(next: SortKey) {
    if (sort === next) setDirection(prev => prev === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection(next === "created_at" ? "desc" : "asc"); }
  }
  function sortIcon(key: SortKey) {
    return sort !== key ? <ArrowDownUp size={14} aria-hidden="true"/> :
      direction === "asc" ? <ArrowUp size={14} aria-hidden="true"/> : <ArrowDown size={14} aria-hidden="true"/>;
  }
  const header = (key: SortKey, title: string) =>
    <th scope="col" className="px-5 py-3.5">
      <button type="button" className="inline-flex items-center gap-2 rounded-md font-semibold hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`Sort by ${title}, ${sort === key ? (direction === "asc" ? "ascending" : "descending") : "not selected"}`}
        onClick={() => sortBy(key)}>{title}{sortIcon(key)}</button>
    </th>;

  return <AppShell title="Incident Registry" description="Explore synthetic incident records with server-side searching, sorting, filters and pagination.">
    <section className="panel overflow-hidden" aria-label="Exercise incident registry">
      <div className="panel-heading">
        <div><h2 className="text-base font-bold">Operational incident records</h2>
          <p className="mt-1 text-xs text-muted">Exercise-only · paginated PostGIS query</p></div>
        <button type="button" className="control" disabled={pending} onClick={() => setReload(n => n + 1)}>
          <RefreshCw size={16} className={pending ? "animate-spin" : ""}/> Refresh
        </button>
      </div>
      <div className="flex flex-col gap-3 border-b border-stroke p-4 sm:flex-row sm:items-center sm:p-5">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Search hazard or incident ID</span>
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted"/>
          <input className="field !pl-10" type="search" value={query} maxLength={120}
            onChange={event => setQuery(event.target.value)} placeholder="Search hazard or incident ID..."/>
        </label>
        <label className="flex items-center gap-2">
          <SlidersHorizontal size={17} aria-hidden="true" className="shrink-0 text-muted"/>
          <span className="sr-only">Filter status</span>
          <select value={filter} onChange={event => setFilter(event.target.value as StatusFilter)} className="field min-w-[175px]">
            {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span>Rows</span><select className="field !w-20" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
            {[10,25,50].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke bg-elevated/30 px-5 py-2.5 text-xs text-muted">
        <span role="status" aria-live="polite">{pending ? "Refreshing results..." : `Showing ${first}–${last} of ${count} incident records`}</span>
        <span>{lastSync ? `Updated ${new Date(lastSync).toLocaleTimeString()}` : "Awaiting data"} · Data source: synthetic exercise</span>
      </div>
      {error && <div role="alert" className="border-b border-rose-500/25 bg-rose-500/10 px-5 py-3 text-sm text-rose-700 dark:text-rose-300">{error}. Any visible results may be stale.</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-sm">
          <caption className="sr-only">Exercise incident list; column headings sort the records</caption>
          <thead className="bg-elevated/60 text-xs uppercase tracking-wider text-muted"><tr>
            {header("hazard_type", "Incident")}
            {header("status", "Status")}
            <th scope="col" className="px-5 py-3.5">Coordinates</th>
            {header("created_at", "Created")}
            <th scope="col" className="px-5 py-3.5">Case ID</th>
          </tr></thead>
          <tbody className="divide-y divide-stroke">
            {items.map(item => <tr key={item.id} className="transition-colors hover:bg-elevated/40">
              <td className="px-5 py-4 font-semibold"><Link href={"/incidents/" + item.id} className="rounded-sm text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" title="Inspect exercise evidence and chronology">{item.hazard_type}</Link></td>
              <td className="px-5 py-4"><StatusBadge status={item.status}/></td>
              <td className="px-5 py-4 font-mono text-xs tabular-nums text-muted"><MapPin size={13} aria-hidden="true" className="mr-1 inline"/>{item.lat?.toFixed(4) ?? "—"}, {item.lon?.toFixed(4) ?? "—"}</td>
              <td className="px-5 py-4 text-xs text-muted">{new Date(item.created_at).toLocaleString()}</td>
              <td className="px-5 py-4 font-mono text-xs text-muted" title={item.id}>{item.id.slice(0,8)}</td>
            </tr>)}
          </tbody>
        </table>
        {!pending && !error && items.length === 0 && <div className="px-5 py-12 text-center text-sm text-muted">
          No incidents match. Try changing the search term or status filter.
          <button type="button" className="mx-auto mt-4 block text-accent underline" onClick={() => { setQuery("");setFilter("all"); }}>Clear filters</button>
        </div>}
        {pending && !result && <p className="px-5 py-12 text-center text-sm text-muted">Loading exercise incidents…</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-4">
        <p className="text-xs text-muted">Page {result?.page ?? page} of {totalPages}</p>
        <div className="flex items-center gap-2">
          <button type="button" className="control" onClick={() => setPage(n => Math.max(1,n - 1))} disabled={pending || page <= 1}>
            <ChevronLeft size={16}/> Previous
          </button>
          <button type="button" className="control" onClick={() => setPage(n => Math.min(totalPages,n + 1))} disabled={pending || page >= totalPages}>
            Next <ChevronRight size={16}/>
          </button>
        </div>
      </div>
    </section>
  </AppShell>;
}
