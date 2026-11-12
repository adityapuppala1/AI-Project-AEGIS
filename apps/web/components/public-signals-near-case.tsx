"use client";

import { SortableTable, Button, Panel, buttonClass } from "./ui";
import { ErrorState } from "./ui";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass, Globe2, Radar, ShieldAlert } from "lucide-react";
import {
  ageLabel, categoryStyle, compassLabel, feedFreshness, fetchEarthFeed, formatIst, markerRadius, nearbySignals,
  type Freshness, type NearbySignal, type PublicRecord, type RecordFeed,
} from "../lib/earth-watch";

const RADII = [100, 300, 1000] as const;
const SIZE = 260, CENTER = SIZE / 2, PLOT = 94;
const CHIP: Record<Freshness, string> = {
  fresh: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  aging: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  stale: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
};
type Gate = "checking" | "disabled" | "enabled" | "error";

function Radar2D({ signals, radiusKm }: { signals: NearbySignal[]; radiusKm: number }) {
  return <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto h-auto w-full max-w-[300px]" role="img"
    aria-label={`Radar-style plot of ${signals.length} public reports within ${radiusKm} kilometres of this case. A table with the same values follows.`}>
    <defs>
      <radialGradient id="radar-bg"><stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity=".16"/><stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity=".02"/></radialGradient>
      <linearGradient id="radar-sweep-fill" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgb(var(--signal))" stopOpacity="0"/><stop offset="100%" stopColor="rgb(var(--signal))" stopOpacity=".38"/></linearGradient>
    </defs>
    <circle cx={CENTER} cy={CENTER} r={PLOT + 14} fill="url(#radar-bg)" stroke="rgb(var(--stroke))"/>
    {[1 / 3, 2 / 3, 1].map(fraction => <circle key={fraction} cx={CENTER} cy={CENTER} r={PLOT * fraction} fill="none" stroke="rgb(var(--chart-grid) / .35)" strokeDasharray="3 4"/>)}
    <path d={`M${CENTER} ${CENTER - PLOT - 14}V${CENTER + PLOT + 14}M${CENTER - PLOT - 14} ${CENTER}H${CENTER + PLOT + 14}`} stroke="rgb(var(--chart-grid) / .3)"/>
    <g className="radar-sweep" aria-hidden="true">
      <path d={`M${CENTER} ${CENTER}L${CENTER + PLOT + 14} ${CENTER}A${PLOT + 14} ${PLOT + 14} 0 0 0 ${CENTER + (PLOT + 14) * Math.cos(Math.PI / 6)} ${CENTER - (PLOT + 14) * Math.sin(Math.PI / 6)}Z`} fill="url(#radar-sweep-fill)"/>
    </g>
    {["N", "E", "S", "W"].map((label, index) => <text key={label} x={CENTER + (index === 1 ? PLOT + 22 : index === 3 ? -PLOT - 22 : 0)} y={CENTER + (index === 0 ? -PLOT - 20 : index === 2 ? PLOT + 28 : 4)}
      textAnchor="middle" fontSize="9" fill="rgb(var(--muted))">{label}</text>)}
    {signals.slice(0, 40).map(({ record, km, bearing }, index) => {
      const distance = Math.min(1, km / radiusKm) * PLOT;
      const x = CENTER + distance * Math.sin(bearing * Math.PI / 180), y = CENTER - distance * Math.cos(bearing * Math.PI / 180);
      const color = categoryStyle(record.category).color;
      return <g key={record.id} className="reveal-in" style={{ "--i": index } as React.CSSProperties}>
        <circle cx={x} cy={y} r={markerRadius(record) * .75 + 3} fill={color} opacity=".22"/>
        <circle cx={x} cy={y} r={markerRadius(record) * .6 + 1.5} fill={color} stroke="#fff" strokeWidth="1"/>
      </g>;
    })}
    <circle cx={CENTER} cy={CENTER} r="6" className="radar-ping" fill="none" stroke="rgb(var(--accent))" strokeWidth="2"/>
    <circle cx={CENTER} cy={CENTER} r="5" fill="rgb(var(--accent))" stroke="#fff" strokeWidth="1.5"/>
    <text x={CENTER} y={CENTER + 20} textAnchor="middle" fontSize="8" fill="rgb(var(--muted))">case</text>
  </svg>;
}

/** Display-only public context around a synthetic case. Never stored, never evidence. */
export function PublicSignalsNearCase({ lat, lon }: { lat: number; lon: number }) {
  const [gate, setGate] = useState<Gate>("checking");
  const [quakes, setQuakes] = useState<RecordFeed | null>(null);
  const [events, setEvents] = useState<RecordFeed | null>(null);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(300);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/earth-watch/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("status");
        const status = await response.json() as { classification?: string; enabled?: boolean; display_only?: boolean };
        if (status.classification !== "public_reference" || status.display_only !== true) throw new Error("class");
        if (controller.signal.aborted) return;
        setGate(status.enabled ? "enabled" : "disabled");
        if (!status.enabled) return;
        const [q, e] = await Promise.allSettled([
          fetchEarthFeed<RecordFeed>("earthquakes", controller.signal), fetchEarthFeed<RecordFeed>("events", controller.signal)]);
        if (controller.signal.aborted) return;
        if (q.status === "fulfilled") setQuakes(q.value);
        if (e.status === "fulfilled") setEvents(e.value);
        setFailed(q.status === "rejected" || e.status === "rejected");
      })
      .catch(() => { if (!controller.signal.aborted) setGate("error"); });
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => { controller.abort(); clearInterval(tick); };
  }, []);

  const records = useMemo<PublicRecord[]>(() => [...(quakes?.records ?? []), ...(events?.records ?? [])], [quakes, events]);
  const nearby = useMemo(() => nearbySignals(records, { lat, lon }, radius), [records, lat, lon, radius]);
  const feeds = [quakes, events].filter((feed): feed is RecordFeed => feed !== null);
  const worst: Freshness = feeds.some(feed => feedFreshness(feed, now) === "stale") ? "stale"
    : feeds.some(feed => feedFreshness(feed, now) === "aging") ? "aging" : "fresh";
  const oldest = feeds.length ? Math.min(...feeds.map(feed => Date.parse(feed.fetched_at))) : null;

  return <Panel level={3} className="mb-5 overflow-hidden" aria-label="Public signals near this case" bodyClassName="p-0" icon={Radar} title="Public signals near this case" description="Context only · USGS and NASA reports within a chosen radius"
    actions={<span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">Not evidence</span>}>
    <div className="flex items-start gap-3 border-b border-stroke bg-amber-500/5 px-5 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert size={16} className="mt-0.5 shrink-0"/>
      <p>These public reports are not part of this synthetic case, are never stored with it and cannot change its assessment or approvals.
        An empty radar does not mean an area is safe.</p>
    </div>
    {gate === "checking" && <p className="p-5 text-sm text-muted" role="status">Checking public reference feeds…</p>}
    {gate === "error" && <ErrorState message={"Public context is unavailable. The case itself is unaffected."} className="m-4" />}
    {gate === "disabled" && <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="max-w-xl text-sm text-muted">Public feeds are switched off in this synthetic profile. Start the optional display-only profile to see NASA and USGS reports around this case.</p>
      <Link href="/earth-watch" className={buttonClass({ size: "sm" })}><Globe2 size={15}/> About Earth Watch <ArrowRight size={14}/></Link>
    </div>}
    {gate === "enabled" && <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,300px)_1fr]">
      <div>
        <Radar2D signals={nearby} radiusKm={radius}/>
        <div className="mt-3 flex justify-center gap-2" role="group" aria-label="Search radius">
          {RADII.map(value => <Button key={value} type="button" size="sm" aria-pressed={radius === value}
            className={radius === value ? "!border-accent !text-accent" : ""} onClick={() => setRadius(value)}>{value} km</Button>)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">{nearby.length} within {radius} km</span>
          {oldest !== null && <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${CHIP[worst]}`}>
            {worst === "stale" ? "Stale · " : ""}fetched {ageLabel((now - oldest) / 1000)}</span>}
          {failed && <span className="text-rose-700 dark:text-rose-300">One feed failed to load.</span>}
        </div>
        {nearby.length === 0 ? <p className="rounded-lg border border-dashed border-stroke p-5 text-center text-xs text-muted">
          No public reports within {radius} km. Try a larger radius. This is not an absence of hazards.</p>
          : <div className="max-h-[300px] overflow-auto rounded-lg border border-stroke">
            <SortableTable label={"Public reports within " + radius + " kilometres, nearest first"} minWidth="26.25rem" defaultSort={{ key: "distance", direction: "asc" }}
              rows={nearby.slice(0, 40)} rowKey={item => item.record.id} columns={[
                { key: "report", label: "Report", sortValue: ({ record }) => record.title, cell: ({ record }) => <><span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: categoryStyle(record.category).color }}/>{record.title}
                  <span className="block text-[10px]">{record.source} · {record.kind}</span></> },
                { key: "distance", label: "Distance", numeric: true, sortValue: ({ km }) => km, cell: ({ km }) => (km < 10 ? km.toFixed(1) : Math.round(km)) + " km" },
                { key: "direction", label: "Direction", sortValue: ({ bearing }) => bearing, cell: ({ bearing }) => <span className="inline-flex items-center gap-1"><Compass size={12} aria-hidden="true"/>{compassLabel(bearing)}</span> },
                { key: "observed", label: "Observed", sortValue: ({ record }) => record.observed_at, cell: ({ record }) => formatIst(record.observed_at) },
              ]}/></div>}
        <Link href="/earth-watch" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-accent">Open the full Earth Watch map <ArrowRight size={14}/></Link>
      </div>
    </div>}
  </Panel>;
}
