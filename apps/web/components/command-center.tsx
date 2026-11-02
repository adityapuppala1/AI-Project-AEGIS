"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Archive, CloudRain, Database, MapPinned, RefreshCw, ShieldCheck, Table2, UsersRound, Waves } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "./app-shell";
import { GeoMap } from "./geo-map";
import { StatusBadge } from "./status-badge";
import { useExerciseData } from "../lib/use-exercise-data";
import { SourceHealthSummary } from "./source-health-summary";
import { LocalReviewFocus } from "./local-review-focus";
import { IngestionStatusSummary } from "./ingestion-status-summary";
import { PublicSignalsStrip } from "./public-signals-strip";
import { useT } from "./language-provider";
import { DataFreshness, EmptyState, ErrorState, SkeletonRows } from "./ui";

function Metric({ label, value, caption, icon: Icon, tone = "accent" }: {
  label: string; value: string | number; caption: string; icon: typeof Activity; tone?: "accent" | "amber" | "rose";
}) {
  const t = useT();
  const color = tone === "amber" ? "text-amber-500 bg-amber-500/10" : tone === "rose" ? "text-rose-400 bg-rose-500/10" : "text-accent bg-accent/10";
  return <article className="panel metric-card flex items-start justify-between gap-3 p-4">
    <div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-muted">{t(label)}</p><p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p><p className="mt-1 text-[11px] text-muted">{t(caption)}</p></div>
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon size={18}/></span>
  </article>;
}

export function CommandCenter() {
  const { incidents, telemetry, loading, refreshing, error, lastSynced, refresh } = useExerciseData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const t = useT();
  const [query, setQuery] = useState("");
  const [showTable, setShowTable] = useState(false);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const moveRow = (event: React.KeyboardEvent, index: number, count: number) => {
    const next = event.key === "ArrowDown" ? Math.min(count - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : -1;
    if (next >= 0) { event.preventDefault(); rowRefs.current[next]?.focus(); }
    else if (event.key === "Escape" && selectedId) { const back = rowRefs.current[index]; setSelectedId(null); back?.focus(); }
  };
  const selected = incidents.find(item => item.id === selectedId);
  const filtered = useMemo(() => incidents.filter(item => item.hazard_type.toLowerCase().includes(query.toLowerCase()) || item.status.includes(query.toLowerCase())), [incidents, query]);
  const quickActions = [
    { href: "/incidents", label: "Triage evidence", detail: `${incidents.filter(i => i.status === "review").length} cases await review`, icon: Activity },
    { href: "/approvals", label: "Decision workbench", detail: "Independent checker gate", icon: ShieldCheck },
    { href: "/department-tasks", label: "Coordinate desks", detail: "Scripted exercise tasks", icon: UsersRound },
    { href: "/audit", label: "Inspect audit", detail: "Trace evidence and decisions", icon: Archive },
  ];
  return <AppShell title="Command Center" description="Geospatial awareness, simulated hazard observations and human-controlled response coordination.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><ShieldCheck size={17}/><span>{t("EXERCISE ONLY — all incidents and telemetry are synthetic; no operational warnings or dispatch.")}</span></div>
      <Link href="/demo" className="control text-xs">{t("Run guided exercise")} <ArrowRight size={14}/></Link>
      {lastSynced ? <span className="text-xs text-muted">{t("Last sync")}: {new Date(lastSynced).toLocaleTimeString()} · <DataFreshness observedAt={lastSynced} staleAfterHours={1}/></span> : <span className="text-xs text-muted">{t("Awaiting first sync")}</span>}
    </div>
    {error && <ErrorState className="mb-5" message={`${error}. ${t("Previously loaded values, if any, may be stale.")}`} onRetry={() => void refresh()}/>}
    <section className="command-deck operator-hero mb-5 overflow-hidden rounded-xl border border-stroke p-4 sm:p-5" aria-label="Operator mission workspace">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div><p className="eyebrow">Active decision path</p><h2 className="mt-2 text-lg font-bold tracking-tight">Evidence to accountable response</h2><p className="mt-1 text-xs text-muted">One bounded workflow · cited context · independent approval</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/approvals" className="control control-primary text-xs">Open workbench <ArrowRight size={14}/></Link><Link href="/demo" className="control text-xs">Guided exercise</Link></div>
      </div>
      <ol className="relative z-10 mt-4 grid gap-px overflow-hidden rounded-lg border border-stroke bg-stroke sm:grid-cols-3" aria-label="Human-led assistance sequence">
        {[["01", "Observe & verify", "Sources, freshness, uncertainty"], ["02", "Focus & draft", "Cited review, human-authored action"], ["03", "Approve & rehearse", "Checker gate, scripted tasks"]].map(([n,title,detail]) =>
          <li key={n} className="flex items-center gap-3 bg-surface p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-[11px] font-bold text-accent">{n}</span><div><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[10px] text-muted">{detail}</p></div></li>)}
      </ol>
    </section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><span className={`status-dot ${error ? "bg-rose-400" : lastSynced ? "bg-emerald-400" : "bg-amber-400"}`}/><span className="text-xs font-medium text-muted">{error ? t("Data feed unavailable") : lastSynced ? t("Exercise API connected") : t("Connecting to exercise API")}</span></div>
      <button type="button" className="control" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""}/> {refreshing ? t("Refreshing") : t("Refresh data")}</button>
    </div>
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Exercise overview metrics">
      <Metric label="Registered incidents" value={loading ? "—" : incidents.length} caption="Seeded exercise records" icon={Database}/>
      <Metric label="Awaiting human review" value={loading ? "—" : incidents.filter(i => i.status === "review").length} caption="Review queue" icon={ShieldCheck} tone="amber"/>
      <Metric label="In-progress exercises" value={loading ? "—" : incidents.filter(i => i.status === "active").length} caption="Not real deployments" icon={Activity} tone="rose"/>
      <Metric label="Public alerts issued" value="0" caption="Operational alerting disabled" icon={AlertTriangle}/>
    </section>
    <section className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operator quick actions">
      {quickActions.map(({href,label,detail,icon:Icon}) => <Link href={href} key={href} className="group flex items-center gap-3 rounded-lg border border-stroke bg-surface p-3 transition-colors hover:border-accent/45 hover:bg-elevated">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"><Icon size={17}/></span>
        <span className="min-w-0 flex-1"><span className="block text-xs font-bold">{label}</span><span className="mt-1 block truncate text-[10px] text-muted">{detail}</span></span>
        <ArrowRight size={14} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"/>
      </Link>)}
    </section>
    <PublicSignalsStrip/>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(350px,1fr)]">
      <section className="panel min-w-0 overflow-hidden" aria-label="Exercise geospatial overview">
        <div className="panel-heading"><div><h2 className="flex items-center gap-2 text-base font-bold"><MapPinned size={18} className="text-accent"/> {t("Geospatial Overview")}</h2><p className="mt-1 text-xs text-muted">Hyderabad · incident positions from PostGIS</p></div><span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">MapLibre / OSM</span></div>
        <GeoMap incidents={incidents} selectedId={selectedId} onSelect={setSelectedId}/>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke px-5 py-3 text-xs text-muted"><span>Map tiles require internet access. Incident data is synthetic.</span><span>Click a marker to inspect</span></div>
      </section>
      <section className="panel flex min-w-0 flex-col" aria-label="Incident queue">
        <div className="panel-heading"><div><h2 className="text-base font-bold">{t("Incident Queue")}</h2><p className="mt-1 text-xs text-muted">Exercise cases from the operational database</p></div><Link href="/incidents" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">All cases <ArrowRight size={14}/></Link></div>
        <div className="px-5 pt-4"><label className="sr-only" htmlFor="incident-search">Search incidents</label><input id="incident-search" className="field" placeholder="Search hazard or status..." value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="max-h-[310px] flex-1 overflow-y-auto p-3">
          {loading ? <SkeletonRows rows={4} label={t("Loading exercise incidents...")}/> : filtered.length === 0 ? <EmptyState title={t("No matching incidents")} body={t("An empty queue does not mean the area is safe; clear the search or check source freshness.")}/> : filtered.map((item, index) =>
            <button key={item.id} ref={node => { rowRefs.current[index] = node; }} type="button" onClick={() => setSelectedId(item.id)} onKeyDown={event => moveRow(event, index, filtered.length)} aria-pressed={selectedId === item.id}
              className={`mb-2 w-full rounded-xl border p-3 text-left transition-colors hover:bg-elevated ${selectedId === item.id ? "border-accent bg-accent/5" : "border-transparent"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{item.hazard_type}</span><StatusBadge status={item.status}/></div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted"><MapPinned size={13}/>{item.lat.toFixed(3)}, {item.lon.toFixed(3)}</div>
            </button>)}
        </div>
        {!selected && <p className="border-t border-stroke p-4 text-xs leading-6 text-muted">Select a case to reveal its local AI review focus and evidence workspace. No model runs until you request it.</p>}
        {selected && <div className="border-t border-stroke p-4"><div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center justify-between gap-2"><p className="eyebrow">Selected incident</p><StatusBadge status={selected.status}/></div>
          <h3 className="mt-3 text-sm font-bold">{selected.hazard_type}</h3>
          <p className="mt-2 text-xs text-muted">ID {selected.id.slice(0,8)} · {selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}</p>
          <p className="mt-2 text-xs text-muted">Synthetic record. Operational actions are disabled.</p>
          <h4 className="mt-4 text-sm font-semibold">Case assistance</h4>
          <LocalReviewFocus key={selected.id} incidentId={selected.id}/>
          <Link href={"/incidents/" + selected.id} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Open intelligence workspace <ArrowRight size={14}/></Link>
        </div></div>}
      </section>
    </div>
    <SourceHealthSummary/>
    <IngestionStatusSummary/>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <section className="panel min-w-0" aria-label="Synthetic rainfall trend">
        <div className="panel-heading"><div><h2 className="flex items-center gap-2 text-base font-bold"><CloudRain size={18} className="text-accent"/> {t("Hazard Telemetry")}</h2><p className="mt-1 text-xs text-muted">Synthetic time-series fixture · not a weather forecast</p></div><div className="flex items-center gap-2"><span className="text-xs font-semibold text-muted">Simulated 60 minutes</span>
          <button type="button" className="control text-xs" aria-pressed={showTable} disabled={!telemetry?.points?.length} onClick={() => setShowTable(value => !value)}>
            {showTable ? <Activity size={14}/> : <Table2 size={14}/>} {showTable ? t("Show chart") : t("Show data table")}</button></div></div>
        {showTable && telemetry?.points?.length ? <div className="max-h-[250px] overflow-auto px-5 pb-4 pt-3" tabIndex={0} role="region" aria-label="Telemetry data table (scrollable)">
          <table className="w-full text-left text-xs"><caption className="sr-only">Synthetic telemetry values by time; not a weather forecast</caption>
            <thead className="sticky top-0 bg-surface text-muted"><tr><th className="p-2">Time</th><th className="p-2">Rainfall (mm)</th><th className="p-2">Water index</th></tr></thead>
            <tbody className="divide-y divide-stroke">{telemetry.points.map(point => <tr key={point.label}>
              <td className="p-2">{point.label}</td><td className="p-2 tabular-nums">{point.rainfall_mm}</td><td className="p-2 tabular-nums">{point.water_index}</td></tr>)}</tbody></table>
        </div> : <div className="h-[250px] w-full px-2 pb-4 pt-5 sm:px-5">
          {telemetry?.points?.length ? <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={telemetry.points} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs><linearGradient id="rainArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.42}/><stop offset="95%" stopColor="rgb(var(--accent))" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid stroke="rgb(var(--chart-grid) / .22)" strokeDasharray="3 4" vertical={false}/>
              <XAxis dataKey="label" tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ background: "rgb(var(--chart-tooltip))", border: "1px solid rgb(var(--stroke))", borderRadius: 10, color: "#f3f7fc" }} labelStyle={{ color: "#c8d4e8" }}/>
              <Area type="monotone" dataKey="rainfall_mm" name="Rainfall (mm)" stroke="rgb(var(--accent))" strokeWidth={3} fill="url(#rainArea)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted">{loading ? t("Loading chart...") : t("No telemetry available; this is not a safety signal.")}</div>}
        </div>}
      </section>
      <section className="panel">
        <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><Waves size={18} className="text-accent"/> {t("Response Readiness")}</h2><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Planning preview</span></div>
        <div className="space-y-4 p-5">
          {[
            ["Verify incoming observations", "Source freshness and evidence review", "01"],
            ["Prepare department coordination", "Police, municipal and rescue roles", "02"],
            ["Route recommendation to checker", "Independent authorization required", "03"],
          ].map(([name, detail, number]) => <div key={number} className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-xs font-bold text-accent">{number}</span><div><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-xs text-muted">{detail}</p></div></div>)}
          <Link href="/playbooks" className="control mt-2 w-full">View response playbooks <ArrowRight size={16}/></Link>
        </div>
      </section>
    </div>
  </AppShell>;
}
