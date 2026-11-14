"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ClipboardCheck, LockKeyhole, Plus, RefreshCw, X } from "lucide-react";
import { API_CODE_SENTENCES, codeLabel, recordIdTitle, shortId } from "../../lib/labels";
import { knownRoles, pageRoles, refusalHome } from "../../lib/roles";
import { ReviewFocusDetails, type Focus } from "../../components/local-review-focus";
import { ExerciseDraftBuffer } from "../../lib/exercise-draft-buffer";
import { AppShell } from "../../components/app-shell";
import { useT } from "../../components/language-provider";
import { Button, ErrorState, HazardGlyph, Panel, PermissionState, RecordRef, RoleChip, SkeletonRows, StatusPill, Stepper, TwoKey, keysForStatus, type Step, buttonClass } from "../../components/ui";
import { ExerciseReviewBrief, type ReviewBrief } from "../../components/exercise-review-brief";

function workflowSteps(status: string, simulated: boolean): { id: string; label: string; status: "done" | "current" | "pending" | "blocked" }[] {
  const maker = status === "draft" ? "current" : "done";
  const checker = status === "draft" ? "pending" : status === "submitted" ? "current" : status === "rejected" ? "blocked" : "done";
  const sim = status === "approved" ? (simulated ? "done" : "current") : "pending";
  return [{ id: "maker", label: "Maker", status: maker }, { id: "checker", label: "Checker", status: checker }, { id: "simulate", label: "Simulate", status: sim }];
}
type Role = "incident_operator" | "incident_checker" | "incident_auditor";
interface AuthState { authenticated: boolean; configured: boolean; subject?: string; agencyId?: string; roles?: Role[] }
interface Incident { id: string; hazard_type: string; status: string }
interface AssistanceRun { id: string; status: "running" | "review_ready" | "cancelled"; next_step?: string | null; step_budget: number; completed_steps: { step: string; completed_at: string; result: Record<string,unknown> }[]; operational_actions_enabled: false; needs_accountable_human_review: true }
interface Proposal {
  id: string; incident_id: string; maker_subject: string;
  action_type: string; status: "draft" | "submitted" | "approved" | "rejected";
  proposal: { assistance_run?: AssistanceRun; review_focus?: Focus; rationale?: string; exercise_only?: boolean; response_draft?: { review_brief?: ReviewBrief; context_state: string; recommendation_draft: string[]; playbook: { version: string; synthetic_evidence_ids: string[] } }; simulation?: { version?: string; sla_policy?: string; tasks: { id?: string; assigned_department?: string; assignment_version?: number; department: string; state: string; due_at?: string; sla_minutes?: number; sla_status?: string; events?: { kind: string; occurred_at: string; actor_subject?: string; rationale?: string; sla_status?: string }[] }[] } };
  created_at: string;
}
const actionTypes = [
  { value: "internal_triage", label: "Coordinate internal triage" },
  { value: "prepare_warning", label: "Prepare warning draft (never send)" },
  { value: "propose_dispatch", label: "Draft responder plan (never dispatch)" },
];
function displayError(input: unknown): string {
  if (input && typeof input === "object" && "detail" in input && typeof input.detail === "string") return input.detail;
  if (input && typeof input === "object" && "error" in input && typeof input.error === "string") {
    if (input.error === "Invalid proposal fields") return API_CODE_SENTENCES.invalid_proposal_fields;
    return input.error;
  }
  return "Action could not be completed";
}

export default function ApprovalWorkbench() {
  const t = useT();
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedIncident, setSelectedIncident] = useState("");
  const [actionType, setActionType] = useState("internal_triage");
  const [rationale, setRationale] = useState("");
  const [recoverInTab, setRecoverInTab] = useState(false);
  const [includeReviewFocus, setIncludeReviewFocus] = useState(false);
  const [reviewReasons, setReviewReasons] = useState<Record<string,string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Retry only makes sense when the list itself failed to load, not after a rejected action or save.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refused, setRefused] = useState(false);
  // Proposals whose status changed in the last reload are marked once, so the eye finds what moved.
  const [changedIds, setChangedIds] = useState<ReadonlySet<string>>(new Set());
  const lastStatus = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const draftBuffer = useRef(new ExerciseDraftBuffer());
  const accessScope = useRef("");
  const draftTarget = useRef({ incident: "", action: "internal_triage" });
  const chooseDraft = useCallback((incident: string, action: string) => {
    setIncludeReviewFocus(false);
    draftTarget.current = { incident, action };
    setSelectedIncident(incident); setActionType(action);
    setRationale(draftBuffer.current.read(incident, action));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true); setAuth(null);
    try {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      if (!sessionResponse.ok) { setAuth(null); throw new Error("Session could not be verified; retry Refresh"); }
      const session = await sessionResponse.json() as AuthState;
      if (session.authenticated && (!session.subject || !session.agencyId)) {
        setAuth(null); throw new Error("Session identity is incomplete");
      }
      const nextScope = session.authenticated ? JSON.stringify([session.subject, session.agencyId]) : "";
      const identityChanged = nextScope !== accessScope.current;
      accessScope.current = nextScope;
      const changed = draftBuffer.current.setScope(
        session.authenticated && session.roles?.includes("incident_operator") ? session.subject! : "",
        session.authenticated && session.roles?.includes("incident_operator") ? session.agencyId! : "");
      setRecoverInTab(draftBuffer.current.recoveryEnabled());
      if (changed || identityChanged || !session.authenticated) {
        chooseDraft("", "internal_triage"); setReviewReasons({}); setAssignmentTargets({}); setMessage("");
        setProposals([]); setIncidents([]);
      }
      setAuth(session);
      if (!session.authenticated) { setProposals([]); setIncidents([]); return; }
      const [casesResponse, approvalsResponse] = await Promise.all([
        fetch("/api/proposals/incidents", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/proposals", { cache: "no-store" }),
      ]);
      // A role refusal is not an outage: say which role the workbench needs instead of "could not load".
      if (casesResponse.status === 403 || approvalsResponse.status === 403) { setRefused(true); setProposals([]); setIncidents([]); setError(""); return; }
      setRefused(false);
      if (!casesResponse.ok || !approvalsResponse.ok) throw new Error("Could not load agency proposals");
      const cases: Incident[] = await casesResponse.json();
      const tasks: Proposal[] = await approvalsResponse.json();
      setIncidents(cases);
      const incident = cases.some(item => item.id === draftTarget.current.incident) ? draftTarget.current.incident : cases[0]?.id || "";
      chooseDraft(incident, draftTarget.current.action);
      setChangedIds(new Set(tasks.filter(item => item.id in lastStatus.current ? lastStatus.current[item.id] !== item.status : Object.keys(lastStatus.current).length > 0).map(item => item.id)));
      lastStatus.current = Object.fromEntries(tasks.map(item => [item.id, item.status]));
      setProposals(tasks);
      setError(""); setLoadFailed(false);
    } catch (cause) {
      setIncidents([]); setProposals([]); setLoadFailed(true);
      setError(cause instanceof Error ? cause.message : "Exercise service unavailable");
    } finally { setLoading(false); }
  }, [chooseDraft]);
  useEffect(() => { void reload(); }, [reload]);
  const canMake = !!auth?.authenticated && !!auth.roles?.includes("incident_operator");
  const canCreate = canMake && !loading && incidents.some(item => item.id === selectedIncident);
  const canReview = !!auth?.roles?.includes("incident_checker");

  async function mutation(url: string, payload: object) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), credentials: "same-origin" });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(displayError(body));
    return body;
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await mutation("/api/proposals", { incident_id: selectedIncident, action_type: actionType, rationale, ...(includeReviewFocus ? { include_review_focus: true } : {}) });
      setMessage("Exercise proposal saved as draft. It must be separately submitted and reviewed.");
      draftBuffer.current.write(selectedIncident, actionType, "");
      setRationale("");
      await reload();
    } catch (cause) { setLoadFailed(false); setError(cause instanceof Error ? cause.message : "Unable to create proposal"); }
    finally { setBusy(false); }
  }
  async function change(proposal: Proposal, operation: "submit" | "approve" | "reject" | "simulate" | "prepare_tasks" | "acknowledge_task" | "close_task" | "reassign_task" | "start_assistance" | "advance_assistance" | "cancel_assistance", taskId?: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    const reasonKey = taskId ? `${proposal.id}:${taskId}` : operation === "cancel_assistance" ? `${proposal.id}:assistance` : proposal.id;
    try {
      await mutation(`/api/proposals/${proposal.id}/transition`, { operation, rationale: reviewReasons[reasonKey] || undefined, ...(taskId ? { task_id: taskId } : {}),
        ...(operation === "reassign_task" ? { target_department: assignmentTargets[reasonKey], expected_assignment_version: proposal.proposal.simulation?.tasks.find(task => task.id === taskId)?.assignment_version ?? 0 } : {}),
        ...(operation === "advance_assistance" ? { assistance_step: proposal.proposal.assistance_run?.next_step } : {}) });
      const label = { submit: "submitted", approve: "approved", reject: "rejected", simulate: "simulated", prepare_tasks: "prepared scripted tasks", acknowledge_task: "recorded scripted acknowledgement", close_task: "closed scripted task", reassign_task: "reassigned scripted task", start_assistance: "started bounded assistance", advance_assistance: "advanced bounded assistance", cancel_assistance: "cancelled bounded assistance" }[operation];
      setMessage(`Exercise: ${label}. No messages sent or operational action taken.`);
      setReviewReasons(current => ({ ...current, [reasonKey]: "" }));
      setAssignmentTargets(current => ({ ...current, [reasonKey]: "" }));
      await reload();
    } catch (cause) {
      // Another tab may have changed the record: refresh the list so stale buttons disappear, then keep the message.
      const text = cause instanceof Error ? cause.message : "Unable to transition proposal";
      await reload(); setLoadFailed(false); setError(text);
    }
    finally { setBusy(false); }
  }

  return <AppShell title="Approval Workbench" description="Authenticated exercise proposals, controlled submissions and independent checker decisions.">
    {!auth && loading && <Panel><SkeletonRows rows={3} label={t("Checking operator session...")} /></Panel>}
    {!auth && !loading && <ErrorState title={t("Session verification unavailable")} message={t("Unsaved text is hidden until your identity is verified.")} onRetry={() => void reload()} />}

    {auth && !auth.authenticated && <Panel>
      <div className="mx-auto max-w-xl text-center">
        <LockKeyhole className="mx-auto mb-4 text-accent" size={35}/>
        <h2 className="text-xl font-bold">Verified operator sign-in required</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {auth.configured ? "Sign in with your approved IndTrana identity provider to access scoped incident proposals." :
          "The trusted identity provider is not configured yet. This page intentionally cannot create or approve proposals using pretend identities."}
        </p>
        {auth.configured && <a href="/api/auth/login" className={buttonClass({ variant: "primary", className: "mt-5" })}>Sign in securely</a>}
      </div>
    </Panel>}

    {auth?.authenticated && refused && <PermissionState needs={pageRoles("/approvals") ?? []} roles={auth.roles}
      what={t("Proposals are read by the people who make, check and audit them. Administrators set up the node but take no part in a decision.")}
      where={refusalHome(auth.roles, knownRoles(auth.roles).includes("department_operator") ? { href: "/department-tasks", label: t("Open the Department Inbox") } : { href: "/", label: t("Back to Command Center") }, t("Open My Team"))} />}

    {auth?.authenticated && !refused && <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{t("You are signed in as")}</span>
          {(auth.roles ?? []).map(role => <RoleChip key={role} role={role} />)}
          <span className="helper">{canMake && canReview ? t("You can draft, and check what other people submitted.") : canMake ? t("You draft and submit. A different person approves.") : canReview ? t("You approve or reject what a different person submitted.") : t("You can read every proposal; you cannot change one.")}</span>
        </p>
        <Button icon={RefreshCw} onClick={() => void reload()} disabled={busy} loading={loading}>{t("Refresh")}</Button>
      </div>
      {message && <p role="status"><StatusPill tone="success">{message}</StatusPill></p>}
      {error && <ErrorState message={t(error)} onRetry={loadFailed ? () => void reload() : undefined} />}
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(300px,.8fr)_minmax(0,1.5fr)]">
        <Panel title={t("Create proposal")} icon={Plus} description={t("Saved as a draft. Nothing is submitted until you choose to.")}>
          <form className="space-y-4" onSubmit={create}>
            {!canMake && <p className="helper">{t("Read-only. Drafting a proposal needs the Maker role.")}</p>}
            <div><label className="field-label" htmlFor="exercise-incident">Exercise incident</label>
              <select id="exercise-incident" className="field" value={selectedIncident} onChange={event => chooseDraft(event.target.value, actionType)} disabled={!canMake || busy || loading}>
                {!incidents.length && <option value="">{error ? t("Not loaded. Use Retry.") : "No incidents available"}</option>}
                {incidents.map(item => <option key={item.id} value={item.id}>{t(codeLabel(item.hazard_type))} · {item.id.slice(0,8)}</option>)}
              </select>
            </div>
            <div><label className="field-label" htmlFor="exercise-action">Proposed action</label>
              <select id="exercise-action" className="field" value={actionType} onChange={event => chooseDraft(selectedIncident, event.target.value)} disabled={!canCreate || busy}>
                {actionTypes.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div><label className="field-label" htmlFor="exercise-rationale">Supporting rationale</label>
              <textarea id="exercise-rationale" className="field !h-28 resize-y py-3" minLength={10} maxLength={2000} required
                value={rationale} onChange={event => {
                  setRationale(event.target.value);
                  draftBuffer.current.write(selectedIncident, actionType, event.target.value);
                  setRecoverInTab(draftBuffer.current.recoveryEnabled());
                }} disabled={!canCreate || busy}
                placeholder="Explain evidence, affected area, uncertainty, and proposed action..."/>
            </div>
            <p className="text-xs text-muted" aria-live="polite">{rationale.length}/2000 {t("characters")} · {t("minimum 10")}</p>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-teal-600" checked={recoverInTab} disabled={!canCreate || busy}
                onChange={event => setRecoverInTab(draftBuffer.current.setRecovery(event.target.checked))}/>
              Recover unsaved rationale after reload in this tab
            </label>
            <p className="text-xs leading-5 text-muted">{recoverInTab ? "Tab recovery is enabled for up to 8 hours. Text is stored in this browser tab; use only on a trusted device." : "Recovery is off or browser storage is unavailable. Unsaved text stays in page memory only."} Up to 10 case/action drafts, 2,000 characters each. Identity/access changes and sign-out clear recovery. A successful save clears that draft. This does not submit or approve anything.</p>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-teal-600" checked={includeReviewFocus} onChange={event => setIncludeReviewFocus(event.target.checked)} disabled={!canCreate || busy}/>
              Save review focus with this draft (synthetic demo agency only). Local AI selects existing cited items; unavailable AI uses a labelled template. This may take about 20 seconds.
            </label>
            <Button type="submit" variant={canMake ? "primary" : "secondary"} icon={Plus} className="w-full" loading={busy && canCreate} disabled={!canCreate || busy || rationale.trim().length < 10}>{t("Save exercise draft")}</Button>
            {(!canCreate || rationale.trim().length < 10) && <p className="helper">{!canCreate ? t("Disabled: the incident-operator role is required to save drafts.") : t("Disabled: enter a rationale of at least 10 characters.")}</p>}
          </form>
        </Panel>
        <Panel className="min-w-0" title={t("Agency approval queue")} icon={ClipboardCheck} description={t("Records are filtered to the signed agency on the server.")}
          actions={<span className="tnum text-xs font-semibold text-muted">{proposals.length} {t("proposals")}</span>} bodyClassName="p-0">
          <div className="max-h-[700px] divide-y divide-stroke overflow-y-auto">
            {loading && <div className="p-4"><SkeletonRows rows={3} label={t("Loading approval records...")} /></div>}
            {!loading && proposals.length === 0 && <p className="p-5 text-sm text-muted">{t("No proposals yet. A maker can save an exercise draft.")}</p>}
            {proposals.map(proposal => <article key={proposal.id + proposal.status} className={changedIds.has(proposal.id) ? "just-changed p-4" : "p-4"}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div>
                <p className="text-sm font-semibold">{actionTypes.find(item => item.value === proposal.action_type)?.label ?? t(codeLabel(proposal.action_type))}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <HazardGlyph value={incidents.find(item => item.id === proposal.incident_id)?.hazard_type} />
                  <span>{t("Incident")}</span><RecordRef id={proposal.incident_id} kind="incident" />
                  <span>{t("Maker")}</span>{proposal.maker_subject === auth.subject ? <strong className="font-semibold text-ink">{t("you")}</strong> : <RecordRef id={proposal.maker_subject} />}
                </p>
              </div><span className="flex flex-wrap items-center gap-2" title={proposal.status}><span className="text-xs font-semibold">{t(codeLabel(proposal.status))}</span><TwoKey {...keysForStatus(proposal.status)} /></span></div>
              <Stepper className="mt-3" label={t("Approval progress")} steps={workflowSteps(proposal.status, !!proposal.proposal.simulation).map((x): Step => ({ ...x, label: t(x.label) }))}/>
              <p className="mt-3 text-sm leading-6 text-muted">{proposal.proposal?.rationale || "No rationale recorded"}</p>
              {proposal.proposal.response_draft && <div className="mt-3 text-sm text-muted">
                <p>Playbook: <span title={proposal.proposal.response_draft.playbook.version}>{recordIdTitle(proposal.proposal.response_draft.playbook.version)}</span></p>
                {proposal.proposal.response_draft.review_brief && <ExerciseReviewBrief brief={proposal.proposal.response_draft.review_brief}/>}
                <p>Captured context: {t(codeLabel(proposal.proposal.response_draft.context_state))}</p>
                <p>{proposal.proposal.response_draft.playbook.synthetic_evidence_ids.length} synthetic evidence references preserved for review.</p>
                <ul className="mt-2 list-disc pl-5">{proposal.proposal.response_draft.recommendation_draft.map(step => <li key={step}>{step}</li>)}</ul>
              </div>}
              {proposal.proposal.review_focus && <section className="mt-3 rounded-lg border border-stroke p-3" aria-label="Saved review focus">
                <h3 className="text-sm font-bold">Saved review focus</h3>
                <p className="mt-1 text-xs text-muted">Captured when this draft was created. Selection is not evidence validation or approval.</p>
                <ReviewFocusDetails focus={proposal.proposal.review_focus}/>
              </section>}
              {proposal.status === "draft" && <section className="mt-3 rounded-lg border border-stroke p-3" aria-label="Bounded assistance run">
                <h3 className="text-sm font-bold">Bounded assistance run</h3>
                {!proposal.proposal.assistance_run && <p className="mt-1 text-xs text-muted">Optional three-step review: gather saved references, check recorded quality, validate the draft, then stop for human review.</p>}
                {proposal.proposal.assistance_run && <div className="mt-2 text-xs leading-6 text-muted">
                  <p>Status: <strong>{t(codeLabel(proposal.proposal.assistance_run.status))}</strong> · {proposal.proposal.assistance_run.completed_steps.length}/{proposal.proposal.assistance_run.step_budget} steps</p>
                  {proposal.proposal.assistance_run.next_step && <p>Next explicit step: {t(codeLabel(proposal.proposal.assistance_run.next_step))}</p>}
                  <ol className="mt-1 list-decimal pl-5">{proposal.proposal.assistance_run.completed_steps.map(item => <li key={item.step}>{t(codeLabel(item.step))}</li>)}</ol>
                  <p>No submission, approval, dispatch or acknowledgement is performed by this run.</p>
                </div>}
                {canMake && proposal.maker_subject === auth.subject && (!proposal.proposal.assistance_run || proposal.proposal.assistance_run.status === "cancelled") && <Button className="mt-2" type="button" disabled={busy} onClick={() => void change(proposal, "start_assistance")}>{proposal.proposal.assistance_run ? "Start a new bounded run" : "Start bounded assistance"}</Button>}
                {canMake && proposal.maker_subject === auth.subject && proposal.proposal.assistance_run?.status === "running" && <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void change(proposal, "advance_assistance")}>Run next bounded step</Button>
                  <input className="field max-w-sm" aria-label={`Cancellation rationale for ${proposal.id}`} maxLength={2000} placeholder="Cancellation rationale (required)" value={reviewReasons[`${proposal.id}:assistance`] || ""} onChange={event => setReviewReasons(value => ({...value,[`${proposal.id}:assistance`]:event.target.value}))}/>
                  <Button type="button" disabled={busy || (reviewReasons[`${proposal.id}:assistance`] || "").trim().length < 10} onClick={() => void change(proposal, "cancel_assistance")}>Cancel run</Button>
                </div>}
              </section>}
              {proposal.status === "approved" && canMake && proposal.proposal.response_draft && !proposal.proposal.simulation &&
                <Button className="mt-3" type="button" disabled={busy} onClick={() => void change(proposal, "prepare_tasks")}>
                  Prepare scripted department tasks
                </Button>}
              {proposal.proposal.simulation && <div className="mt-3 text-sm text-muted">
                <p>Operator-recorded simulation only · no messages sent · no real department acknowledgements.</p>
                <details className="mt-2"><summary className="cursor-pointer font-semibold">Scripted task progress</summary>
                <ul className="mt-3 space-y-4">{proposal.proposal.simulation.tasks.map(task => <li key={task.department} className="rounded-lg border border-stroke p-3">
                  <p className="font-semibold" title={task.department + ": " + task.state}>{t(codeLabel(task.department))}: {t(codeLabel(task.state))}</p>
                  {task.due_at && <p className="mt-1 text-xs">Synthetic review target: {task.sla_minutes} minutes · due {new Date(task.due_at).toLocaleString()} · <strong>{t(codeLabel(task.sla_status))}</strong></p>}
                  <p className="mt-1 text-xs">Assigned desk: {t(codeLabel(task.assigned_department || task.id || task.department))}</p>
                  <ol className="mt-2 text-xs">{task.events?.map((event, index) => <li key={index}>{t(codeLabel(event.kind))} · {new Date(event.occurred_at).toLocaleString()}{event.actor_subject ? ` · ${shortId(event.actor_subject)}` : ""}{event.rationale ? ` · ${event.rationale}` : ""}</li>)}</ol>
                  {proposal.status === "approved" && canMake && task.id && task.state !== "closed" && ["aegis.proposal.simulation.v2", "aegis.proposal.simulation.v3"].includes(proposal.proposal.simulation?.version || "") && <div className="mt-3">
                    <label htmlFor={`task-${proposal.id}-${task.id}`} className="text-xs font-semibold">Scripted task rationale for {t(codeLabel(task.department))} (required)</label>
                    <textarea id={`task-${proposal.id}-${task.id}`} className="field mt-1 !h-20 resize-y py-2" maxLength={2000}
                      value={reviewReasons[`${proposal.id}:${task.id}`] || ""} onChange={event => setReviewReasons(value => ({ ...value, [`${proposal.id}:${task.id}`]: event.target.value }))}/>
                    <Button className="mt-2" type="button" aria-label={`${task.state === "prepared" ? "Record scripted acknowledgement" : "Close scripted task"} for ${codeLabel(task.department)}`} disabled={busy || (reviewReasons[`${proposal.id}:${task.id}`] || "").trim().length < 10} onClick={() => void change(proposal, task.state === "prepared" ? "acknowledge_task" : "close_task", task.id)}>
                      {task.state === "prepared" ? "Record scripted acknowledgement" : "Close scripted task"}
                    </Button>
                    {task.state === "prepared" && <div className="mt-3">
                      <label className="block text-xs font-semibold" htmlFor={`assign-${proposal.id}-${task.id}`}>Reassign rehearsal task</label>
                      <select id={`assign-${proposal.id}-${task.id}`} className="field mt-1" disabled={busy}
                        value={assignmentTargets[`${proposal.id}:${task.id}`] || ""}
                        onChange={event => setAssignmentTargets(current => ({ ...current, [`${proposal.id}:${task.id}`]: event.target.value }))}>
                        <option value="">Choose a different desk</option>
                        {["control_room", "infrastructure", "communications"].filter(department => department !== (task.assigned_department || task.id)).map(department => <option key={department} value={department}>{t(codeLabel(department))}</option>)}
                      </select>
                      <Button className="mt-2" type="button" disabled={busy || !assignmentTargets[`${proposal.id}:${task.id}`] || (reviewReasons[`${proposal.id}:${task.id}`] || "").trim().length < 10} onClick={() => void change(proposal, "reassign_task", task.id)}>Reassign with rationale</Button>
                      <p className="mt-1 text-xs">Unacknowledged tasks only. The original synthetic target remains unchanged.</p>
                    </div>}
                  </div>}
                </li>)}</ul></details>
                {proposal.proposal.simulation.sla_policy && <p className="mt-2 text-xs">Synthetic rehearsal targets only; no operational SLA, escalation, notification or department participation.</p>}
              </div>}
              <p className="mt-3"><a className={buttonClass({ variant: "quiet", size: "sm" })} href={`/api/proposals/${proposal.id}/audit`} target="_blank" rel="noreferrer">Open private proposal audit JSON</a></p>
              {proposal.status === "approved" && proposal.action_type === "prepare_warning" && proposal.proposal.response_draft && <div className="mt-3 text-sm">
                <a className={buttonClass()} href={`/api/proposals/${proposal.id}/cap-draft`}>Download exercise CAP XML draft</a>
                <p className="mt-2 text-xs text-muted">Private exercise artifact only. Unknown hazard severity; no verified footprint. Never transmit or use for operations.</p>
              </div>}
              {proposal.status === "draft" && canMake && proposal.maker_subject === auth.subject &&
                <Button className="mt-3" type="button" disabled={busy} onClick={() => void change(proposal, "submit")}>
                  Submit for independent review
                </Button>}
              {proposal.status === "submitted" && canReview && proposal.maker_subject !== auth.subject && <div className="mt-4 rounded-lg border border-stroke bg-elevated/30 p-3">
                <label htmlFor={`review-${proposal.id}`} className="field-label">Checker rationale (required)</label>
                <textarea id={`review-${proposal.id}`} className="field mt-2 !h-20 resize-y py-2" maxLength={2000}
                  value={reviewReasons[proposal.id] || ""} onChange={event => setReviewReasons(value => ({ ...value, [proposal.id]: event.target.value }))}
                  placeholder="Record why you accept or reject this exercise proposal..." />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" type="button" disabled={busy || !(reviewReasons[proposal.id]?.trim())} onClick={() => void change(proposal, "approve")}><Check size={16}/> Approve draft</Button>
                  <Button variant="danger" type="button" disabled={busy || !(reviewReasons[proposal.id]?.trim())} onClick={() => void change(proposal, "reject")}><X size={16}/> Reject draft</Button>
                </div>
                {!(reviewReasons[proposal.id]?.trim()) && <p className="mt-2 text-xs text-muted">{t("Disabled: a checker rationale is required before approving or rejecting.")}</p>}
              </div>}
              {proposal.status === "submitted" && proposal.maker_subject === auth.subject && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">You cannot approve your own proposal.</p>}
              {proposal.status === "submitted" && !canReview && <p className="mt-3 text-xs text-muted">{t("Waiting for an independent checker; your role cannot review this proposal.")}</p>}
            </article>)}
          </div>
        </Panel>
      </div>
    </div>}
  </AppShell>;
}
