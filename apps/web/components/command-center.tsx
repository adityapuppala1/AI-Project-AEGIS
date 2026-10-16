"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CloudRain, Database, MapPinned, RefreshCw, ShieldCheck, Waves } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "./app-shell";
import { GeoMap } from "./geo-map";
import { StatusBadge } from "./status-badge";
import { useExerciseData } from "../lib/use-exercise-data";
import { SourceHealthSummary } from "./source-health-summary";

function Metric({ label, value, caption, icon: Icon, tone = "accent" }: {
  label: string; value: string | number; caption: string; icon: typeof Activity; tone?: "accent" | "amber" | "rose";
}) {
  const color = tone === "amber" ? "text-amber-500 bg-amber-500/10" : tone === "rose" ? "text-rose-400 bg-rose-500/10" : "text-accent bg-accent/10";
  return <article className="panel flex items-start justify-between gap-3 p-5">
    <div><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{value}</p><p className="mt-2 text-xs text-muted">{caption}</p></div>
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon size={20}/></span>
  </article>;
}

export function CommandCenter() {
  const { incidents, telemetry, loading, refreshing, error, lastSynced, refresh } = useExerciseData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const selected = incidents.find(item => item.id === selectedId);
  const filtered = useMemo(() => incidents.filter(item => item.hazard_type.toLowerCase().includes(query.toLowerCase()) || item.status.includes(query.toLowerCase())), [incidents, query]);
  return <AppShell title="Command Center" description="Geospatial awareness, simulated hazard observations and human-controlled response coordination.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><ShieldCheck size={17}/><span>EXERCISE ONLY — all incidents and telemetry are synthetic; no operational warnings or dispatch.</span></div>
      <span className="text-xs text-muted">{lastSynced ? `Last sync: ${new Date(lastSynced).toLocaleTimeString()}` : "Awaiting first sync"}</span>
    </div>
    {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
      <AlertTriangle size={17}/>{error}. Previously loaded values, if any, may be stale.
    </div>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><span className={`status-dot ${error ? "bg-rose-400" : lastSynced ? "bg-emerald-400" : "bg-amber-400"}`}/><span className="text-xs font-medium text-muted">{error ? "Data feed unavailable" : lastSynced ? "Exercise API connected" : "Connecting to exercise API"}</span></div>
      <button type="button" className="control" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""}/> {refreshing ? "Refreshing" : "Refresh data"}</button>
    </div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Exercise overview metrics">
      <Metric label="Registered incidents" value={loading ? "—" : incidents.length} caption="Seeded exercise records" icon={Database}/>
      <Metric label="Awaiting human review" value={loading ? "—" : incidents.filter(i => i.status === "review").length} caption="Review queue" icon={ShieldCheck} tone="amber"/>
      <Metric label="In-progress exercises" value={loading ? "—" : incidents.filter(i => i.status === "active").length} caption="Not real deployments" icon={Activity} tone="rose"/>
      <Metric label="Public alerts issued" value="0" caption="Operational alerting disabled" icon={AlertTriangle}/>
    </section>
    <SourceHealthSummary/>
    <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(350px,1fr)]">
      <section className="panel min-w-0 overflow-hidden" aria-label="Exercise geospatial overview">
        <div className="panel-heading"><div><h2 className="flex items-center gap-2 text-base font-bold"><MapPinned size={18} className="text-accent"/> Geospatial Overview</h2><p className="mt-1 text-xs text-muted">Hyderabad · incident positions from PostGIS</p></div><span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">MapLibre / OSM</span></div>
        <GeoMap incidents={incidents} selectedId={selectedId} onSelect={setSelectedId}/>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke px-5 py-3 text-xs text-muted"><span>Map tiles require internet access. Incident data is synthetic.</span><span>Click a marker to inspect</span></div>
      </section>
      <section className="panel flex min-w-0 flex-col" aria-label="Incident queue">
        <div className="panel-heading"><div><h2 className="text-base font-bold">Incident Queue</h2><p className="mt-1 text-xs text-muted">Exercise cases from the operational database</p></div><Link href="/incidents" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">All cases <ArrowRight size={14}/></Link></div>
        <div className="px-5 pt-4"><label className="sr-only" htmlFor="incident-search">Search incidents</label><input id="incident-search" className="field" placeholder="Search hazard or status..." value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="max-h-[310px] flex-1 overflow-y-auto p-3">
          {loading ? <p className="p-4 text-sm text-muted">Loading exercise incidents...</p> : filtered.length === 0 ? <p className="p-4 text-sm text-muted">No matching incidents.</p> : filtered.map(item =>
            <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id}
              className={`mb-2 w-full rounded-xl border p-3 text-left transition-colors hover:bg-elevated ${selectedId === item.id ? "border-accent bg-accent/5" : "border-transparent"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{item.hazard_type}</span><StatusBadge status={item.status}/></div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted"><MapPinned size={13}/>{item.lat.toFixed(3)}, {item.lon.toFixed(3)}</div>
            </button>)}
        </div>
        {selected && <div className="border-t border-stroke p-4"><div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center justify-between gap-2"><p className="eyebrow">Selected incident</p><StatusBadge status={selected.status}/></div>
          <h3 className="mt-3 text-sm font-bold">{selected.hazard_type}</h3>
          <p className="mt-2 text-xs text-muted">ID {selected.id.slice(0,8)} · {selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}</p>
          <p className="mt-2 text-xs text-muted">Synthetic record. Operational actions are disabled.</p>
          <Link href={"/incidents/" + selected.id} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Open intelligence workspace <ArrowRight size={14}/></Link>
        </div></div>}
      </section>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <section className="panel min-w-0" aria-label="Synthetic rainfall trend">
        <div className="panel-heading"><div><h2 className="flex items-center gap-2 text-base font-bold"><CloudRain size={18} className="text-accent"/> Hazard Telemetry</h2><p className="mt-1 text-xs text-muted">Synthetic time-series fixture · not a weather forecast</p></div><span className="text-xs font-semibold text-muted">Simulated 60 minutes</span></div>
        <div className="h-[250px] w-full px-2 pb-4 pt-5 sm:px-5">
          {telemetry?.points?.length ? <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={telemetry.points} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs><linearGradient id="rainArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38cdb5" stopOpacity={0.38}/><stop offset="95%" stopColor="#38cdb5" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid stroke="rgb(120 150 165 / .16)" strokeDasharray="3 4" vertical={false}/>
              <XAxis dataKey="label" tick={{ fill: "#94a8b7", fontSize: 11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill: "#94a8b7", fontSize: 11 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ background: "#11283b", border: "1px solid #355268", borderRadius: 12, color: "#f2f8ff" }} labelStyle={{ color: "#c5d9e6" }}/>
              <Area type="monotone" dataKey="rainfall_mm" name="Rainfall (mm)" stroke="#38cdb5" strokeWidth={3} fill="url(#rainArea)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted">{loading ? "Loading chart..." : "No telemetry available"}</div>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><Waves size={18} className="text-accent"/> Response Readiness</h2><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">Planning preview</span></div>
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
