"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, CalendarClock, ClipboardCheck, FileDown, FileJson, OctagonPause, Printer, Radar, RefreshCw, ScanSearch, TriangleAlert, Workflow, type LucideIcon } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { Button, CitedLine, ErrorState, Panel, PermissionState, QuietRow, SegmentedControl, SkeletonRows, StatusPill, Toolbar, TwoKey, keysForStatus } from "./ui";
import { handoverFileName, handoverMarkdown, type Handover } from "../lib/operator-assist";
import { codeLabel } from "../lib/labels";
import { pageRoles, refusalHome } from "../lib/roles";
import { useOperatorSession } from "../lib/use-operator-session";
import { SignInRequired } from "./sign-in-required";

const WINDOWS = ["4", "8", "12", "24", "72"] as const;
type Window = (typeof WINDOWS)[number];
const SECTIONS: { key: string; title: string; icon: LucideIcon }[] = [
  { key: "watch", title: "Open watches and candidates", icon: Radar }, { key: "runs", title: "Proactive runs", icon: Workflow },
  { key: "evidence_changes", title: "Evidence changes (sentinel)", icon: ScanSearch }, { key: "approvals", title: "Pending approvals", icon: ClipboardCheck },
  { key: "sla", title: "Overdue synthetic SLA tasks", icon: AlarmClock }, { key: "failures", title: "Connector and scheduler failures", icon: TriangleAlert },
  { key: "scheduler", title: "Scheduler ticks", icon: CalendarClock },
];
const COUNT_ORDER = ["draft", "submitted", "approved", "rejected"];

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
  const [refused, setRefused] = useState(false);
  const [loading, setLoading] = useState(true);
  const session = useOperatorSession();
  const signedOut = session !== null && !session.authenticated;

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError(null); setRefused(false);
    fetch(`/api/handover?hours=${hours}`, { cache: "no-store", signal })
      .then(async response => {
        const data = await response.json().catch(() => null) as (Handover & { error?: string }) | null;
        if (response.status === 403) { setBrief(null); setRefused(true); return; }
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

  const incidents = useMemo(() => new Set((brief?.pending ?? []).map(item => item.incident_id).filter((id): id is string => id !== null)), [brief]);
  const kindOf = (id: string) => incidents.has(id) ? "incident" as const : "record" as const;
  const filled = brief ? SECTIONS.map(section => ({ ...section, lines: brief.lines.filter(line => line.section === section.key), status: brief.sections[section.key] })) : [];
  const withLines = filled.filter(section => section.status?.status === "ok" && section.lines.length > 0);
  const quiet = filled.filter(section => !(section.status?.status === "ok" && section.lines.length > 0));

  const actions = <>
    <Button icon={RefreshCw} onClick={() => load()} disabled={signedOut} loading={loading && brief !== null}>{t("Refresh")}</Button>
    <Button icon={FileDown} disabled={!brief} onClick={() => brief && save(handoverMarkdown(brief), handoverFileName(brief.generated_at, "md"), "text/markdown;charset=utf-8")}>{t("Download Markdown")}</Button>
    <Button icon={FileJson} disabled={!brief} onClick={() => brief && save(JSON.stringify(brief, null, 2), handoverFileName(brief.generated_at, "json"), "application/json")}>{t("Download JSON")}</Button>
    <Button variant="primary" icon={Printer} disabled={!brief} onClick={() => window.print()}>{t("Print brief")}</Button>
  </>;

  return <AppShell title="Shift Handover" description="A cited, read-only brief of what changed for your agency since the last shift. Exercise only; it cannot act." actions={signedOut || refused ? undefined : actions}>
    {signedOut && session && <SignInRequired session={session}/>}
    {refused && <PermissionState needs={pageRoles("/handover") ?? []} roles={session?.roles} what={t("The handover brief is for the incident desk and administrators.")} where={refusalHome(session?.roles, { href: "/department-tasks", label: t("Open the Department Inbox") }, t("Open My Team"))} />}
    {!signedOut && !refused && <Toolbar label={t("Handover window")}>
      <SegmentedControl tour="handover-window" label={t("Handover window")} value={hours} onChange={value => setHours(value)}
        options={WINDOWS.map(value => ({ value, label: `${value} h` }))}/>
      <StatusPill tone="info">{t("Read-only: nothing is sent or saved")}</StatusPill>
    </Toolbar>}
    {loading && !brief && !refused && <SkeletonRows rows={6} label={t("Loading handover brief")}/>}
    {error && <ErrorState message={t(error)} onRetry={() => load()}/>}
    {brief && <div className="space-y-4">
      <p className="tnum text-sm"><span className="text-muted">{t("Window")}: </span>{brief.hours} h <span className="text-muted">· {t("Generated")} </span>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(brief.generated_at || Date.now()))} IST</p>
      <p className="helper max-w-4xl">{t("Every line cites record ids. Synthetic SLA targets are rehearsal targets, not contractual SLAs. This is not a forecast, warning, approval or dispatch.")}</p>
      <Panel data-tour="handover-state" title={t("State at handover")} icon={OctagonPause} bodyClassName="p-0">
        <dl className="grid divide-y divide-stroke sm:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3">
            <dt className="text-xs font-semibold text-muted">{t("Automation")}</dt>
            <dd className="mt-1.5">{brief.paused === null
              ? <StatusPill tone="warning">{t("Scheduler state unavailable")}</StatusPill>
              : brief.paused ? <StatusPill tone="warning" icon={OctagonPause}>{t("Paused by the kill switch")}</StatusPill>
              : <StatusPill tone="neutral">{t("Not paused")}</StatusPill>}</dd>
          </div>
          {COUNT_ORDER.filter(key => key in brief.counts).map(key => <div key={key} className="px-4 py-3" title={key}>
            <dt className="text-xs font-semibold text-muted">{t(codeLabel(key))}</dt>
            <dd className="mt-1 flex items-center justify-between gap-2"><span className="stat-value text-xl font-semibold">{brief.counts[key]}</span><TwoKey {...keysForStatus(key)} /></dd>
          </div>)}
        </dl>
      </Panel>
      {withLines.map(section => <Panel key={section.key} title={t(section.title)} icon={section.icon} bodyClassName="px-4 py-1"
        actions={<span className="tnum text-xs text-muted">{section.lines.length}</span>}>
        <ul>{section.lines.map((line, index) => <CitedLine key={`${line.code}-${index}`} refs={line.refs} kindOf={kindOf}>{line.text}</CitedLine>)}</ul>
      </Panel>)}
      {quiet.length > 0 && <Panel title={t("Nothing to report")} description={t("Sections with no lines in this window, or not available.")} bodyClassName="divide-y divide-stroke/60 py-1">
        {quiet.map(section => {
          const state = section.status?.status;
          const reason = section.status?.code ? ` ${t(codeLabel(section.status.code))}.` : "";
          return <div key={section.key} title={section.status?.code ?? undefined}>
            <QuietRow icon={section.icon} title={t(section.title)} tone={state === "unavailable" || state === undefined ? "warning" : "muted"}
              note={state === "ok" ? t("Nothing in this window") : state === "disabled" ? t("Not enabled in this deployment.") + reason : t("Section unavailable; other sections are unaffected.") + reason} />
          </div>;
        })}
      </Panel>}
    </div>}
  </AppShell>;
}
