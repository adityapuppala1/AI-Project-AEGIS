"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Clock3, Database, Gauge, RadioTower, RefreshCw, Search, ShieldAlert, ShieldCheck, WifiOff } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "./app-shell";
import {
  displayAge, KIND_LABELS, STATUS_LABELS,
  type ExerciseSource, type SourceHealthStatus, type SourceHistory, type SourceOverview,
} from "../lib/source-health";

type Filter = "all" | SourceHealthStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "fresh", label: "Within window" },
  { value: "delayed", label: "Delayed" },
  { value: "stale", label: "Stale" },
  { value: "no_data", label: "No data" },
  { value: "clock_anomaly", label: "Clock anomaly" },
];
const STATUS_STYLE: Record<SourceHealthStatus,string> = {
  fresh: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  delayed: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  stale: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
  no_data: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20",
  clock_anomaly: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20",
};
function timestamp(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(date) + " IST";
}
function Badge({ status }: { status: SourceHealthStatus }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_STYLE[status]}`}>
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current"/>
    {STATUS_LABELS[status]}
  </span>;
}

export function SourceObservatory() {
  const [overview, setOverview] = useState<SourceOverview | null>(null);
  const [history, setHistory] = useState<SourceHistory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"name"|"status"|"age">("name");
  const [refreshCount, setRefreshCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const refresh = useCallback(() => setRefreshCount(count => count + 1), []);
  useEffect(() => {
    // Recompute freshness once per minute when the tab is visible.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/sources", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Source observatory is unavailable");
        const payload = await response.json() as SourceOverview;
        if (payload.source !== "synthetic_exercise" || payload.real_connectors_enabled !== false ||
            !Array.isArray(payload.sources)) throw new Error("Unexpected source classification");
        if (!controller.signal.aborted) {
          setOverview(payload);
          setSelectedId(current => current && payload.sources.some(source => source.id === current) ? current : payload.sources[0]?.id ?? null);
          setError(null);
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Source observatory unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshCount]);

  useEffect(() => {
    setHistory(null);
    setHistoryError(null);
    if (!selectedId) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    fetch("/api/sources/" + encodeURIComponent(selectedId) + "/history?limit=24", {
      cache: "no-store", signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error("Synthetic history is unavailable");
        const payload = await response.json() as SourceHistory;
        if (payload.source !== "synthetic_exercise" || payload.real_connector !== false ||
            !Array.isArray(payload.samples)) throw new Error("Unexpected source history");
        if (!controller.signal.aborted) { setHistory(payload);setHistoryError(null); }
      })
      .catch(reason => {
        if (!controller.signal.aborted) setHistoryError(reason instanceof Error ? reason.message : "Source history unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [selectedId, refreshCount]);

  const sources = useMemo(() => (overview?.sources ?? [])
    .filter(source => (filter === "all" || source.health.status === filter) &&
      [source.name, KIND_LABELS[source.source_kind], STATUS_LABELS[source.health.status]]
        .join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b) => {
      if (sort === "status") return a.health.status.localeCompare(b.health.status) || a.name.localeCompare(b.name);
      if (sort === "age") return (b.health.age_seconds ?? -1) - (a.health.age_seconds ?? -1) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    }), [overview, filter, query, sort]);
  const selected = overview?.sources.find(source => source.id === selectedId) ?? null;
  const chart = useMemo(() => [...(history?.samples ?? [])].reverse().map(sample => ({
    time: new Date(sample.observed_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }),
    value: sample.value,
    label: timestamp(sample.observed_at),
  })), [history]);

  return <AppShell title="Source Health & Freshness" description="Observe simulated feed timeliness, delivery delay and missing data before relying on a signal.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert className="mt-1 shrink-0" size={19}/>
      <p><strong>Exercise-only observability.</strong> These sources are database fixtures, not connected IMD, NDMA, CCTV or municipal devices.
        Freshness is a timestamp heuristic, not validation that any disaster signal is accurate or any physical equipment is operational.</p>
    </div>
    {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
      <AlertTriangle size={18}/>{error}. Any previously displayed measurements may be outdated.
    </div>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted" role="status">
        {overview ? `Computed ${timestamp(overview.as_of)} · ${overview.total} synthetic sources` : "Awaiting exercise source registry"}
      </p>
      <button type="button" className="control" onClick={refresh} disabled={loading}>
        <RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh source status
      </button>
    </div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Simulated source freshness summary">
      {[
        { label: "Within window", count: overview?.counts.fresh, icon: ShieldCheck, color: "text-emerald-500" },
        { label: "Delayed", count: overview?.counts.delayed, icon: Clock3, color: "text-amber-500" },
        { label: "Stale", count: overview?.counts.stale, icon: AlertTriangle, color: "text-rose-500" },
        { label: "No observations", count: overview?.counts.no_data, icon: WifiOff, color: "text-muted" },
        { label: "Time anomaly", count: overview?.counts.clock_anomaly, icon: Activity, color: "text-violet-500" },
      ].map(metric => <article className="panel p-4 sm:p-5" key={metric.label}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted">{metric.label}</span>
          <metric.icon size={18} className={metric.color} aria-hidden="true"/>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{overview ? metric.count : "—"}</p>
        <p className="mt-1 text-[11px] text-muted">Synthetic feed count</p>
      </article>)}
    </section>

    <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(370px,1fr)]">
      <section className="panel min-w-0 overflow-hidden">
        <div className="panel-heading">
          <div><h2 className="flex items-center gap-2 text-base font-bold"><RadioTower size={18} className="text-accent"/> Exercise Source Registry</h2>
            <p className="mt-1 text-xs text-muted">Select a simulated feed to review its latest readings.</p></div>
          <Link href="/help" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">Data guidance <ArrowRight size={14}/></Link>
        </div>
        <div className="flex flex-wrap gap-3 border-b border-stroke p-4">
          <label className="relative min-w-[190px] flex-1">
            <Search size={17} className="pointer-events-none absolute left-3 top-3 text-muted" aria-hidden="true"/>
            <span className="sr-only">Search synthetic sources</span>
            <input type="search" className="field !pl-10" value={query} maxLength={100}
              placeholder="Search sources or status..." onChange={event => setQuery(event.target.value)}/>
          </label>
          <label><span className="sr-only">Filter source health</span>
            <select className="field min-w-[145px]" value={filter} onChange={event => setFilter(event.target.value as Filter)}>
              {FILTERS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label><span className="sr-only">Sort synthetic sources</span>
            <select className="field min-w-[145px]" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
              <option value="name">Sort: source</option>
              <option value="status">Sort: status</option>
              <option value="age">Sort: oldest observation</option>
            </select>
          </label>
        </div>
        <div className="divide-y divide-stroke">
          {loading && !overview && <p className="p-6 text-sm text-muted">Loading source registry…</p>}
          {sources.map(source => <button type="button" key={source.id} onClick={() => setSelectedId(source.id)}
            aria-pressed={selectedId === source.id}
            className={`flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-elevated/60 sm:p-5 ${selectedId === source.id ? "bg-accent/5" : ""}`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Gauge size={20}/></span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{source.name}</strong>
              <span className="mt-1 block text-xs text-muted">{KIND_LABELS[source.source_kind]} · Observed {displayAge(source.health.age_seconds)} ago</span>
            </span>
            <Badge status={source.health.status}/>
          </button>)}
          {!loading && sources.length === 0 && <p className="p-8 text-center text-sm text-muted">No matching exercise feeds. Try clearing filters.</p>}
        </div>
        <p className="border-t border-stroke px-5 py-3 text-xs text-muted">{sources.length} matching · All records are synthetic</p>
      </section>

      <section className="panel min-w-0 overflow-hidden" aria-label="Selected source details">
        <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><Database size={18} className="text-accent"/> Source Detail & Trends</h2>
          <span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">Read-only</span></div>
        {!selected ? <p className="p-6 text-sm text-muted">Select an exercise source to view its observations.</p> : <>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold">{selected.name}</h3>
              <Badge status={selected.health.status}/>
            </div>
            <p className="text-xs leading-5 text-muted">{selected.health.reason}</p>
            <dl className="grid gap-3 rounded-xl bg-elevated/40 p-4 text-xs sm:grid-cols-2">
              <div><dt className="text-muted">Last observed</dt><dd className="mt-1 font-semibold">{timestamp(selected.latest?.observed_at)}</dd></div>
              <div><dt className="text-muted">Last ingested</dt><dd className="mt-1 font-semibold">{timestamp(selected.latest?.ingested_at)}</dd></div>
              <div><dt className="text-muted">Observation age</dt><dd className="mt-1 font-semibold">{displayAge(selected.health.age_seconds)}</dd></div>
              <div><dt className="text-muted">Ingestion delay</dt><dd className="mt-1 font-semibold">{displayAge(selected.health.ingestion_lag_seconds)}</dd></div>
              <div><dt className="text-muted">Expected interval</dt><dd className="mt-1 font-semibold">{displayAge(selected.expected_interval_seconds)}</dd></div>
              <div><dt className="text-muted">Quality label</dt><dd className="mt-1 font-semibold">{selected.latest?.quality_status === "synthetic_curated" ? "Curated fixture" : selected.latest ? "Unverified fixture" : "No readings"}</dd></div>
            </dl>
          </div>
          <div className="border-t border-stroke px-5 py-4">
            <h4 className="text-sm font-bold">Synthetic sample history</h4>
            <p className="mt-1 text-xs text-muted">{selected.metric_label} ({selected.metric_unit}) · not a weather prediction</p>
            {historyError && <p role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-300">{historyError}</p>}
            {historyLoading && <p className="mt-3 text-xs text-muted">Loading history…</p>}
            {chart.length >= 2 && <div className="mt-4 h-[205px] w-full" role="img" aria-label={`Synthetic ${selected.metric_label} trend. Tabular values are provided below.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                  <CartesianGrid stroke="rgb(120 150 165 / .18)" strokeDasharray="3 4" vertical={false}/>
                  <XAxis dataKey="time" tick={{ fill: "#94a8b7", fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: "#94a8b7", fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: "#11283b", border: "1px solid #355268", borderRadius: 12, color: "#f2f8ff" }}/>
                  <Line type="monotone" dataKey="value" name={selected.metric_label} stroke="#36cfae" strokeWidth={2.5} dot={{r:3}} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>}
            {!historyLoading && !historyError && history?.samples.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-stroke p-6 text-center text-xs text-muted">
              No synthetic readings exist for this source. Never infer that missing data indicates safety.
            </div>}
            {history && history.samples.length > 0 && <details className="mt-4 rounded-xl border border-stroke p-3">
              <summary className="cursor-pointer text-xs font-semibold">Show accessible sample table ({history.samples.length} readings)</summary>
              <div className="mt-3 max-h-64 overflow-auto">
                <table className="w-full min-w-[330px] text-left text-xs">
                  <caption className="sr-only">Synthetic reading values and observation times</caption>
                  <thead className="text-muted"><tr><th className="p-2">Observed</th><th className="p-2">Value ({selected.metric_unit})</th><th className="p-2">Quality</th></tr></thead>
                  <tbody className="divide-y divide-stroke">{history.samples.map(sample => <tr key={sample.id}>
                    <td className="p-2">{timestamp(sample.observed_at)}</td>
                    <td className="p-2 tabular-nums">{sample.value}</td>
                    <td className="p-2">{sample.quality_status === "synthetic_curated" ? "Curated fixture" : "Unverified fixture"}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </details>}
          </div>
        </>}
      </section>
    </div>
    <p className="mt-5 flex items-start gap-2 rounded-xl border border-stroke bg-elevated/40 p-4 text-xs leading-6 text-muted">
      <ShieldCheck size={17} className="mt-1 shrink-0 text-accent"/>
      Clock comparisons are made on the API server against a reference timestamp. Age and delay thresholds are per-source demo settings;
      a displayed “within window” status describes only this synthetic observation's age, not data truthfulness or source-device health.
      <span className="sr-only">No live sensors are integrated.</span>
    </p>
  </AppShell>;
}
