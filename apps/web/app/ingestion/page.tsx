"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Database, LockKeyhole, RefreshCw, ShieldCheck, TerminalSquare, XCircle } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { REASON_LABELS, type IngestionOverview, type QuarantineReason } from "../../lib/ingestion";

const REASONS = Object.keys(REASON_LABELS) as QuarantineReason[];
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}
export default function IngestionPage() {
  const [data, setData] = useState<IngestionOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(n => n+1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/ingestion/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Exercise ingestion status unavailable");
        const value = await response.json() as IngestionOverview;
        if (value.mode !== "synthetic_exercise" || value.live_ingestion_enabled !== false ||
            value.no_operational_actions !== true) throw new Error("Unexpected integration classification");
        if (!controller.signal.aborted) {setData(value);setError("");}
      })
      .catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unknown API error");})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [version]);

  return <AppShell title="DataFusion Ingestion" description="Validated observation contracts, replay deduplication and quarantine monitoring for synthetic exercise data.">
    <div role="note" className="mb-5 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200">
      <ShieldCheck size={20} className="mt-1 shrink-0"/>
      <span><strong>Exercise-only: no live ingestion.</strong> Replay runs only through a local Docker CLI command using bundled fixture data. The browser cannot send measurements, warnings or dispatch instructions.</span>
    </div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}. Any previous counts may be out of date.</p>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-muted">{data ? "Measured from local exercise database · " + dateLabel(data.generated_at) : "Awaiting exercise database status"}</span>
      <button type="button" className="control" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh summary</button>
    </div>
    <section className="grid gap-4 sm:grid-cols-3" aria-label="Synthetic replay metrics">
      {[
        { title: "Accepted unique events", value: data?.accepted_events ?? "—", icon: CheckCircle2, color: "text-accent", description: "Stored only after validation" },
        { title: "Quarantined unique records", value: data?.quarantine_records ?? "—", icon: XCircle, color: "text-rose-500", description: "Invalid records held as metadata only" },
        { title: "Live ingest connections", value: "0", icon: LockKeyhole, color: "text-amber-500", description: "Not configured or available" },
      ].map(card => <article className="panel p-5" key={card.title}>
        <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-muted">{card.title}</span><card.icon size={20} className={card.color}/></div>
        <p className="mt-3 text-3xl font-bold tabular-nums">{card.value}</p><p className="mt-2 text-xs text-muted">{card.description}</p>
      </article>)}
    </section>
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,1fr)]">
      <section className="panel overflow-hidden">
        <div className="panel-heading"><div><h2 className="flex items-center gap-2 text-base font-bold"><ClipboardList size={18} className="text-accent"/> Quarantine reasons</h2><p className="mt-1 text-xs text-muted">Counts never display rejected raw payloads.</p></div><span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">Read only</span></div>
        <div className="divide-y divide-stroke">
          {REASONS.map(reason => <div className="flex items-center justify-between gap-3 px-5 py-4" key={reason}>
            <span className="flex items-center gap-3"><AlertTriangle size={17} className="shrink-0 text-muted" aria-hidden="true"/><span className="text-sm">{REASON_LABELS[reason]}</span></span>
            <strong className="tabular-nums">{data ? data.quarantine_reasons[reason] ?? 0 : "—"}</strong>
          </div>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><TerminalSquare size={18} className="text-accent"/> Reproducible local replay</h2></div>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-6 text-muted">Run the reviewed synthetic fixture in your Windows Docker terminal. Repeating it should not create duplicate accepted events or repeated quarantine rows.</p>
          <div className="rounded-xl border border-stroke bg-elevated p-4">
            <p className="eyebrow mb-2">PowerShell · project root</p>
            <code className="break-all font-mono text-xs text-ink">docker compose exec api python -m app.replay</code>
          </div>
          <p className="text-xs leading-6 text-muted"><strong>No Run button:</strong> replay is intentionally restricted to a locally authorized terminal command, not exposed as a public API.</p>
          <Link href="/sources" className="control w-full text-xs"><Database size={16}/> Examine resulting source history <ArrowRight size={15}/></Link>
          <Link href="/help" className="control w-full text-xs"><Activity size={16}/> Read source quality guidance <ArrowRight size={15}/></Link>
        </div>
      </section>
    </div>
  </AppShell>;
}
