"use client";
import { useEffect, useState } from "react";
import { ClipboardList, CheckCircle2, Clock, Inbox, RefreshCw } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { useT } from "../../components/language-provider";
import { SignInRequired } from "../../components/sign-in-required";
import { useOperatorSession } from "../../lib/use-operator-session";
import { codeLabel, shortId } from "../../lib/labels";
import { pageRoles } from "../../lib/roles";
import { TeamResponseDesk, openRequests } from "../../components/team-response-desk";
import { alertView, istText } from "../../lib/response-ui";
import { useResponseRequests } from "../../lib/use-response-requests";
import { Button, EmptyState, ErrorState, Panel, PermissionState, RecordRef, SkeletonRows, StatStrip, StatTile, StatusPill, type Tone } from "../../components/ui";
const STATE_TONE: Record<string, Tone> = { prepared: "info", acknowledged: "warning", closed: "success" };
interface TaskRow { proposal_id: string; incident_id: string; task: {
  id: string; assignment_version?: number; summary: string; state: string; due_at?: string; sla_status?: string;
  events: { kind: string; occurred_at: string; actor_subject?: string }[];
} }
export default function DepartmentTasks() {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [refused, setRefused] = useState(false);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [department, setDepartment] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});
  const session = useOperatorSession();
  const signedOut = session !== null && !session.authenticated;
  // Team requests for this desk (the API returns only its own department's). Refreshed every 30 s while the tab is visible.
  const responses = useResponseRequests({ enabled: session?.authenticated === true && alertView(session.roles) === "desk" && !refused });
  async function refresh() {
    setBusy(true);
    setFailed(false);
    setRefused(false);
    setRows([]);
    setDepartment("");
    setNotes({});
    setMessage("");
    try {
      const response = await fetch("/api/department-tasks", { cache: "no-store" });
      const data = await response.json();
      // A role refusal is explained once, without a Retry that could never succeed.
      if (response.status === 403) { setRefused(true); return; }
      if (!response.ok) throw new Error(data.error || "Department inbox unavailable");
      setRows(data.tasks); setDepartment(data.department_id);
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Department inbox unavailable"); }
    finally { setBusy(false); }
  }
  // The inbox is operator-only: wait for the session instead of requesting it signed out (a logged 401).
  useEffect(() => {
    if (!session) return;
    if (!session.authenticated) { setBusy(false); return; }
    void refresh();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  async function advance(row: TaskRow) {
    setBusy(true);
    try {
      const response = await fetch(`/api/department-tasks/${row.proposal_id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: row.task.state === "prepared" ? "acknowledge_task" : "close_task", rationale: notes[`${row.proposal_id}:${row.task.id}`], task_id: row.task.id, expected_assignment_version: row.task.assignment_version ?? 0 }),
      });
      if (response.status === 409) {
        // The server refused this step (for example closing while team requests are open). Say why, in place, and refresh the requests.
        const body: { detail?: unknown } | null = await response.json().catch(() => null);
        setNotices(previous => ({ ...previous, [`${row.proposal_id}:${row.task.id}`]: typeof body?.detail === "string" ? body.detail : "The task changed or cannot move on yet. Refresh before retrying." }));
        void responses.refresh();
        return;
      }
      if (!response.ok) throw new Error("Action could not be confirmed. Refresh before retrying; it may have completed.");
      setNotices({});
      await refresh();
      void responses.refresh();
    } catch (error) { setRows([]); setNotes({}); setFailed(true); setMessage(error instanceof Error ? error.message : "Task update unavailable"); }
    finally { setBusy(false); }
  }
  const usable = !signedOut && !refused;
  return <AppShell title="Department Inbox" description="Your department’s approved synthetic rehearsal tasks. Acknowledgements never contact real responders."
    actions={usable ? <Button icon={RefreshCw} loading={busy} onClick={() => void refresh()}>{t("Refresh")}</Button> : undefined}>
    {signedOut && session && <SignInRequired session={session}/>}
    {refused && <PermissionState needs={pageRoles("/department-tasks") ?? []} roles={session?.roles}
      what={t("The inbox shows the tasks of one department, so it opens only for an account that belongs to a department.")}
      where={{ href: "/agency-sync", label: t("See all department timelines in AgencySync") }} />}
    {usable && department && <p className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">{t("Your department")}</span><strong className="font-semibold" title={department}>{t(codeLabel(department))}</strong></p>}
    {rows.length > 0 && <StatStrip label={t("Department task summary")}>
      <StatTile label={t("Tasks")} value={rows.length} icon={ClipboardList} tone="info"/>
      <StatTile label={t("Prepared")} value={rows.filter(r => r.task.state === "prepared").length} icon={Inbox} tone="info"/>
      <StatTile label={t("Acknowledged")} value={rows.filter(r => r.task.state === "acknowledged").length} icon={Clock} tone="warning"/>
      <StatTile label={t("Closed")} value={rows.filter(r => r.task.state === "closed").length} icon={CheckCircle2} tone="success"/>
    </StatStrip>}
    {usable && busy && rows.length === 0 && !failed && <SkeletonRows rows={3} label={t("Loading verified department inbox…")}/>}
    {failed && <ErrorState message={t(message)} onRetry={() => void refresh()}/>}
    {usable && !busy && !failed && rows.length === 0 && <EmptyState icon={Inbox} title={t("No approved tasks for your department")} body={t("An empty inbox does not mean no work exists. Tasks appear only after an independent checker approves a proposal.")}/>}
    <div className="grid gap-4 xl:grid-cols-2">{rows.map(row => {
      const key = `${row.proposal_id}:${row.task.id}`, noteId = `note-${row.proposal_id}-${row.task.id}`;
      const taskRequests = responses.requests.filter(item => item.proposal_id === row.proposal_id && item.task.id === row.task.id);
      const open = openRequests(taskRequests).length;
      return <Panel key={key} level={2} title={row.task.summary} actions={<span title={row.task.state}><StatusPill tone={STATE_TONE[row.task.state] ?? "neutral"}>{t(codeLabel(row.task.state))}</StatusPill></span>}>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
          <dt className="text-xs font-semibold text-muted">{t("Proposal")}</dt><dd><RecordRef id={row.proposal_id} kind="proposal" /></dd>
          <dt className="text-xs font-semibold text-muted">{t("Incident")}</dt><dd><RecordRef id={row.incident_id} kind="incident" /></dd>
          {row.task.due_at && <><dt className="text-xs font-semibold text-muted">{t("Rehearsal target")}</dt>
            <dd className="tnum" title={row.task.sla_status}>{istText(row.task.due_at)}{row.task.sla_status ? " · " + t(codeLabel(row.task.sla_status)) : ""}</dd></>}
        </dl>
        {row.task.events.length > 0 && <ol className="mt-3 space-y-1 border-t border-stroke/60 pt-3 text-xs text-muted">{row.task.events.map((event, index) => <li key={index} className="tnum" title={event.kind}>
          {t(codeLabel(event.kind))} · {istText(event.occurred_at)}{event.actor_subject ? <span title={event.actor_subject}> · {shortId(event.actor_subject)}</span> : null}</li>)}</ol>}
        {["prepared", "acknowledged"].includes(row.task.state) && <form className="mt-4" onSubmit={event => { event.preventDefault(); void advance(row); }}>
          <label className="field-label" htmlFor={noteId}>{t("Rehearsal rationale")}</label>
          <textarea id={noteId} className="field" rows={3} minLength={10} maxLength={2000} required disabled={busy} aria-describedby={noteId + "-help"}
            value={notes[key] || ""} onChange={event => setNotes(previous => ({ ...previous, [key]: event.target.value }))}/>
          <p id={noteId + "-help"} className="helper mt-1">{t("At least 10 characters. Recorded in the audit trail; nobody is contacted.")}</p>
          <Button type="submit" variant="primary" className="mt-3" disabled={busy || (notes[key] || "").trim().length < 10 || (row.task.state === "acknowledged" && open > 0)} aria-describedby={row.task.state === "acknowledged" && (open > 0 || notices[key]) ? noteId + "-close" : undefined}>{row.task.state === "prepared" ? t("Acknowledge rehearsal task") : t("Close rehearsal task")}</Button>
          {row.task.state === "acknowledged" && (open > 0 || notices[key]) && <p id={noteId + "-close"} role={notices[key] ? "alert" : undefined} className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            {notices[key] ? t(notices[key]) : t("Closing is blocked while this task has open team requests. Stand down or finish the task's team requests before closing it.")}</p>}
        </form>}
        {row.task.state === "acknowledged" && <TeamResponseDesk proposalId={row.proposal_id} taskId={row.task.id} assignmentVersion={row.task.assignment_version ?? 0}
          requests={taskRequests} status={responses.status} message={responses.message} onChanged={() => void responses.refresh()} />}
      </Panel>;
    })}</div>
  </AppShell>;
}
