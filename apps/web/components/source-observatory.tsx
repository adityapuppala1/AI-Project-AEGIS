"use client";

import { SortableTable, Button } from "./ui";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Clock3, Database, Gauge, RadioTower, RefreshCw, Search, ShieldAlert, ShieldCheck, WifiOff } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { DataFreshness, EmptyState, ErrorState, SearchField, KeyValueList, Panel, SegmentedControl, SkeletonRows, StatStrip, StatTile, StatusPill, type Tone } from "./ui";
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
const STATUS_TONE: Record<SourceHealthStatus, Tone> = { fresh: "success", delayed: "warning", stale: "danger", no_data: "neutral", clock_anomaly: "info" };
function Badge({ status }: { status: SourceHealthStatus }) {
  const t = useT();
  return <StatusPill tone={STATUS_TONE[status]}>{t(STATUS_LABELS[status])}</StatusPill>;
}

export function SourceObservatory() {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
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

  const freshnessPercent = (source: ExerciseSource) => {
    const age = source.health.age_seconds;
    if (age === null || !Number.isFinite(age) || age < 0) return 0;
    return Math.round(Math.max(0, Math.min(1, 1 - age / Math.max(1, source.expected_interval_seconds * 3))) * 100);
  };
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-source-row]") ?? []);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)));
    rows[next]?.focus();
  };

  return <AppShell title="Source Health & Freshness" description="Observe simulated feed timeliness, delivery delay and missing data before relying on a signal.">
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert className="mt-1 shrink-0" size={19}/>
      <p><strong>Exercise-only observability.</strong> These sources are database fixtures, not connected IMD, NDMA, CCTV or municipal devices.
        Freshness is a timestamp heuristic, not validation that any disaster signal is accurate or any physical equipment is operational.</p>
    </div>
    {error && <ErrorState className="mb-5" message={error + ". " + t("Any previously displayed measurements may be outdated.")} onRetry={refresh}/>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted" role="status">
          {overview ? `Computed ${timestamp(overview.as_of)} · ${overview.total} synthetic sources` : "Awaiting exercise source registry"}
        </p>
        {overview && <DataFreshness observedAt={overview.as_of} staleAfterHours={1}/>}
      </div>
      <Button type="button" onClick={refresh} disabled={loading}>
        <RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh source status
      </Button>
    </div>
    <StatStrip label={t("Simulated source freshness summary")} className="xl:grid-cols-5">
      {([
        { label: "Within window", count: overview?.counts.fresh, icon: ShieldCheck, tone: "success" },
        { label: "Delayed", count: overview?.counts.delayed, icon: Clock3, tone: "warning" },
        { label: "Stale", count: overview?.counts.stale, icon: AlertTriangle, tone: "danger" },
        { label: "No observations", count: overview?.counts.no_data, icon: WifiOff, tone: "neutral" },
        { label: "Time anomaly", count: overview?.counts.clock_anomaly, icon: Activity, tone: "info" },
      ] as const).map((metric, index) => <StatTile key={metric.label} index={index} label={t(metric.label)} icon={metric.icon} tone={metric.tone}
        value={overview ? (metric.count ?? 0) : "—"} hint={t("Synthetic feed count")}/>)}
    </StatStrip>
    <p className="mt-3 text-xs leading-5 text-muted">{t("Stale because a link failed?")} <Link href="/sensor-link" className="font-semibold text-accent hover:underline">{t("See how sensor traffic moves between internet and satellite")}</Link></p>

    <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(370px,1fr)]">
      <Panel data-tour="sources-registry" className="min-w-0 overflow-hidden" bodyClassName="p-0" icon={RadioTower} title="Exercise Source Registry" description="Select a simulated feed to review its latest readings."
          actions={<Link href="/help" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent hover:underline">Data guidance <ArrowRight size={14} aria-hidden="true"/></Link>}>
        <div className="flex flex-wrap items-center gap-3 border-b border-stroke p-4">
          <SearchField label={t("Search synthetic sources")} value={query} onChange={setQuery} placeholder={t("Search sources or status...")} className="min-w-[190px] flex-1"/>
          <label><span className="sr-only">Sort synthetic sources</span>
            <select className="field min-w-[145px]" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
              <option value="name">Sort: source</option>
              <option value="status">Sort: status</option>
              <option value="age">Sort: oldest observation</option>
            </select>
          </label>
          <SegmentedControl label={t("Filter source health")} value={filter} onChange={setFilter}
            options={FILTERS.map(item => ({ value: item.value, label: t(item.label) }))}/>
        </div>
        <div className="divide-y divide-stroke" ref={listRef} onKeyDown={onListKey}>
          {loading && !overview && <div className="p-4"><SkeletonRows rows={5} label={t("Loading source registry…")}/></div>}
          {sources.map(source => <button type="button" key={source.id} data-source-row onClick={() => setSelectedId(source.id)}
            aria-pressed={selectedId === source.id}
            className={`flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-elevated/60 sm:p-5 ${selectedId === source.id ? "bg-accent/5" : ""}`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Gauge size={20} aria-hidden="true"/></span>
            <span className="min-w-0 flex-1"><strong className="block break-words text-sm leading-snug">{source.name}</strong>
              <span className="mt-1 block text-xs text-muted">{KIND_LABELS[source.source_kind]}</span>
              <DataFreshness className="mt-1" observedAt={source.latest?.observed_at} ingestedAt={source.latest?.ingested_at ?? null} staleAfterHours={Math.max(1, (source.expected_interval_seconds * 3) / 3600)} stale={source.health.status === "stale"}/>
              <span aria-hidden="true" className="mt-2 block h-1.5 w-full max-w-[220px] rounded-full bg-elevated">
                <span className={`bar-grow block h-1.5 rounded-full ${source.health.status === "fresh" ? "bg-emerald-600" : source.health.status === "delayed" ? "bg-amber-600" : source.health.status === "stale" ? "bg-rose-600" : "bg-slate-500"}`}
                  style={{ width: `${freshnessPercent(source)}%` }}/>
              </span>
            </span>
            <Badge status={source.health.status}/>
          </button>)}
          {!loading && sources.length === 0 && <EmptyState icon={Search} title={t("No matching exercise feeds")}
            body={t("Try clearing the search or filter. An empty list does not mean the sources are healthy.")}
            actions={<Button size="sm" type="button" onClick={() => { setQuery(""); setFilter("all"); }}>{t("Clear filters")}</Button>}/>}
        </div>
        <p className="border-t border-stroke px-5 py-3 text-xs text-muted">{sources.length} matching · All records are synthetic</p>
      </Panel>

      <Panel data-tour="sources-detail" className="min-w-0 overflow-hidden" aria-label="Selected source details" bodyClassName="p-0" icon={Database} title="Source Detail & Trends"
          actions={<span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">Read-only</span>}>
        {!selected ? <EmptyState icon={Database} title={t("Select an exercise source")} body={t("Choose a feed from the registry to review its latest synthetic readings.")}/> : <>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="t-title">{selected.name}</h3>
              <Badge status={selected.health.status}/>
            </div>
            <p className="text-xs leading-5 text-muted">{selected.health.reason}</p>
            <dl className="grid gap-3 rounded-lg bg-elevated/40 p-4 text-xs sm:grid-cols-2">
              <div><dt className="text-muted">Last observed</dt><dd className="mt-1 font-semibold">{timestamp(selected.latest?.observed_at)}</dd></div>
              <div><dt className="text-muted">Last ingested</dt><dd className="mt-1 font-semibold">{timestamp(selected.latest?.ingested_at)}</dd></div>
              <div><dt className="text-muted">Observation age</dt><dd className="mt-1 font-semibold">{displayAge(selected.health.age_seconds)}</dd></div>
              <div><dt className="text-muted">Ingestion delay</dt><dd className="mt-1 font-semibold">{displayAge(selected.health.ingestion_lag_seconds)}</dd></div>
              <div><dt className="text-muted">Expected interval</dt><dd className="mt-1 font-semibold">{displayAge(selected.expected_interval_seconds)}</dd></div>
              <div><dt className="text-muted">Quality label</dt><dd className="mt-1 font-semibold">{selected.latest?.quality_status === "synthetic_curated" ? "Curated fixture" : selected.latest ? "Unverified fixture" : "No readings"}</dd></div>
            </dl>
          </div>
          <div className="border-t border-stroke px-5 py-4">
            <Panel level={3} icon={ShieldCheck} title={t("Quality notes")} description={t("From fields already loaded; synthetic fixtures only.")}>
              <KeyValueList items={[
                { label: t("Status reason"), value: selected.health.reason },
                { label: t("Quality label"), value: selected.latest?.quality_status === "synthetic_curated" ? t("Curated fixture") : selected.latest ? t("Unverified fixture") : t("No readings") },
                { label: t("Metric"), value: `${selected.metric_label} (${selected.metric_unit})` },
              ]}/>
            </Panel>
          </div>
          <div className="border-t border-stroke px-5 py-4">
            <h4 className="text-sm font-bold">Synthetic sample history</h4>
            <p className="mt-1 text-xs text-muted">{selected.metric_label} ({selected.metric_unit}) · not a weather prediction</p>
            {historyError && <ErrorState className="mt-3" message={historyError} onRetry={refresh}/>}
            {historyLoading && <div className="mt-3"><SkeletonRows rows={3} label={t("Loading history…")}/></div>}
            {chart.length >= 2 && <div className="mt-4 h-[205px] w-full" role="img" aria-label={`Synthetic ${selected.metric_label} trend. Tabular values are provided below.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                  <CartesianGrid stroke="rgb(var(--chart-grid) / .22)" strokeDasharray="3 4" vertical={false}/>
                  <XAxis dataKey="time" tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: "rgb(var(--chart-tooltip))", border: "1px solid rgb(var(--stroke))", borderRadius: 10, color: "#f3f7fc" }}/>
                  <Line type="monotone" dataKey="value" name={selected.metric_label} stroke="rgb(var(--accent))" strokeWidth={2.5} dot={{r:3}} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>}
            {!historyLoading && !historyError && history?.samples.length === 0 && <div className="mt-4 rounded-lg border border-dashed border-stroke p-6 text-center text-xs text-muted">
              No synthetic readings exist for this source. Never infer that missing data indicates safety.
            </div>}
            {history && history.samples.length > 0 && <details className="mt-4 rounded-lg border border-stroke p-3">
              <summary className="cursor-pointer text-xs font-semibold">Show accessible sample table ({history.samples.length} readings)</summary>
              <div className="mt-3 max-h-64 overflow-auto">
                <SortableTable label="Synthetic reading values and observation times" minWidth="20.625rem" rows={history.samples} rowKey={sample => sample.id} columns={[
                  { key: "observed", label: "Observed", sortValue: sample => sample.observed_at, cell: sample => timestamp(sample.observed_at) },
                  { key: "value", label: "Value (" + selected.metric_unit + ")", numeric: true, sortValue: sample => sample.value, cell: sample => sample.value },
                  { key: "quality", label: "Quality", sortValue: sample => sample.quality_status, cell: sample => sample.quality_status === "synthetic_curated" ? "Curated fixture" : "Unverified fixture" },
                ]}/>
              </div>
            </details>}
          </div>
        </>}
      </Panel>
    </div>
    <p className="mt-5 flex items-start gap-2 rounded-lg border border-stroke bg-elevated/40 p-4 text-xs leading-6 text-muted">
      <ShieldCheck size={17} className="mt-1 shrink-0 text-accent"/>
      Clock comparisons are made on the API server against a reference timestamp. Age and delay thresholds are per-source demo settings;
      a displayed “within window” status describes only this synthetic observation's age, not data truthfulness or source-device health.
      <span className="sr-only">No live sensors are integrated.</span>
    </p>
  </AppShell>;
}
