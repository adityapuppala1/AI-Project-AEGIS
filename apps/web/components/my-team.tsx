"use client";
// My Team: what the signed response team has been asked to do, and its answers. Phone first (390px, 44px targets).
// Exercise only: the team is an invented exercise team and nobody is called, texted or radioed. The team is read
// from the verified session; the browser never chooses it. See docs/RESPONSE_LOOP.md.
import { useState } from "react";
import { CheckCircle2, ClipboardList, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { SignInRequired } from "./sign-in-required";
import { AttentionFlag, LifecycleStepper, ReportForm, ReportHistory, ReportLine, StateBadge } from "./response-parts";
import { Button, EmptyState, ErrorState, HazardGlyph, Panel, PermissionState, RecordRef, SkeletonRows, useToast } from "./ui";
import { RESPONSE_ACTION_LABELS, codeLabel, reportKindLabel } from "../lib/labels";
import { isResponseTeamId, RESPONSE_TEAMS } from "../lib/response-teams";
import { alertView, groupForTeam, istClock, istText, lastReport, teamKinds, type ResponseRequest } from "../lib/response-ui";
import { pageRoles } from "../lib/roles";
import { useOperatorSession } from "../lib/use-operator-session";
import { useResponseRequests } from "../lib/use-response-requests";

/** The honesty text shown on this page and in the desk's inbox section. */
export function RehearsalNote({ className = "" }: Readonly<{ className?: string }>) {
  const t = useT();
  return <div role="note" className={`flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 ${className}`}>
    <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
    <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
      <strong>{t("This is a rehearsal.")}</strong>{" "}
      {t("A request alerts only people signed in to AEGIS. Nobody is called, texted or radioed. The teams are invented exercise teams, and travel times are planning estimates.")}
    </p>
  </div>;
}

function RequestCard({ request, onSaved, onStale }: Readonly<{ request: ResponseRequest; onSaved: (request: ResponseRequest, kind: string) => void; onStale: () => void }>) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const kinds = teamKinds(request.state);
  const [main, ...others] = kinds;
  const decline = others.includes("declined"), extras = others.filter(kind => kind !== "declined");
  const finished = kinds.length === 0;
  const last = lastReport(request);
  const headingId = `request-${request.id}`;
  // If the request moved on (a desk stood it down, say) the form for the old step is dropped.
  const formKind = open && kinds.includes(open) ? open : null;
  return <Panel as="article" bodyClassName="space-y-3 p-4" aria-labelledby={headingId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <HazardGlyph value={request.incident.hazard_label} label={request.incident.hazard_label ? t(request.incident.hazard_label) : undefined} />
      <span className="flex flex-wrap items-center gap-2"><RecordRef id={request.incident.id} kind="incident" /><StateBadge state={request.state} /></span>
    </div>
    <div>
      <h3 id={headingId} className="text-base font-semibold leading-snug">{request.task.summary || t("Team request")}</h3>
      <p className="mt-0.5 text-xs text-muted">{t("Requested by")} {t(codeLabel(request.task.department))} {t("desk")} · <span className="tnum">{istText(request.requested_at)}</span></p>
    </div>
    {request.needs_attention && <AttentionFlag viewer="team" />}
    <LifecycleStepper state={request.state} />
    {!formKind && !finished && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {main && <Button variant="primary" className="min-h-12 w-full text-base sm:w-auto" onClick={() => setOpen(main)}>{t(RESPONSE_ACTION_LABELS[main])}</Button>}
      {decline && <Button variant="danger" className="min-h-11 w-full sm:w-auto" onClick={() => setOpen("declined")}>{t(RESPONSE_ACTION_LABELS.declined)}</Button>}
      {extras.map(kind => <Button key={kind} className="min-h-11 w-full sm:w-auto" onClick={() => setOpen(kind)}>{t(RESPONSE_ACTION_LABELS[kind])}</Button>)}
    </div>}
    {formKind && <ReportForm key={formKind} request={request} kind={formKind} relay={false} large
      onSaved={(next, kind) => { setOpen(null); onSaved(next, kind); }} onCancel={() => setOpen(null)} onStale={onStale} />}
    {finished && last && <div className="rounded-md bg-elevated/50 p-3"><p className="mb-1 text-xs font-semibold text-muted">{t("Last report")}</p><ReportLine report={last} kind="summary" /></div>}
    <details open={!finished} className="text-sm">
      <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-muted">{t("Report history")} ({request.reports.length})</summary>
      <div className="pt-2"><ReportHistory reports={request.reports} /></div>
    </details>
  </Panel>;
}

function MyTeamBody({ team, state }: Readonly<{ team: (typeof RESPONSE_TEAMS)[number]; state: ReturnType<typeof useResponseRequests> }>) {
  const t = useT();
  const { notify } = useToast();
  const { requests, status, message, refresh, stale } = state;
  const groups = groupForTeam(requests);
  const saved = (_request: ResponseRequest, kind: string) => { notify(`${t("Recorded")}: ${t(reportKindLabel(kind))}`, "success"); void refresh(); };
  const card = (request: ResponseRequest) => <li key={request.id}><RequestCard request={request} onSaved={saved} onStale={() => void refresh()} /></li>;
  return <>
    <RehearsalNote className="mb-4" />
    <section aria-label={t("Your team")} className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Users size={18} aria-hidden="true" className="text-muted" />
      <h2 className="text-base font-semibold">{team.label}</h2>
      <span className="text-sm text-muted" title={team.kind}>{t(codeLabel(team.kind))} {t("team")}</span>
    </section>
    {status === "refused" && <PermissionState needs={pageRoles("/my-team") ?? []} roles={["response_team"]}
      what={t("The server did not accept your sign-in for team requests. Sign in again, or ask your administrator to check your team.")} />}
    {stale && <ErrorState className="mb-4" message={t(message)} onRetry={() => void refresh()} />}
    {status === "loading" && <SkeletonRows rows={2} label={t("Loading your team's requests…")} />}
    {status === "error" && <ErrorState message={t(message)} onRetry={() => void refresh()} />}
    {status === "ready" && requests.length === 0 && <Panel as="div" bodyClassName="p-0"><EmptyState icon={ClipboardList} title={t("No requests for your team")}
      body={t("A request appears here, and as a number on the menu, when a department desk asks your team for help on an approved task.")} /></Panel>}
    {status === "ready" && requests.length > 0 && <div className="space-y-5">
      <section aria-labelledby="needs-answer">
        <h2 id="needs-answer" className="t-title mb-2">{t("Needs your answer")} <span className="tnum text-muted">({groups.answer.length})</span></h2>
        {groups.answer.length === 0 ? <p className="helper">{t("Nothing is waiting for an answer.")}</p> : <ul className="space-y-3">{groups.answer.map(card)}</ul>}
      </section>
      <section aria-labelledby="in-progress">
        <h2 id="in-progress" className="t-title mb-2">{t("In progress")} <span className="tnum text-muted">({groups.active.length})</span></h2>
        {groups.active.length === 0 ? <p className="helper">{t("No accepted requests are in progress.")}</p> : <ul className="space-y-3">{groups.active.map(card)}</ul>}
      </section>
      <Panel title={`${t("Finished")} (${groups.finished.length})`} icon={CheckCircle2} collapsible defaultOpen={false}>
        {groups.finished.length === 0 ? <p className="helper">{t("Nothing has finished yet.")}</p> : <ul className="space-y-3">{groups.finished.map(card)}</ul>}
      </Panel>
    </div>}
  </>;
}

export function MyTeam() {
  const t = useT();
  const session = useOperatorSession();
  const signedOut = session !== null && !session.authenticated;
  const view = session?.authenticated ? alertView(session.roles) : null;
  const team = RESPONSE_TEAMS.find(item => item.id === session?.teamId);
  const usable = view === "team" && isResponseTeamId(session?.teamId) && Boolean(team);
  const state = useResponseRequests({ enabled: usable });
  const refused = session?.authenticated === true && !usable;
  return <AppShell title="My Team" description="Requests for your team from department desks, and your answers. Rehearsal only."
    actions={usable ? <>
      {state.updatedAt && <span role="status" className="tnum text-xs text-muted">{t("Updated")} {istClock(state.updatedAt)} IST</span>}
      <Button icon={RefreshCw} loading={state.refreshing} onClick={() => void state.refresh()}>{t("Refresh")}</Button>
    </> : undefined}>
    {signedOut && session && <SignInRequired session={session} />}
    {session === null && <SkeletonRows rows={2} label={t("Checking your sign-in…")} />}
    {refused && <PermissionState needs={pageRoles("/my-team") ?? []} roles={session?.roles}
      what={view === "team" ? t("Your sign-in has no valid team, so there are no requests to show. Ask your administrator to set your team.") : t("This page shows the requests for one response team, so it opens only for an account that belongs to a team.")}
      where={{ href: "/department-tasks", label: t("Open the Department Inbox") }} />}
    {usable && team && <MyTeamBody team={team} state={state} />}
  </AppShell>;
}
