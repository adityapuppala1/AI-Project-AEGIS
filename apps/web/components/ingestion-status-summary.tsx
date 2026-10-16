"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GitMerge, ShieldCheck } from "lucide-react";
import type { IngestionOverview } from "../lib/ingestion";

export function IngestionStatusSummary() {
  const [status, setStatus] = useState<IngestionOverview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ingestion/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unavailable");
        const body = await response.json() as IngestionOverview;
        if (body.mode !== "synthetic_exercise" || body.live_ingestion_enabled !== false) throw new Error("Unexpected mode");
        if (!controller.signal.aborted) setStatus(body);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  return <section className="panel mt-5 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="DataFusion replay summary">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><GitMerge size={20}/></span>
      <div><h2 className="text-sm font-bold">DataFusion Ingestion <span className="ml-1 font-normal text-muted">· Synthetic replay</span></h2>
        <p className="mt-1 text-xs text-muted">
          {failed ? "Ingestion status unavailable" :
          status ? `${status.accepted_events} accepted event IDs · ${status.quarantine_records} quarantined record fingerprints` :
          "Checking local exercise replay ledger..."}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted"><ShieldCheck size={13}/> No live observation intake or operational actions</p>
      </div>
    </div>
    <Link href="/ingestion" className="control text-xs">Review replay <ArrowRight size={15}/></Link>
  </section>;
}
