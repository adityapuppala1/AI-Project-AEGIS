"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RadioTower, ShieldAlert } from "lucide-react";
import type { SourceOverview } from "../lib/source-health";

export function SourceHealthSummary() {
  const [overview, setOverview] = useState<SourceOverview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sources", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unavailable");
        const payload = await response.json() as SourceOverview;
        if (payload.source !== "synthetic_exercise" || payload.real_connectors_enabled !== false)
          throw new Error("Unexpected classification");
        if (!controller.signal.aborted) { setOverview(payload); setError(false); }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  const attention = overview ? overview.counts.delayed + overview.counts.stale +
    overview.counts.no_data + overview.counts.clock_anomaly : 0;
  return <section className="panel mt-5 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="Exercise source timeliness summary">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><RadioTower size={20}/></span>
      <div>
        <h2 className="text-sm font-bold">Source Freshness Monitor <span className="ml-1 font-normal text-muted">· Simulation</span></h2>
        {error ? <p role="status" className="mt-1 flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300"><AlertTriangle size={14}/> Source monitoring data unavailable</p> :
          overview ? <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            {attention > 0 ? <ShieldAlert size={14} className="text-amber-500"/> : <RadioTower size={14} className="text-accent"/>}
            {overview.total} synthetic feeds · {attention} with missing, delayed or unusual observations
          </p> : <p className="mt-1 text-xs text-muted">Checking simulated source data age...</p>}
        <p className="mt-1 text-[11px] text-muted">Not a real-time device-health or official weather-service claim</p>
      </div>
    </div>
    <Link href="/sources" className="control text-xs">Inspect sources <ArrowRight size={15}/></Link>
  </section>;
}
