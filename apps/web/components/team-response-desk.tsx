"use client";
// The "Team response" section of an acknowledged task in the Department Inbox: the task's team requests with the
// desk's actions (record for the team, stand down, mark handled), and "Request a team" with the facts behind the
// suggestion. Exercise only: nobody is called, texted or radioed; a request is a line the team sees in IndTrana.
// Scope (agency, department) comes from the verified token on the server. See docs/RESPONSE_LOOP.md.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Clock3, MapPin, Users, Wrench } from "lucide-react";
import { useT } from "./language-provider";
import { RehearsalNote } from "./my-team";
import { AttentionFlag, ReportForm, ReportHistory, ReportLine, StateBadge } from "./response-parts";
import { Button, ErrorState, SkeletonRows, StatusPill, useToast } from "./ui";
import { RELAY_ACTION_LABELS, codeLabel, reportKindLabel } from "../lib/labels";
import { createRequest, loadSuggestions } from "../lib/response-client";
import { ACTIVE_STATES, NOTE_MAX, NOTE_MIN, deskKinds, lastReport, noteProblem, whyNotRequestable, type BlockReason, type ResponseRequest, type TeamSuggestions } from "../lib/response-ui";
import type { RequestsStatus } from "../lib/use-response-requests";

export const openRequests = (requests: readonly ResponseRequest[]) => requests.filter(item => ACTIVE_STATES.includes(item.state));

function DeskRequest({ request, onSaved, onStale }: Readonly<{ request: ResponseRequest; onSaved: (request: ResponseRequest, kind: string) => void; onStale: () => void }>) {
  const t = useT();
  const [mode, setMode] = useState<"pick" | string | null>(null);
  const kinds = deskKinds(request.state, request.needs_attention);
  const relayKinds = kinds.filter(kind => kind !== "stood_down" && kind !== "desk_handled");
  const last = lastReport(request);
  const formKind = mode && mode !== "pick" && kinds.includes(mode) ? mode : null;
  return <li className="space-y-2 rounded-md border border-stroke p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="min-w-0 text-sm font-semibold">{request.team.label} <span className="font-normal text-muted" title={request.team.kind}>· {t(codeLabel(request.team.kind))}</span></p>
      <span className="flex flex-wrap items-center gap-2"><StateBadge state={request.state} />{request.needs_attention && <AttentionFlag viewer="desk" />}</span>
    </div>
    {last && <ReportLine report={last} kind="summary" />}
    {!formKind && mode !== "pick" && kinds.length > 0 && <div className="flex flex-wrap gap-2">
      {relayKinds.length > 0 && <Button size="sm" onClick={() => setMode("pick")}>{t("Record for the team")}</Button>}
      {kinds.includes("stood_down") && <Button size="sm" variant="danger" onClick={() => setMode("stood_down")}>{t("Stand down")}</Button>}
      {kinds.includes("desk_handled") && <Button size="sm" variant="primary" onClick={() => setMode("desk_handled")}>{t("Mark handled")}</Button>}
    </div>}
    {mode === "pick" && <div role="group" aria-label={t("Record which answer for the team?")} className="flex flex-wrap items-center gap-2">
      {relayKinds.map(kind => <Button key={kind} size="sm" onClick={() => setMode(kind)}>{t(RELAY_ACTION_LABELS[kind])}</Button>)}
      <Button size="sm" variant="quiet" onClick={() => setMode(null)}>{t("Cancel")}</Button>
    </div>}
    {formKind && <ReportForm key={formKind} request={request} kind={formKind} relay={formKind !== "stood_down" && formKind !== "desk_handled"}
      onSaved={(next, kind) => { setMode(null); onSaved(next, kind); }} onCancel={() => setMode(null)} onStale={onStale} />}
    <details className="text-sm">
      <summary className="min-h-8 cursor-pointer py-1 text-xs font-semibold text-muted">{t("Report history")} ({request.reports.length})</summary>
      <div className="pt-2"><ReportHistory reports={request.reports} /></div>
    </details>
  </li>;
}

function Facts({ team, basis, reason }: Readonly<{ team: TeamSuggestions["teams"][number]; basis: TeamSuggestions["capability_basis"]; reason: BlockReason | null }>) {
  const t = useT();
  const blocked: Record<BlockReason, string> = {
    taken: t("This team already has an open request for this task."), full: t("No free capacity."), hours: t("Outside its available hours."),
    capability: t("No matching capability for this hazard."),
  };
  return <>
    <ul className="mt-1 grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
      <li className="flex items-start gap-1.5"><Wrench size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
        {basis === "not_assessed" ? t("No match was computed for this hazard.")
          : team.matched_capabilities.length > 0 ? <span>{t("Matches")}: {team.matched_capabilities.map(item => t(codeLabel(item))).join(", ")}</span> : t("No matching capability.")}</li>
      <li className="flex items-start gap-1.5"><Users size={13} aria-hidden="true" className="mt-0.5 shrink-0" />{t("Free capacity")}: <span className="tnum">{team.free_capacity} {t("of")} {team.capacity}</span></li>
      <li className="flex items-start gap-1.5" title={team.available_utc ? `${t("Hours")} (UTC): ${team.available_utc}` : undefined}><Clock3 size={13} aria-hidden="true" className="mt-0.5 shrink-0" />{team.available_now ? t("Available now") : t("Not available now")}</li>
      <li className="flex items-start gap-1.5"><MapPin size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
        {team.estimated_travel_minutes === null ? t("No travel estimate") : <span><span className="tnum">{team.estimated_travel_minutes}</span> {t("min travel")} ({t("planning estimate")})</span>}</li>
    </ul>
    {reason && <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">{blocked[reason]}</p>}
  </>;
}

function RequestTeam({ proposalId, taskId, assignmentVersion, taken, onDone, onCancel }: Readonly<{
  proposalId: string; taskId: string; assignmentVersion: number; taken: ReadonlySet<string>; onDone: (request: ResponseRequest) => void; onCancel: () => void;
}>) {
  const t = useT();
  const id = useId();
  const [data, setData] = useState<TeamSuggestions | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [team, setTeam] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    setLoadError("");
    void loadSuggestions(proposalId, taskId, abort.signal).then(result => {
      if (result.status === -1) return;
      if (result.ok && result.data) setData(result.data); else setLoadError(result.message);
    });
    return () => abort.abort();
  }, [proposalId, taskId, reload]);

  const problem = noteProblem(note), length = note.trim().length;
  const chosen = data?.teams.find(item => item.id === team);
  const chosenBlocked = chosen && data ? whyNotRequestable(chosen, data.capability_basis, taken.has(chosen.id)) : null;
  const noteError = problem === "short" ? t("Write at least 10 characters.") : problem === "long" ? t("Keep the note to 1000 characters or fewer.") : problem === "characters" ? t("Use plain text without control or line-separator characters.") : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (sending.current || !chosen || chosenBlocked || problem) return; // never double-submit
    sending.current = true; setBusy(true); setError("");
    const result = await createRequest({ proposal_id: proposalId, task_id: taskId, team_id: chosen.id, expected_assignment_version: assignmentVersion, note: note.trim() });
    sending.current = false; setBusy(false);
    if (result.ok && result.data) { onDone(result.data); return; }
    setError(result.message);
    if (result.status === 409) setReload(value => value + 1); // capacity or hours may have changed
  }

  return <form onSubmit={submit} noValidate aria-label={t("Request a team")} className="space-y-3 rounded-md border border-stroke bg-elevated/40 p-3">
    <p className="text-sm font-semibold">{t("Request a team")}</p>
    {!data && !loadError && <SkeletonRows rows={2} label={t("Loading teams…")} />}
    {loadError && <ErrorState message={t(loadError)} onRetry={() => setReload(value => value + 1)} />}
    {data && <>
      <p className="text-xs leading-5 text-muted">
        {data.capability_basis === "not_assessed"
          ? t("No capability match was computed for this hazard, so no team is suggested. Choose from the facts below.")
          : t("Teams are listed in suggestion order. The suggestion is only a starting point; you decide.")}
        {data.hazard_label ? ` ${t("Hazard")}: ${t(data.hazard_label)}.` : ""} {data.travel_label ? t(data.travel_label) : t("Travel times are planning estimates.")}
      </p>
      {data.teams.length === 0 && <p className="text-sm text-muted">{t("No teams are listed.")}</p>}
      <fieldset className="space-y-2">
        <legend className="field-label">{t("Choose a team")}</legend>
        {data.teams.map(item => {
          const reason = whyNotRequestable(item, data.capability_basis, taken.has(item.id));
          const inputId = `${id}-${item.id}`;
          return <label key={item.id} htmlFor={inputId} data-disabled={reason ? true : undefined}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 ${team === item.id ? "border-accent bg-accent/5" : "border-stroke bg-surface"} ${reason ? "cursor-not-allowed opacity-70" : ""}`}>
            <input id={inputId} type="radio" name={`${id}-team`} value={item.id} checked={team === item.id} disabled={Boolean(reason) || busy} className="mt-1 h-4 w-4 shrink-0"
              onChange={() => setTeam(item.id)} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">{item.label}
                <span className="font-normal text-muted" title={item.kind}>· {t(codeLabel(item.kind))}</span>
                {item.suggested && <StatusPill tone="success">{t("Suggested")}</StatusPill>}</span>
              <Facts team={item} basis={data.capability_basis} reason={reason} />
            </span>
          </label>;
        })}
        {touched && !chosen && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{t("Choose a team.")}</p>}
      </fieldset>
      <div>
        <label className="field-label" htmlFor={`${id}-note`}>{t("Note for the team")}</label>
        <textarea id={`${id}-note`} className="field" rows={3} maxLength={NOTE_MAX + 200} value={note} disabled={busy} onChange={event => setNote(event.target.value)}
          aria-invalid={touched && problem ? true : undefined} aria-describedby={`${id}-note-help${touched && problem ? ` ${id}-note-error` : ""}`} />
        <p id={`${id}-note-help`} className="helper mt-1 flex flex-wrap justify-between gap-x-3">
          <span>{t("10 to 1000 characters. The team sees it, and it is recorded in the audit trail.")}</span>
          <span className="tnum">{length}/{NOTE_MAX}{length < NOTE_MIN ? ` · ${NOTE_MIN - length} ${t("more needed")}` : ""}</span>
        </p>
        {touched && problem && <p id={`${id}-note-error`} className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300">{noteError}</p>}
      </div>
    </>}
    {error && <p role="alert" className="text-sm font-semibold text-rose-800 dark:text-rose-200">{t(error)}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="primary" loading={busy} disabled={!data}>{t("Request this team")}</Button>
      <Button variant="quiet" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button>
    </div>
  </form>;
}

export function TeamResponseDesk({ proposalId, taskId, assignmentVersion, requests, status, message, onChanged }: Readonly<{
  proposalId: string; taskId: string; assignmentVersion: number; requests: readonly ResponseRequest[]; status: RequestsStatus; message: string; onChanged: () => void;
}>) {
  const t = useT();
  const { notify } = useToast();
  const id = useId();
  const [requesting, setRequesting] = useState(false);
  const taken = new Set(openRequests(requests).map(item => item.team.id));
  const saved = (_next: ResponseRequest, kind: string) => { notify(`${t("Recorded")}: ${t(reportKindLabel(kind))}`, "success"); onChanged(); };
  return <section aria-labelledby={id} className="mt-4 space-y-3 border-t border-stroke/60 pt-4">
    <h3 id={id} className="t-title inline-flex items-center gap-2"><Users size={16} aria-hidden="true" className="text-muted" />{t("Team response")}</h3>
    <RehearsalNote />
    {status === "loading" && <SkeletonRows rows={1} label={t("Loading team requests…")} />}
    {status === "error" && <ErrorState message={t(message)} onRetry={onChanged} />}
    {status === "refused" && <p className="helper">{t("Team requests are not available to this sign-in.")}</p>}
    {status === "ready" && message && <ErrorState message={t(message)} onRetry={onChanged} />}
    {status === "ready" && requests.length === 0 && <p className="helper">{t("No team has been requested for this task yet.")}</p>}
    {requests.length > 0 && <ul className="space-y-2">{requests.map(item => <DeskRequest key={item.id} request={item} onSaved={saved} onStale={onChanged} />)}</ul>}
    {!requesting
      ? <Button icon={Users} disabled={status === "refused"} onClick={() => setRequesting(true)}>{t("Request a team")}</Button>
      : <RequestTeam proposalId={proposalId} taskId={taskId} assignmentVersion={assignmentVersion} taken={taken} onCancel={() => setRequesting(false)}
          onDone={() => { setRequesting(false); notify(t("Team requested"), "success"); onChanged(); }} />}
  </section>;
}
