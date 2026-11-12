"use client";
// The shared pieces of the team response loop screens: state pill, attention flag, lifecycle stepper, report history
// and the one report form (note with a live count, code select when the kind needs one, Confirm and Cancel).
// Exercise only. Nothing here calls, texts or radios anyone; a report is a line in AEGIS. See docs/RESPONSE_LOOP.md.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Flag, MessageSquareText } from "lucide-react";
import { useT } from "./language-provider";
import { Button, Stepper, StatusPill, type Step, type Tone } from "./ui";
import { RELAY_ACTION_LABELS, RESPONSE_ACTION_LABELS, authorityLabel, reportCodeLabel, reportKindLabel, responseStateLabel } from "../lib/labels";
import { KIND_CODES, NOTE_MAX, NOTE_MIN, PROGRESS_STEPS, istText, noteProblem, type ResponseReport, type ResponseRequest } from "../lib/response-ui";
import { submitReport } from "../lib/response-client";

const STATE_TONE: Record<string, Tone> = { requested: "warning", accepted: "info", en_route: "info", on_site: "info", completed: "success", declined: "neutral", stood_down: "neutral" };

export function StateBadge({ state }: Readonly<{ state: string }>) {
  const t = useT();
  return <StatusPill tone={STATE_TONE[state] ?? "neutral"}>{t(responseStateLabel(state))}</StatusPill>;
}

/** The attention flag. `viewer` decides the wording: a team is told the desk has been asked, a desk is told it must look. */
export function AttentionFlag({ viewer }: Readonly<{ viewer: "team" | "desk" }>) {
  const t = useT();
  return <StatusPill tone="danger" icon={Flag}>{viewer === "desk" ? t("Needs your desk") : t("Waiting for the desk")}</StatusPill>;
}

/** Requested, accepted, en route, on site, completed. A declined or stood-down request has no path to show. */
export function LifecycleStepper({ state }: Readonly<{ state: string }>) {
  const t = useT();
  const at = PROGRESS_STEPS.indexOf(state as (typeof PROGRESS_STEPS)[number]);
  if (at < 0) return null;
  const names: Record<(typeof PROGRESS_STEPS)[number], string> = {
    requested: t("Requested"), accepted: t("Accepted"), en_route: t("En route"), on_site: t("On site"), completed: t("Completed"),
  };
  const steps: Step[] = PROGRESS_STEPS.map((id, index) => ({
    id, label: names[id], status: index < at || state === "completed" ? "done" : index === at ? "current" : "pending",
  }));
  return <Stepper steps={steps} label={t("Progress of this request")} />;
}

/** Who recorded a line, in words: the team, the desk on the team's behalf, or the desk. */
const who = (report: ResponseReport, t: (text: string) => string) => t(authorityLabel(report.authority));

export function ReportLine({ report, kind }: Readonly<{ report: ResponseReport; kind?: "summary" }>) {
  const t = useT();
  const text = reportKindLabel(report.kind) ? t(reportKindLabel(report.kind)) : "";
  return <div className="min-w-0 text-sm">
    <p className="flex flex-wrap items-baseline gap-x-2">
      <strong className="font-semibold">{text}</strong>
      {report.code && <span>{t(reportCodeLabel(report.kind, report.code))}</span>}
    </p>
    <p className="tnum text-xs text-muted">{who(report, t)}{report.mine ? ` · ${t("you")}` : ""} · {istText(report.occurred_at)}</p>
    {report.note && <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${kind === "summary" ? "line-clamp-3" : ""}`}>{report.note}</p>}
  </div>;
}

/** The full history, newest first. */
export function ReportHistory({ reports }: Readonly<{ reports: readonly ResponseReport[] }>) {
  const t = useT();
  if (reports.length === 0) return <p className="helper">{t("No reports yet.")}</p>;
  return <ol aria-label={t("Report history")} className="space-y-3 border-l-2 border-stroke pl-3">
    {[...reports].reverse().map((report, index) => <li key={`${report.occurred_at}-${report.kind}-${index}`}><ReportLine report={report} /></li>)}
  </ol>;
}

/** One small form for one report. The server decides what is allowed; a refusal is shown in words and the list is refreshed. */
export function ReportForm({ request, kind, relay, onSaved, onCancel, onStale, large = false }: Readonly<{
  request: ResponseRequest; kind: string; relay: boolean; large?: boolean;
  onSaved: (request: ResponseRequest, kind: string) => void; onCancel: () => void; onStale: () => void;
}>) {
  const t = useT();
  const id = useId();
  const codes = KIND_CODES[kind];
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const sending = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { noteRef.current?.focus(); }, []);
  const problem = noteProblem(note);
  const missingCode = Boolean(codes) && !code;
  const title = t((relay ? RELAY_ACTION_LABELS : RESPONSE_ACTION_LABELS)[kind] ?? reportKindLabel(kind));
  const codeLabelText = kind === "declined" ? t("Reason") : kind === "needs_support" ? t("What is needed") : t("Situation");
  const noteError = problem === "short" ? t("Write at least 10 characters.") : problem === "long" ? t("Keep the note to 1000 characters or fewer.") : problem === "characters" ? t("Use plain text without control or line-separator characters.") : "";
  const length = note.trim().length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (sending.current || problem || missingCode) return; // never double-submit
    sending.current = true; setBusy(true); setError("");
    const result = await submitReport(request.id, { kind, expected_version: request.version, note: note.trim(), ...(codes ? { code } : {}) });
    sending.current = false; setBusy(false);
    if (result.ok && result.data) { onSaved(result.data, kind); return; }
    if (result.status === -1) return;
    setError(result.message);
    if (result.status === 409) onStale();
  }

  return <form onSubmit={submit} noValidate aria-label={title} className="space-y-3 rounded-md border border-stroke bg-elevated/40 p-3">
    <p className="text-sm font-semibold">{title}</p>
    {relay && <p className="helper">{t("Recorded as relayed by the desk on the team's behalf. Nobody is contacted.")}</p>}
    {codes && <div>
      <label className="field-label" htmlFor={`${id}-code`}>{codeLabelText}</label>
      <select id={`${id}-code`} className="field" value={code} disabled={busy} required aria-invalid={touched && missingCode ? true : undefined}
        aria-describedby={touched && missingCode ? `${id}-code-error` : undefined} onChange={event => setCode(event.target.value)}>
        <option value="">{t("Choose one")}</option>
        {codes.map(item => <option key={item} value={item}>{t(reportCodeLabel(kind, item))}</option>)}
      </select>
      {touched && missingCode && <p id={`${id}-code-error`} className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300">{t("Choose one.")}</p>}
    </div>}
    <div>
      <label className="field-label" htmlFor={`${id}-note`}>{t("Note")}</label>
      <textarea ref={noteRef} id={`${id}-note`} className="field" rows={3} maxLength={NOTE_MAX + 200} value={note} disabled={busy}
        aria-invalid={touched && problem ? true : undefined} aria-describedby={`${id}-note-help${touched && problem ? ` ${id}-note-error` : ""}`}
        onChange={event => setNote(event.target.value)} />
      <p id={`${id}-note-help`} className="helper mt-1 flex flex-wrap justify-between gap-x-3">
        <span>{t("10 to 1000 characters. Recorded in the audit trail.")}</span>
        <span className={`tnum ${length > NOTE_MAX ? "font-semibold text-rose-700 dark:text-rose-300" : ""}`}>{length}/{NOTE_MAX}{length < NOTE_MIN ? ` · ${NOTE_MIN - length} ${t("more needed")}` : ""}</span>
      </p>
      {touched && problem && <p id={`${id}-note-error`} className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300">{noteError}</p>}
    </div>
    {error && <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-rose-800 dark:text-rose-200"><MessageSquareText size={16} aria-hidden="true" className="mt-0.5 shrink-0" />{t(error)}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="primary" loading={busy} className={large ? "min-h-11 flex-1 sm:flex-none" : ""}>{t("Confirm")}</Button>
      <Button variant="quiet" disabled={busy} onClick={onCancel} className={large ? "min-h-11" : ""}>{t("Cancel")}</Button>
    </div>
  </form>;
}
