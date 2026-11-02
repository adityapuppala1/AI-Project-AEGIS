"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";
import { StatusPill } from "./ui";
import { ageLabel, feedFreshness, fetchEarthFeed, formatIst, summarizeSignals, type Freshness, type RecordFeed } from "../lib/earth-watch";

const REFRESH_MS = 300_000;
const CHIP: Record<Freshness, string> = {
  fresh: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  aging: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  stale: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
};

/** Opt-in, display-only public signals. Renders nothing unless the public feed profile is enabled. */
export function PublicSignalsStrip() {
  const [enabled, setEnabled] = useState(false);
  const [quakes, setQuakes] = useState<RecordFeed | null>(null);
  const [events, setEvents] = useState<RecordFeed | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const nextRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const [q, e] = await Promise.allSettled([
        fetchEarthFeed<RecordFeed>("earthquakes", controller.signal),
        fetchEarthFeed<RecordFeed>("events", controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (q.status === "fulfilled") setQuakes(q.value);
      if (e.status === "fulfilled") setEvents(e.value);
      setFailed(q.status === "rejected" || e.status === "rejected");
      nextRef.current = Date.now() + REFRESH_MS;
    };
    let tick: ReturnType<typeof setInterval> | undefined;
    fetch("/api/earth-watch/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const status = await response.json() as { classification?: string; enabled?: boolean; display_only?: boolean };
        if (controller.signal.aborted || status.classification !== "public_reference" || status.display_only !== true || !status.enabled) return;
        setEnabled(true);
        await load();
        tick = setInterval(() => {
          setNow(Date.now());
          if (document.visibilityState === "visible" && Date.now() >= nextRef.current) {
            nextRef.current = Date.now() + REFRESH_MS;
            void load();
          }
        }, 5000);
      })
      .catch(() => undefined);
    return () => { controller.abort(); clearInterval(tick); };
  }, []);

  if (!enabled || (!quakes && !events)) return null;
  const summary = summarizeSignals(quakes?.records ?? [], events?.records ?? []);
  const feeds = [quakes, events].filter((feed): feed is RecordFeed => feed !== null);
  const worst = feeds.map(feed => feedFreshness(feed, now)).reduce<Freshness>(
    (acc, value) => value === "stale" || acc === "stale" ? "stale" : value === "aging" || acc === "aging" ? "aging" : "fresh", "fresh");
  const oldest = Math.min(...feeds.map(feed => Date.parse(feed.fetched_at)));
  const strongest = summary.strongest;

  return <section className="panel mt-5 p-4 sm:p-5" aria-label="Public reference signals">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"/>
          <Globe2 size={16} className="text-accent"/> Public signals · reference only
        </h2>
        <StatusPill tone={worst === "stale" ? "danger" : worst === "aging" ? "warning" : "success"}>{worst === "stale" ? "Stale · " : ""}USGS &amp; NASA fetched {ageLabel((now - oldest) / 1000)}</StatusPill>
        {failed && <span className="text-[11px] text-rose-700 dark:text-rose-300">Last refresh failed; showing earlier data.</span>}
      </div>
      <Link href="/earth-watch" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">Open Earth Watch <ArrowRight size={14}/></Link>
    </div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-elevated/40 p-3"><dt className="text-[11px] text-muted">Earthquakes, India &amp; neighbours (7 days)</dt>
        <dd className="mt-1 text-xl font-bold tabular-nums">{quakes ? summary.quakeCount : "—"}</dd></div>
      <div className="rounded-lg bg-elevated/40 p-3"><dt className="text-[11px] text-muted">Open natural events in region (30 days)</dt>
        <dd className="mt-1 text-xl font-bold tabular-nums">{events ? summary.eventCount : "—"}</dd></div>
      <div className="rounded-lg bg-elevated/40 p-3"><dt className="text-[11px] text-muted">Strongest recent quake in region</dt>
        <dd className="mt-1 text-sm font-semibold">{strongest ? `${strongest.title} · ${formatIst(strongest.observed_at)}` : "None reported in this window"}</dd></div>
    </dl>
    <p className="mt-3 text-[11px] leading-5 text-muted">Public NASA and USGS reference data. It is not an AEGIS assessment, does not create cases, approvals, tasks or warnings, and no markers does not mean safe.</p>
  </section>;
}
