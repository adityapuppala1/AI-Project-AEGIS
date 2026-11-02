"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Database, LockKeyhole, RefreshCw, GitMerge, ShieldCheck, TerminalSquare, XCircle } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { useT } from "../../components/language-provider";
import { DataFreshness, ErrorState, InlineHelp, Panel, StatStrip, StatTile, Stepper } from "../../components/ui";
import { REASON_LABELS, type IngestionOverview, type QuarantineReason } from "../../lib/ingestion";

const REASONS = Object.keys(REASON_LABELS) as QuarantineReason[];
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}
export default function IngestionPage() {
  const t = useT();
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
    {error && <ErrorState className="mb-4" message={error + ". " + t("Any previous counts may be out of date.")} onRetry={refresh}/>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">{data ? "Measured from local exercise database · " + dateLabel(data.generated_at) : "Awaiting exercise database status"}{data && <DataFreshness observedAt={data.generated_at} staleAfterHours={1}/>}</span>
      <button type="button" className="control" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh summary</button>
    </div>
    <StatStrip label={t("Synthetic replay metrics")} className="sm:grid-cols-3 xl:grid-cols-3">
      <StatTile index={0} label={t("Accepted unique events")} icon={CheckCircle2} tone="success" value={data?.accepted_events ?? "—"} hint={t("Stored only after validation")}/>
      <StatTile index={1} label={t("Quarantined unique records")} icon={XCircle} tone={data && data.quarantine_records > 0 ? "warning" : "neutral"} value={data?.quarantine_records ?? "—"} hint={t("Invalid records held as metadata only")}/>
      <StatTile index={2} label={t("Live ingest connections")} icon={LockKeyhole} tone="neutral" value="0" hint={t("Not configured or available")}/>
    </StatStrip>
    <Panel className="mb-5" level={2} icon={GitMerge} title={t("How a replay moves through DataFusion")}
      description={t("Local-only and synthetic: bundled fixture data, no live intake.")}>
      <Stepper label={t("Replay stages")} steps={[
        { id: "fixture", label: t("Read fixture"), description: t("Bundled synthetic file"), status: "done" },
        { id: "validate", label: t("Validate"), description: t("Contract checks"), status: "done" },
        { id: "dedupe", label: t("Deduplicate"), description: t("Repeat runs add nothing"), status: "done" },
        { id: "store", label: t("Store or quarantine"), description: t("Metadata only for rejects"), status: "current" },
      ]}/>
      <InlineHelp label={t("What does this page show?")}>
        {t("Counts come from the local exercise database. They describe replay bookkeeping, not real observations, and they are not an accuracy measure.")}
      </InlineHelp>
    </Panel>
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
