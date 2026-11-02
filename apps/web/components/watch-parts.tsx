"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  AlertTriangle, CheckCircle2, Circle, Clock, Database, Droplets, Eye, FileSearch, Flame, FlaskConical, Mountain, Plug, RefreshCw, ShieldAlert,
  Thermometer, Waves, Wind, Satellite, X, type LucideIcon,
} from "lucide-react";
import { useT } from "./language-provider";
import { formatIst } from "../lib/earth-watch";
import {
  STATE_COLOR, ageParts, hazardStyle, isStale, thresholdMarks,
  type EvidenceRecord, type HazardStyle, type ProactiveRun, type TriggerEvent, type TriggerState, type WatchPayload,
} from "../lib/proactive";

export const ICONS: Record<HazardStyle["icon"], LucideIcon> = { waves: Waves, flame: Flame, mountain: Mountain, wind: Wind, thermometer: Thermometer, droplets: Droplets, satellite: Satellite, alert: AlertTriangle };
export const STATE_CHIP: Record<TriggerState, string> = {
  clear: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30",
  watch: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  candidate: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30",
};
const STATE_ICON: Record<TriggerState, LucideIcon> = { clear: CheckCircle2, watch: Eye, candidate: ShieldAlert };
export const show = (value: unknown) => typeof value === "number" ? String(Math.round(value * 1000) / 1000) : Array.isArray(value) ? value.join(", ") : String(value);
const prefersReducedMotion = () => typeof window !== "undefined" && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function locationLabel(trigger: TriggerEvent): string {
  const label = trigger.rationale.location_label;
  return typeof label === "string" && label ? label : `${trigger.lat.toFixed(2)}, ${trigger.lon.toFixed(2)}`;
}

export function SampleChip({ className = "" }: Readonly<{ className?: string }>) {
  const t = useT();
  return <span className={`inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-500/40 dark:text-amber-200 ${className}`}>
    <FlaskConical size={12} aria-hidden="true"/>{t("SAMPLE DATA — not real evidence")}</span>;
}

export function AgeText({ iso, now }: Readonly<{ iso: string | null; now: number }>) {
  const t = useT();
  const age = ageParts(iso, now);
  if (!age) return <>{t("time unknown")}</>;
  if (age.unit === "now") return <>{t("just now")}</>;
  return <>{age.n} {t(age.unit)} {t("ago")}</>;
}

export function CountUp({ value }: Readonly<{ value: number }>) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return; }
    let frame = 0; const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / 600);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="tabular-nums">{shown}</span>;
}

export function StateChip({ state }: Readonly<{ state: TriggerState }>) {
  const t = useT(); const Icon = STATE_ICON[state];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ring-1 ${STATE_CHIP[state]}`}><Icon size={12} aria-hidden="true"/>{t(state)}</span>;
}

// ---------- loading ----------
export function WatchSkeleton() {
  const t = useT();
  return <div role="status" aria-busy="true"><span className="sr-only">{t("Checking Hazard Watch…")}</span>
    <div aria-hidden="true" className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="panel p-4"><div className="shimmer h-3 w-16"/><div className="shimmer mt-3 h-8 w-12"/><div className="shimmer mt-3 h-1.5 w-full"/></div>)}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="panel overflow-hidden"><div className="shimmer m-4 h-5 w-32"/><div className="shimmer mx-4 mb-4 h-72 sm:h-96"/></div>
        <div className="panel p-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="flex items-center gap-3 py-3"><div className="shimmer h-9 w-9"/><div className="flex-1 space-y-2"><div className="shimmer h-3 w-3/4"/><div className="shimmer h-2 w-1/2"/></div></div>)}</div>
      </div>
    </div></div>;
}

// ---------- summary strip ----------
function Tile({ icon: Icon, label, children, fill, color, href }: Readonly<{ icon: LucideIcon; label: string; children: React.ReactNode; fill?: number; color?: string; href?: string }>) {
  const body = <>
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted"><Icon size={14} aria-hidden="true"/>{label}</div>
    <div className="mt-2 text-2xl font-bold leading-none">{children}</div>
    {fill !== undefined && <div className="mt-3 h-1.5 rounded-full bg-elevated" aria-hidden="true"><div className="bar-grow h-1.5 rounded-full" style={{ width: `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`, background: color ?? "rgb(var(--accent))" }}/></div>}
  </>;
  return href ? <Link href={href} className="panel metric-card block p-4 hover:border-accent/40">{body}</Link> : <div className="panel metric-card p-4">{body}</div>;
}

export function SummaryStrip({ watch, now, sample }: Readonly<{ watch: WatchPayload; now: number; sample: boolean }>) {
  const t = useT();
  const total = Math.max(1, watch.triggers.length);
  const count = (state: TriggerState) => watch.triggers.filter(item => item.state === state).length;
  const times = watch.evidence.map(item => Date.parse(item.observed_at ?? "")).filter(Number.isFinite);
  const freshest = times.length ? new Date(Math.max(...times)).toISOString() : null;
  const reporting = new Set(watch.evidence.map(item => item.connector_id)).size;
  return <section aria-label={t("Summary")} className="mb-5">
    {sample && <div className="mb-2"><SampleChip/></div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Tile icon={ShieldAlert} label={t("candidate")} fill={count("candidate") / total} color={STATE_COLOR.candidate}><CountUp value={count("candidate")}/></Tile>
      <Tile icon={Eye} label={t("watch")} fill={count("watch") / total} color={STATE_COLOR.watch}><CountUp value={count("watch")}/></Tile>
      <Tile icon={CheckCircle2} label={t("clear")} fill={count("clear") / total} color={STATE_COLOR.clear}><CountUp value={count("clear")}/></Tile>
      <Tile icon={Database} label={t("Evidence records")}><CountUp value={watch.evidence.length}/></Tile>
      <Tile icon={Clock} label={t("Freshest evidence")}><span className="text-lg"><AgeText iso={freshest} now={now}/></span></Tile>
      <Tile icon={Plug} label={t("Connectors reporting")} href="/admin/connectors"><CountUp value={reporting}/> <span className="text-xs font-semibold text-accent">{t("Manage")}</span></Tile>
    </div>
  </section>;
}

// ---------- filters ----------
export function FilterBar({ hazards, hazardFilter, onToggleHazard, stateFilter, onState, onClear, counts }: Readonly<{
  hazards: string[]; hazardFilter: ReadonlySet<string>; onToggleHazard: (hazard: string) => void;
  stateFilter: TriggerState | "all"; onState: (state: TriggerState | "all") => void; onClear: () => void; counts: Record<string, number>;
}>) {
  const t = useT();
  const active = hazardFilter.size > 0 || stateFilter !== "all";
  return <div className="space-y-3 border-b border-stroke px-4 py-3">
    <div role="group" aria-label={t("Filter by hazard")} className="flex flex-wrap gap-2">
      {hazards.map(hazard => {
        const style = hazardStyle(hazard); const Icon = ICONS[style.icon]; const on = hazardFilter.has(hazard);
        return <button key={hazard} type="button" aria-pressed={on} onClick={() => onToggleHazard(hazard)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold hover:bg-elevated ${on ? "border-accent bg-accent/10" : "border-stroke bg-surface"}`}>
          <Icon size={14} style={{ color: style.color }} aria-hidden="true"/>{t(style.label)}<span className="text-muted">{counts[hazard] ?? 0}</span></button>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t("Filter by state")} className="flex flex-wrap gap-1.5">
        {(["all", "candidate", "watch", "clear"] as const).map(state => <button key={state} type="button" aria-pressed={stateFilter === state} onClick={() => onState(state)}
          className={`min-h-9 rounded-lg border px-3 text-xs font-semibold hover:bg-elevated ${stateFilter === state ? "border-accent bg-accent/10" : "border-stroke bg-surface"}`}>{state === "all" ? t("All states") : t(state)}</button>)}
      </div>
      <button type="button" className="control !min-h-9 text-xs" onClick={onClear} disabled={!active}><X size={14} aria-hidden="true"/>{t("Clear filters")}</button>
    </div>
  </div>;
}

// ---------- queue ----------
export function QueueList({ items, selectedId, onSelect, now, filtered }: Readonly<{
  items: TriggerEvent[]; selectedId: string | null; onSelect: (id: string, opener: HTMLElement | null) => void; now: number; filtered: boolean;
}>) {
  const t = useT();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const rover = Math.max(0, Math.min(items.length - 1, activeIdx));
  function move(event: KeyboardEvent<HTMLUListElement>) {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    let next = -1;
    if (event.key in keys) next = Math.max(0, Math.min(items.length - 1, rover + keys[event.key]));
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault(); setActiveIdx(next); refs.current[next]?.focus();
  }
  if (items.length === 0) return <p className="p-5 text-sm text-muted" role="status">{filtered ? t("No triggers match these filters.") : t("No triggers yet. An empty queue does not mean an area is safe.")}</p>;
  return <ul className="max-h-[34rem] divide-y divide-stroke overflow-y-auto" onKeyDown={move} aria-label={t("Trigger queue")}>{items.map((item, index) => {
    const style = hazardStyle(item.hazard); const Icon = ICONS[style.icon]; const active = item.id === selectedId;
    return <li key={item.id}>
      <button type="button" ref={node => { refs.current[index] = node; }} tabIndex={index === rover ? 0 : -1} onFocus={() => setActiveIdx(index)}
        onClick={event => onSelect(item.id, event.currentTarget)} aria-pressed={active}
        className={`block w-full px-4 py-3 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${active ? "bg-accent/10 shadow-[inset_3px_0_0_rgb(var(--accent))]" : ""}`}>
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: style.color + "22", color: style.color }}><Icon size={18} aria-hidden="true"/></span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{t(style.label)} · {locationLabel(item)}</strong>
            <span className="block truncate text-[11px] text-muted">{item.trigger_id} · <AgeText iso={item.fired_at} now={now}/></span></span>
          <StateChip state={item.state}/>
        </span>
        <span className="mt-2 flex items-center gap-2 pl-12 text-[11px] text-muted">
          <span className="h-1.5 flex-1 rounded-full bg-elevated" aria-hidden="true"><span className="bar-grow block h-1.5 rounded-full" style={{ width: `${Math.round(item.score * 100)}%`, background: STATE_COLOR[item.state] }}/></span>
          <span>{t("score")} <span className="tabular-nums font-semibold text-ink">{item.score.toFixed(2)}</span></span>
        </span>
      </button>
    </li>;
  })}</ul>;
}

// ---------- empty state ----------
export function SetupChecklist({ evidenceCount, refreshed, triggerCount, onPreview, onRefresh, canRefresh, refreshing }: Readonly<{
  evidenceCount: number; refreshed: boolean; triggerCount: number; onPreview: () => void; onRefresh: () => void; canRefresh: boolean; refreshing: boolean;
}>) {
  const t = useT();
  const steps = [
    { title: t("Enable a connector"), body: t("A platform admin switches on at least one data connector, such as Open-Meteo."), done: evidenceCount > 0, action: <Link href="/admin/connectors" className="control !min-h-9 text-xs"><Plug size={14} aria-hidden="true"/>{t("Open connectors")}</Link> },
    { title: t("Press Refresh evidence"), body: t("An incident operator or platform admin fetches evidence once. Nothing runs in the background."), done: refreshed || evidenceCount > 0,
      action: <button type="button" className="control !min-h-9 text-xs" onClick={onRefresh} disabled={!canRefresh || refreshing}><RefreshCw size={14} aria-hidden="true"/>{t("Refresh evidence")}</button> },
    { title: t("Review the queue"), body: t("Triggers appear in the queue. A person reviews each one; AEGIS never sends warnings."), done: triggerCount > 0, action: null },
  ];
  const current = steps.findIndex(step => !step.done);
  return <section className="panel p-5 sm:p-6" aria-labelledby="setup-title">
    <h2 id="setup-title" className="flex items-center gap-2 text-base font-bold"><ShieldAlert size={18} className="text-accent" aria-hidden="true"/>{t("No triggers yet")}</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("An empty queue does not mean an area is safe. It only means no evidence has been turned into a trigger yet.")}</p>
    <ol className="mt-5 space-y-3" aria-label={t("Setup checklist")}>
      {steps.map((step, index) => <li key={step.title} aria-current={index === current ? "step" : undefined} className={`reveal-in flex items-start gap-3 rounded-xl border p-4 ${index === current ? "border-accent bg-accent/5" : "border-stroke"}`} style={{ "--i": index } as React.CSSProperties}>
        <span className="mt-0.5 shrink-0" aria-hidden="true">{step.done ? <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400"/> : <Circle size={20} className={index === current ? "text-accent" : "text-muted"}/>}</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-bold">{index + 1}. {step.title} <span className="ml-1 text-[11px] font-semibold text-muted">{step.done ? t("done") : index === current ? t("next") : t("later")}</span></p>
          <p className="mt-1 text-xs leading-5 text-muted">{step.body}</p>
          {step.action && !step.done && <div className="mt-3">{step.action}</div>}</div>
      </li>)}
    </ol>
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-stroke pt-4">
      <button type="button" className="control control-primary" onClick={onPreview}><FlaskConical size={16} aria-hidden="true"/>{t("Preview with sample data")}</button>
      <p className="text-xs text-muted">{t("Shows invented sample data so you can try the whole flow offline. It never calls the API.")}</p>
    </div>
  </section>;
}

// ---------- schematic fallback map ----------
const BOX = { minLon: 77.8, maxLon: 79.4, minLat: 16.9, maxLat: 18.1 };
export function FallbackMap({ triggers, selectedId, onSelect, onRetry }: Readonly<{ triggers: TriggerEvent[]; selectedId: string | null; onSelect: (id: string) => void; onRetry: () => void }>) {
  const t = useT();
  const lons = [BOX.minLon, BOX.maxLon, ...triggers.map(item => item.lon)], lats = [BOX.minLat, BOX.maxLat, ...triggers.map(item => item.lat)];
  const minLon = Math.min(...lons) - 0.05, maxLon = Math.max(...lons) + 0.05, minLat = Math.min(...lats) - 0.05, maxLat = Math.max(...lats) + 0.05;
  const W = 400, H = 300;
  const x = (lon: number) => (lon - minLon) / (maxLon - minLon) * W, y = (lat: number) => H - (lat - minLat) / (maxLat - minLat) * H;
  return <div className="p-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke bg-elevated px-3 py-2 text-xs" role="status">
      <span className="flex items-center gap-2"><AlertTriangle size={14} aria-hidden="true"/>{t("The map could not load. Every trigger is listed in the queue beside it.")}</span>
      <button type="button" className="control !min-h-8 text-xs" onClick={onRetry}><RefreshCw size={14} aria-hidden="true"/>{t("Retry map")}</button>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full rounded-lg border border-stroke bg-elevated" role="img" aria-label={t("Schematic mini-map of trigger locations around Hyderabad. Not to scale. Shapes show state: circle clear, square watch, diamond candidate.")}>
      {[1, 2, 3].map(i => <g key={i} stroke="rgb(var(--stroke))" strokeWidth="1"><line x1={W * i / 4} y1="0" x2={W * i / 4} y2={H}/><line x1="0" y1={H * i / 4} x2={W} y2={H * i / 4}/></g>)}
      <g><circle cx={x(78.48)} cy={y(17.385)} r="3" fill="rgb(var(--muted))"/><text x={x(78.48) + 6} y={y(17.385) + 14} fontSize="10" fill="rgb(var(--muted))">Hyderabad</text></g>
      {triggers.map(item => {
        const cx = x(item.lon), cy = y(item.lat), color = STATE_COLOR[item.state], sel = item.id === selectedId;
        return <g key={item.id} onClick={() => onSelect(item.id)} className="cursor-pointer">
          {sel && <circle cx={cx} cy={cy} r="14" fill="none" stroke="#22d3ee" strokeWidth="3"/>}
          {item.state === "candidate" ? <rect x={cx - 7} y={cy - 7} width="14" height="14" fill={color} stroke="#fff" strokeWidth="1.5" transform={`rotate(45 ${cx} ${cy})`}/>
            : item.state === "watch" ? <rect x={cx - 6} y={cy - 6} width="12" height="12" fill={color} stroke="#fff" strokeWidth="1.5"/>
            : <circle cx={cx} cy={cy} r="6" fill={color} stroke="#fff" strokeWidth="1.5"/>}
        </g>;
      })}
    </svg>
  </div>;
}

// ---------- detail ----------
function Gauge({ value, marks, unit }: Readonly<{ value: number | null; marks: { watch: number; candidate: number; unit: string } | null; unit: string }>) {
  const t = useT();
  if (!marks || value === null) return null;
  const min = Math.min(0, value), max = Math.max(marks.candidate * 1.25, value * 1.08, marks.watch * 1.1);
  const pos = (v: number) => `${Math.round(Math.max(0, Math.min(1, (v - min) / (max - min))) * 1000) / 10}%`;
  const reached: TriggerState = value >= marks.candidate ? "candidate" : value >= marks.watch ? "watch" : "clear";
  const label = `${t("Current value")} ${show(value)} ${unit}. ${t("Watch mark")} ${show(marks.watch)}. ${t("Candidate mark")} ${show(marks.candidate)}. ${t("Position")}: ${t(reached)}.`;
  return <div role="img" aria-label={label} className="mt-4">
    <div className="relative h-5" aria-hidden="true">
      <div className="absolute inset-x-0 top-1.5 h-2 rounded-full bg-elevated"/>
      <div className="bar-grow absolute left-0 top-1.5 h-2 rounded-full" style={{ width: pos(value), background: STATE_COLOR[reached] }}/>
      <div className="absolute top-0 h-5 w-0.5 bg-ink/50" style={{ left: pos(marks.watch) }}/>
      <div className="absolute top-0 h-5 w-0.5 bg-ink/80" style={{ left: pos(marks.candidate) }}/>
      <div className="absolute top-0.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-ink bg-surface" style={{ left: pos(value) }}/>
    </div>
    <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted" aria-hidden="true">
      <span>{t("watch")} {show(marks.watch)}</span><span>{t("candidate")} {show(marks.candidate)}</span></div>
  </div>;
}

function Big({ value, unit }: Readonly<{ value: number | null; unit: string }>) {
  return <p className="flex items-baseline gap-2"><span className="text-4xl font-bold leading-none tabular-nums">{value === null ? "n/a" : show(value)}</span><span className="text-sm font-semibold text-muted">{unit}</span></p>;
}

export function TriggerDetail({ trigger, evidenceById, now, sample, run, headingRef, onClose, drawer, onDrawer }: Readonly<{
  trigger: TriggerEvent; evidenceById: Map<string, EvidenceRecord>; now: number; sample: boolean; run: ProactiveRun | null;
  headingRef: RefObject<HTMLHeadingElement | null>; onClose: () => void; drawer: boolean; onDrawer: () => void;
}>) {
  const t = useT();
  const style = hazardStyle(trigger.hazard);
  const cited = trigger.evidence_ids.map(id => evidenceById.get(id)).filter((item): item is EvidenceRecord => !!item)
    .sort((a, b) => (Date.parse(b.observed_at ?? "") || 0) - (Date.parse(a.observed_at ?? "") || 0));
  const freshest = cited[0] ?? null;
  const marks = thresholdMarks(trigger.threshold);
  const forecast = typeof trigger.rationale.forecast_value === "number" ? trigger.rationale.forecast_value : null;
  const forecastUnit = typeof trigger.rationale.forecast_unit === "string" ? trigger.rationale.forecast_unit : marks?.unit ?? "";
  const horizon = typeof trigger.rationale.horizon_h === "number" ? trigger.rationale.horizon_h : null;
  const unit = freshest?.unit || marks?.unit || "";
  const hiddenKeys = new Set(["forecast_value", "forecast_unit", "horizon_h", "location_label"]);
  const rationale = Object.entries(trigger.rationale).filter(([key]) => !hiddenKeys.has(key));
  const stale = freshest ? isStale(freshest, now) : false;
  return <section className="sheet-in overflow-hidden rounded-t-3xl border-t-4 border-accent bg-transparent xl:rounded-xl xl:border-t xl:border-stroke" aria-labelledby="trigger-detail">
    <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-stroke xl:hidden" aria-hidden="true"/>
    <div className="mb-3 mt-3 flex flex-wrap items-center gap-3 px-1">
      <h2 id="trigger-detail" ref={headingRef} tabIndex={-1} className="text-lg font-bold outline-offset-4">{t(style.label)} · {locationLabel(trigger)}</h2>
      <StateChip state={trigger.state}/>
      {sample && <SampleChip/>}
      <button type="button" className="control ml-auto !min-h-9 text-xs" onClick={onClose}><X size={14} aria-hidden="true"/>{t("Close detail")}</button>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel min-w-0" aria-labelledby="live-title">
        <div className="panel-heading"><h3 id="live-title" className="text-base font-bold">{t("Live")} <span className="text-xs font-normal text-muted">{t("latest observed evidence")}</span></h3>{sample && <SampleChip/>}</div>
        <div className="p-5">
          {!freshest ? <p className="text-sm text-muted">{t("No cited evidence records are in the current watch window.")}</p> : <>
            <Big value={freshest.value} unit={unit}/>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${stale ? STATE_CHIP.watch : "bg-emerald-500/10 text-emerald-800 ring-emerald-500/30 dark:text-emerald-300"}`}><Clock size={12} aria-hidden="true"/>{stale ? t("Stale") : t("Fresh")} · <AgeText iso={freshest.observed_at} now={now}/></span>
              <span>{freshest.connector_id}</span></p>
            <Gauge value={freshest.value} marks={marks} unit={unit}/>
            {cited.length > 1 && <ul className="mt-4 space-y-2">{cited.slice(1).map(item => <li key={item.id} className="rounded-lg border border-stroke p-3 text-xs">
              <p className="font-bold">{item.hazard} · {item.value ?? "n/a"} {item.unit}</p>
              <p className="text-muted">{item.connector_id} · {t("observed")} {formatIst(item.observed_at)} · {t("retrieved")} {formatIst(item.retrieved_at)}</p>
              {isStale(item, now) && <p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">{t("Stale: older than the freshness window")}</p>}
            </li>)}</ul>}
          </>}
          <button type="button" className="control mt-4" aria-expanded={drawer} aria-controls="evidence-drawer" onClick={onDrawer}><FileSearch size={16} aria-hidden="true"/>{t("Evidence drawer")} ({trigger.evidence_ids.length})</button>
          {drawer && <div id="evidence-drawer" className="mt-3 rounded-lg border border-stroke p-3 text-xs">
            <p className="font-bold">{t("Cited records")}</p>
            <ul className="mt-2 space-y-1">{trigger.evidence_ids.map(id => <li key={id} className="break-all"><code>{id}</code>{evidenceById.has(id) ? "" : ` · ${t("not in current window")}`}</li>)}</ul>
          </div>}
        </div>
      </section>
      <section className="panel min-w-0" aria-labelledby="predicted-title">
        <div className="panel-heading"><h3 id="predicted-title" className="text-base font-bold">{t("Predicted")} <span className="text-xs font-normal text-muted">{t("forecast-derived and synthetic")}</span></h3>{sample && <SampleChip/>}</div>
        <div className="space-y-4 p-5 text-xs">
          {forecast === null ? <p className="text-sm text-muted">{t("No forecast value supplied.")}</p> : <div>
            <Big value={forecast} unit={forecastUnit}/>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300"><FlaskConical size={12} aria-hidden="true"/>{t("Synthetic, not calibrated")}</span>
              {horizon !== null && horizon > 0 && <span>{t("horizon")} {horizon} {t("hr")}</span>}</p>
            <Gauge value={forecast} marks={marks} unit={forecastUnit}/>
          </div>}
          <div><p className="font-bold">{t("Threshold")}</p>
            {trigger.threshold === null ? <p className="text-muted">{t("not supplied")}</p>
              : typeof trigger.threshold === "object" && !Array.isArray(trigger.threshold)
                ? <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">{Object.entries(trigger.threshold).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="font-semibold text-muted">{k}</dt><dd>{show(v)}</dd></div>)}</dl>
                : <p>{show(trigger.threshold)}</p>}</div>
          <div><p className="font-bold">{t("Forecast-derived values")}</p>
            {rationale.length === 0 ? <p className="text-muted">{t("none supplied")}</p>
              : <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">{rationale.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="font-semibold text-muted">{k}</dt><dd className="min-w-0 break-words">{show(v)}</dd></div>)}</dl>}</div>
          <div><p className="font-bold">{t("Variant outcomes")}</p>
            {run && run.variants.length > 0
              ? <ul className="mt-1 space-y-1">{run.variants.map(variant => <li key={variant.id}>{variant.label}: {variant.threshold_delta > 0 ? "+" : ""}{variant.threshold_delta} → <strong>{t(variant.resulting_state)}</strong> ({variant.score.toFixed(2)})</li>)}</ul>
              : <p className="text-muted">{t("Start a bounded run to simulate threshold variants.")}</p>}</div>
        </div>
      </section>
    </div>
  </section>;
}
