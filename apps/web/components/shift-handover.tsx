"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, FileDown, Printer, RefreshCw } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { EmptyState, ErrorState, Panel, SegmentedControl, SkeletonRows, StatusPill } from "./ui";
import { handoverFileName, handoverMarkdown, type Handover } from "../lib/operator-assist";
import { useOperatorSession } from "../lib/use-operator-session";
import { SignInRequired } from "./sign-in-required";

const WINDOWS = ["4", "8", "12", "24", "72"] as const;
type Window = (typeof WINDOWS)[number];
const SECTIONS: { key: string; title: string }[] = [
  { key: "watch", title: "Open watches and candidates" }, { key: "runs", title: "Proactive runs" },
  { key: "evidence_changes", title: "Evidence changes (sentinel)" }, { key: "approvals", title: "Pending approvals" },
  { key: "sla", title: "Overdue synthetic SLA tasks" }, { key: "failures", title: "Connector and scheduler failures" },
  { key: "scheduler", title: "Scheduler ticks" },
];

function save(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Read-only, cited handover brief. Nothing here writes, persists or sends. */
export function ShiftHandover() {
  const t = useT();
  const [hours, setHours] = useState<Window>("12");
  const [brief, setBrief] = useState<Handover | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const session = useOperatorSession();
  const signedOut = session !== null && !session.authenticated;

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError(null);
    fetch(`/api/handover?hours=${hours}`, { cache: "no-store", signal })
      .then(async response => {
        const data = await response.json().catch(() => null) as (Handover & { error?: string }) | null;
        if (!response.ok || !data) throw new Error(data?.error || "Handover brief unavailable");
        setBrief(data);
      })
      .catch(err => { if (!signal?.aborted) { setBrief(null); setError(err instanceof Error ? err.message : "Handover brief unavailable"); } })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [hours]);

  // Wait for the session: the brief is operator-only, so a signed-out request would only log a 401.
  useEffect(() => {
    if (!session) return;
    if (!session.authenticated) { setLoading(false); return; }
    const controller = new AbortController(); load(controller.signal); return () => controller.abort();
  }, [load, session]);

  const actions = <div className="flex flex-wrap items-center gap-2 print:hidden">
    <button type="button" className="control" onClick={() => load()} disabled={loading || signedOut}><RefreshCw size={16}/>{t("Refresh")}</button>
    <button type="button" className="control" disabled={!brief} onClick={() => brief && save(handoverMarkdown(brief), handoverFileName(brief.generated_at, "md"), "text/markdown;charset=utf-8")}><FileDown size={16}/>{t("Download Markdown")}</button>
    <button type="button" className="control" disabled={!brief} onClick={() => brief && save(JSON.stringify(brief, null, 2), handoverFileName(brief.generated_at, "json"), "application/json")}><FileDown size={16}/>{t("Download JSON")}</button>
    <button type="button" className="control" disabled={!brief} onClick={() => window.print()}><Printer size={16}/>{t("Print")}</button>
  </div>;

  return <AppShell title="Shift Handover" description="A cited, read-only brief of what changed for your agency since the last shift. Exercise only; it cannot act." actions={signedOut ? undefined : actions}>
    {signedOut && session && <SignInRequired session={session}/>}
    {!signedOut && <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
      <SegmentedControl label={t("Handover window")} value={hours} onChange={value => setHours(value)}
        options={WINDOWS.map(value => ({ value, label: `${value} h` }))}/>
      <StatusPill tone="sample">{t("Synthetic exercise data")}</StatusPill>
      <StatusPill tone="info">{t("Read-only: nothing is sent or saved")}</StatusPill>
    </div>}
    {loading && !brief && <SkeletonRows rows={6} label={t("Loading handover brief")}/>}
    {error && <ErrorState message={t(error)} onRetry={() => load()}/>}
    {brief && <div className="space-y-4">
      <p className="text-sm text-muted">{t("Every line cites record ids. Synthetic SLA targets are rehearsal targets, not contractual SLAs. This is not a forecast, warning, approval or dispatch.")}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <StatusPill tone={brief.paused ? "warning" : "neutral"}>{t("Kill switch")}: {brief.paused === null ? t("unknown") : brief.paused ? t("paused") : t("not paused")}</StatusPill>
        {Object.entries(brief.counts).map(([key, value]) => <StatusPill key={key} tone={key === "submitted" && value > 0 ? "warning" : "neutral"}>{key}: {value}</StatusPill>)}
      </div>
      {SECTIONS.map(section => {
        const status = brief.sections[section.key];
        const lines = brief.lines.filter(line => line.section === section.key);
        return <Panel key={section.key} title={t(section.title)} icon={ClipboardList}>
          {status?.status !== "ok"
            ? <p className="text-sm text-muted">{status?.status === "disabled" ? t("Not enabled in this deployment.") : t("Section unavailable; other sections are unaffected.")} {status?.code && <code className="text-xs">{status.code}</code>}</p>
            : lines.length === 0 ? <EmptyState title={t("Nothing in this window")}/>
            : <ul className="space-y-2 text-sm">{lines.map((line, index) => <li key={`${line.code}-${index}`} className="rounded-lg border border-stroke p-2">
                <span>{line.text}</span>
                <span className="mt-1 flex flex-wrap gap-1">{line.refs.map(ref => <code key={ref} className="rounded bg-surface-2 px-1 text-[11px] break-all">{ref}</code>)}</span>
              </li>)}</ul>}
        </Panel>;
      })}
    </div>}
  </AppShell>;
}
