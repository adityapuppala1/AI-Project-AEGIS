"use client";

import { RecordRef } from "./ui";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardList, Eye, FlaskConical, Link2, MapPin, RefreshCw, SearchX } from "lucide-react";
import { AppShell } from "./app-shell";
import { StatusBadge } from "./status-badge";
import { useT } from "./language-provider";
import {
  DataFreshness, EmptyState, ErrorState, KeyValueList, Panel, ResponsiveTable, SearchField, SegmentedControl, SkeletonRows,
  SortableHeader, StatStrip, StatTile, StatusPill, type SortDirection,
} from "./ui";
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
const STATUS_VALUES: StatusFilter[] = ["all", "new", "review", "active", "resolved"];
const SORT_VALUES: SortKey[] = ["created_at", "hazard_type", "status"];
const SIZES = [10, 25, 50] as const;

/** Arrow keys move focus between case links of one list (table or card list) without changing tab order. */
function moveRowFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
  const target = event.target as HTMLElement;
  if (!target.hasAttribute("data-row-link")) return;
  const links = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-row-link]"));
  const at = links.indexOf(target);
  if (at < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : event.key === "ArrowDown" ? Math.min(links.length - 1, at + 1) : Math.max(0, at - 1);
  links[next]?.focus();
}

export function IncidentRegistry() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [direction, setDirection] = useState<Direction>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<IncidentPage | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [viewNotice, setViewNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Deep links preserve synthetic-only filter presets; no protected data is stored.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search);
    const initialQuery = url.get("q");
    const initialStatus = url.get("status");
    const initialSort = url.get("sort");
    const initialDirection = url.get("dir");
    const initialSize = Number(url.get("size"));
    if (initialQuery) setQuery(initialQuery.slice(0, 120));
    if (STATUS_VALUES.includes(initialStatus as StatusFilter)) setFilter(initialStatus as StatusFilter);
    if (SORT_VALUES.includes(initialSort as SortKey)) setSort(initialSort as SortKey);
    if (initialDirection === "asc" || initialDirection === "desc") setDirection(initialDirection);
    if ((SIZES as readonly number[]).includes(initialSize)) setPageSize(initialSize);
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
  const selected = items.find(item => item.id === selectedId) ?? items[0] ?? null;
  const reviewOnPage = items.filter(item => item.status === "review").length;
  const activeOnPage = items.filter(item => item.status === "active").length;

  async function copyViewLink() {
    const url = new URL(window.location.href);
    url.search = "";
    if (query.trim()) url.searchParams.set("q", query.trim().slice(0, 120));
    if (filter !== "all") url.searchParams.set("status", filter);
    if (sort !== "created_at") url.searchParams.set("sort", sort);
    if (direction !== "desc") url.searchParams.set("dir", direction);
    if (pageSize !== 10) url.searchParams.set("size", String(pageSize));
    try {
      await navigator.clipboard.writeText(url.toString());
      setViewNotice(t("Current synthetic filter view link copied."));
    } catch { setViewNotice(t("Unable to copy link. Use the browser address bar.")); }
  }
  // Server-side sort semantics are unchanged: a new column starts at its default direction, the same column toggles.
  function sortBy(next: SortKey) {
    if (sort === next) setDirection(prev => prev === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection(next === "created_at" ? "desc" : "asc"); }
  }
  const dirFor = (key: SortKey): SortDirection | null => sort === key ? direction : null;
  const clearFilters = () => { setQuery(""); setFilter("all"); };
  const statusOptions = [
    { value: "all" as StatusFilter, label: t("All statuses") },
    { value: "new" as StatusFilter, label: t("New") },
    { value: "review" as StatusFilter, label: t("Awaiting review") },
    { value: "active" as StatusFilter, label: t("Active") },
    { value: "resolved" as StatusFilter, label: t("Resolved") },
  ];
  const sizeOptions = SIZES.map(size => ({ value: String(size), label: String(size) }));
  const coords = (item: Incident) => `${item.lat?.toFixed(4) ?? "—"}, ${item.lon?.toFixed(4) ?? "—"}`;
  // inline-flex + min-h-9 gives the title link a thumb-sized target (WCAG 2.5.8 needs at least 24px).
  const linkClass = "inline-flex min-h-9 items-center rounded-xs text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

  return <AppShell title="Incident Registry" description="Explore synthetic incident records with server-side searching, sorting, filters and pagination.">
    <StatStrip label={t("Registry summary")}>
      <StatTile index={0} icon={ClipboardList} label={t("Matching records")} value={count} tone="info" hint={t("Synthetic exercise cases")}/>
      <StatTile index={1} icon={Eye} label={t("Showing")} value={count ? `${first}–${last}` : "0"} tone="neutral" hint={`${t("Page")} ${result?.page ?? page} / ${totalPages}`}/>
      <StatTile index={2} icon={RefreshCw} label={t("Awaiting review on this page")} value={reviewOnPage} tone={reviewOnPage ? "warning" : "neutral"}/>
      <StatTile index={3} icon={FlaskConical} label={t("Active on this page")} value={activeOnPage} tone="info"/>
    </StatStrip>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title={t("Operational incident records")} description={t("Exercise-only · paginated PostGIS query")} icon={ClipboardList}
        className="min-w-0 overflow-hidden"
        actions={<>
          <StatusPill tone="sample" icon={FlaskConical}>{t("Exercise data")}</StatusPill>
          <button type="button" className="control" disabled={pending} onClick={() => setReload(n => n + 1)}>
            <RefreshCw size={16} aria-hidden="true" className={pending ? "animate-spin" : ""}/> {t("Refresh")}
          </button>
        </>}>
        <div className="flex flex-col gap-3 border-b border-stroke p-4 sm:p-5">
          <SearchField label={t("Search hazard or incident ID")} placeholder={t("Search hazard or incident ID...")} value={query} onChange={value => setQuery(value.slice(0, 120))}/>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <SegmentedControl label={t("Filter status")} options={statusOptions} value={filter} onChange={setFilter}/>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <span>{t("Rows")}</span>
              <SegmentedControl label={t("Rows per page")} options={sizeOptions} value={String(pageSize)} onChange={value => setPageSize(Number(value))}/>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="control control-sm" onClick={() => { clearFilters(); setSort("created_at"); setDirection("desc"); setPageSize(10); }}>{t("Reset")}</button>
            <button type="button" className="control control-sm" onClick={() => void copyViewLink()}><Link2 size={14} aria-hidden="true"/> {t("Copy view link")}</button>
            {viewNotice && <span role="status" className="text-xs text-muted">{viewNotice}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke bg-elevated/30 px-5 py-2.5 text-xs text-muted">
          <span role="status" aria-live="polite">{pending ? t("Refreshing results...") : `${t("Showing")} ${first}–${last} ${t("of")} ${count} ${t("incident records")}`}</span>
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {lastSync ? <DataFreshness observedAt={lastSync}/> : <span>{t("Awaiting data")}</span>}
            <span>{t("Data source: synthetic exercise")}</span>
          </span>
        </div>
        {error && <div className="border-b border-stroke p-4"><ErrorState title={t("Incident search unavailable")} message={t("Any visible results may be stale.")} onRetry={() => setReload(n => n + 1)}/></div>}
        {pending && !result && <div className="px-5 py-4"><SkeletonRows rows={6} label={t("Loading exercise incidents…")}/></div>}
        {!pending && !error && items.length === 0 && <EmptyState icon={SearchX} title={t("No incidents match")}
          body={t("Try changing the search term or status filter. No match does not mean an area is safe; it only means no synthetic record fits these filters.")}
          actions={<button type="button" className="control control-sm" onClick={clearFilters}>{t("Clear filters")}</button>}/>}
        {items.length > 0 && <>
          <div onKeyDown={moveRowFocus} className="hidden md:block">
            <ResponsiveTable label={t("Exercise incident list")} caption={t("Exercise incident list; column headings sort the records")}>
              <thead className="bg-elevated/60"><tr>
                <SortableHeader label={t("Incident")} direction={dirFor("hazard_type")} onSort={() => sortBy("hazard_type")} className="px-5"/>
                <SortableHeader label={t("Status")} direction={dirFor("status")} onSort={() => sortBy("status")} className="px-5"/>
                <th scope="col" className="px-5 py-2 text-left text-[11px] font-bold text-muted">{t("Coordinates")}</th>
                <SortableHeader label={t("Created")} direction={dirFor("created_at")} onSort={() => sortBy("created_at")} className="px-5"/>
                <th scope="col" className="px-5 py-2 text-left text-[11px] font-bold text-muted">{t("Case ID")}</th>
              </tr></thead>
              <tbody className="divide-y divide-stroke">
                {items.map(item => <tr key={item.id} onMouseEnter={() => setSelectedId(item.id)}
                  className={`transition-colors hover:bg-elevated/40 ${selected?.id === item.id ? "bg-accent/5" : ""}`}>
                  <td className="px-5 py-4 font-semibold"><Link href={"/incidents/" + item.id} data-row-link="" onFocus={() => setSelectedId(item.id)} className={linkClass} title={t("Inspect exercise evidence and chronology")}>{item.hazard_type}</Link></td>
                  <td className="px-5 py-4"><StatusBadge status={item.status}/></td>
                  <td className="px-5 py-4 font-mono text-xs tabular-nums text-muted"><MapPin size={13} aria-hidden="true" className="mr-1 inline"/>{coords(item)}</td>
                  <td className="px-5 py-4 text-xs text-muted">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="px-5 py-4"><RecordRef id={item.id} kind="incident" /></td>
                </tr>)}
              </tbody>
            </ResponsiveTable>
          </div>
          <ul onKeyDown={moveRowFocus} aria-label={t("Exercise incident list")} className="space-y-2 p-3 md:hidden">
            {items.map(item => <li key={item.id} className="panel p-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={"/incidents/" + item.id} data-row-link="" onFocus={() => setSelectedId(item.id)} className={`${linkClass} text-sm font-semibold`}>{item.hazard_type}</Link>
                <StatusBadge status={item.status}/>
              </div>
              <div className="mt-2"><KeyValueList items={[
                { label: t("Coordinates"), value: <span className="font-mono text-xs">{coords(item)}</span> },
                { label: t("Created"), value: <span className="text-xs">{new Date(item.created_at).toLocaleString()}</span> },
                { label: t("Case ID"), value: <RecordRef id={item.id} kind="incident" /> },
              ]}/></div>
            </li>)}
          </ul>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-4">
          <p className="text-xs text-muted">{t("Page")} {result?.page ?? page} {t("of")} {totalPages}</p>
          <div className="flex items-center gap-2">
            <button type="button" className="control" onClick={() => setPage(n => Math.max(1, n - 1))} disabled={pending || page <= 1}>
              <ChevronLeft size={16} aria-hidden="true"/> {t("Previous")}
            </button>
            <button type="button" className="control" onClick={() => setPage(n => Math.min(totalPages, n + 1))} disabled={pending || page >= totalPages}>
              {t("Next")} <ChevronRight size={16} aria-hidden="true"/>
            </button>
          </div>
        </div>
      </Panel>

      <aside aria-label={t("Selected case summary")} className="xl:sticky xl:top-4">
        <Panel title={t("Selected case")} icon={Eye} description={t("Hover or focus a row to preview. Press Enter on the case name to open it.")}>
          {selected ? <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2"><p className="t-title">{selected.hazard_type}</p><StatusBadge status={selected.status}/></div>
            <KeyValueList items={[
              { label: t("Case ID"), value: <RecordRef id={selected.id} kind="incident" /> },
              { label: t("Coordinates"), value: <span className="font-mono text-xs">{coords(selected)}</span> },
              { label: t("Created"), value: <DataFreshness observedAt={selected.created_at} staleAfterHours={24 * 365}/> },
            ]}/>
            <p className="text-xs leading-5 text-muted">{t("Synthetic exercise record. Opening a case shows evidence, chronology and readiness only; it cannot send warnings or dispatch responders.")}</p>
            <Link href={"/incidents/" + selected.id} className="control w-full justify-center">{t("Open case")} <ArrowRight size={15} aria-hidden="true"/></Link>
          </div> : <EmptyState title={t("No case selected")} body={t("Results will appear here once records load.")}/>}
        </Panel>
      </aside>
    </div>
  </AppShell>;
}
