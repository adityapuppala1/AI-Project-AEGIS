"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Check, ClipboardCheck, LockKeyhole, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ReviewFocusDetails, type Focus } from "../../components/local-review-focus";
import { ExerciseDraftBuffer } from "../../lib/exercise-draft-buffer";
import { AppShell } from "../../components/app-shell";
import { ExerciseReviewBrief, type ReviewBrief } from "../../components/exercise-review-brief";

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
const statuses: Record<string,string> = {
  draft: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  submitted: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};
function displayError(input: unknown): string {
  if (input && typeof input === "object" && "detail" in input && typeof input.detail === "string") return input.detail;
  if (input && typeof input === "object" && "error" in input && typeof input.error === "string") return input.error;
  return "Action could not be completed";
}

export default function ApprovalWorkbench() {
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
  const [loading, setLoading] = useState(true);
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
      if (!casesResponse.ok || !approvalsResponse.ok) throw new Error("Could not load agency proposals");
      const cases: Incident[] = await casesResponse.json();
      const tasks: Proposal[] = await approvalsResponse.json();
      setIncidents(cases);
      const incident = cases.some(item => item.id === draftTarget.current.incident) ? draftTarget.current.incident : cases[0]?.id || "";
      chooseDraft(incident, draftTarget.current.action);
      setProposals(tasks);
      setError("");
    } catch (cause) {
      setIncidents([]); setProposals([]);
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create proposal"); }
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to transition proposal"); }
    finally { setBusy(false); }
  }

  return <AppShell title="Approval Workbench" description="Authenticated exercise proposals, controlled submissions and independent checker decisions.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-amber-800 dark:text-amber-300">
      <ShieldCheck className="mt-0.5 shrink-0" size={20}/>
      <div><p className="text-sm font-bold">Training environment only</p><p className="mt-1 text-xs leading-5">
        Approval records document simulated decisions. They never issue public warnings or dispatch responders.
        This workbench requires a trusted identity provider with signed agency and role claims.</p></div>
    </div>

    {!auth && loading && <section className="panel p-8 text-center text-sm text-muted">Checking secure operator session...</section>}
    {!auth && !loading && <section className="panel p-5"><p role="alert">Session verification unavailable. Unsaved text is hidden until your identity is verified.</p><button type="button" className="control mt-3" onClick={() => void reload()}>Retry session verification</button></section>}

    {auth && !auth.authenticated && <section className="panel p-8">
      <div className="mx-auto max-w-xl text-center">
        <LockKeyhole className="mx-auto mb-4 text-accent" size={35}/>
        <h2 className="text-xl font-bold">Verified operator sign-in required</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {auth.configured ? "Sign in with your approved AEGIS identity provider to access scoped incident proposals." :
          "The trusted identity provider is not configured yet. This page intentionally cannot create or approve proposals using pretend identities."}
        </p>
        {auth.configured && <a href="/api/auth/login" className="control control-primary mt-5">Sign in securely</a>}
        <p className="mt-4 text-xs text-muted">The public synthetic command-center dashboard remains accessible without login.</p>
      </div>
    </section>}

    {auth?.authenticated && <div className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="eyebrow">Verified access context</p>
          <p className="mt-2 text-sm font-semibold">{auth.subject} <span className="font-normal text-muted">· Agency {auth.agencyId?.slice(0,8)}</span></p>
          <p className="mt-1 text-xs text-muted">{auth.roles?.join(" · ")}</p>
        </div>
        <button type="button" className="control" onClick={() => void reload()} disabled={busy || loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh
        </button>
      </div>
      {message && <p role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle size={17}/>{error}</p>}
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(300px,.8fr)_minmax(0,1.5fr)]">
        <section className="panel">
          <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><Plus size={17} className="text-accent"/> Create proposal</h2></div>
          <form className="space-y-4 p-5" onSubmit={create}>
            {!canMake && <p className="text-sm text-muted">Read-only access. The incident-operator role is required to create proposals.</p>}
            <div><label className="mb-2 block text-xs font-semibold text-muted" htmlFor="exercise-incident">Exercise incident</label>
              <select id="exercise-incident" className="field" value={selectedIncident} onChange={event => chooseDraft(event.target.value, actionType)} disabled={!canMake || busy || loading}>
                {!incidents.length && <option value="">No incidents available</option>}
                {incidents.map(item => <option key={item.id} value={item.id}>{item.hazard_type} · {item.id.slice(0,8)}</option>)}
              </select>
            </div>
            <div><label className="mb-2 block text-xs font-semibold text-muted" htmlFor="exercise-action">Proposed action</label>
              <select id="exercise-action" className="field" value={actionType} onChange={event => chooseDraft(selectedIncident, event.target.value)} disabled={!canCreate || busy}>
                {actionTypes.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div><label className="mb-2 block text-xs font-semibold text-muted" htmlFor="exercise-rationale">Supporting rationale</label>
              <textarea id="exercise-rationale" className="field !h-28 resize-y py-3" minLength={10} maxLength={2000} required
                value={rationale} onChange={event => {
                  setRationale(event.target.value);
                  draftBuffer.current.write(selectedIncident, actionType, event.target.value);
                  setRecoverInTab(draftBuffer.current.recoveryEnabled());
                }} disabled={!canCreate || busy}
                placeholder="Explain evidence, affected area, uncertainty, and proposed action..."/>
            </div>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input type="checkbox" checked={recoverInTab} disabled={!canCreate || busy}
                onChange={event => setRecoverInTab(draftBuffer.current.setRecovery(event.target.checked))}/>
              Recover unsaved rationale after reload in this tab
            </label>
            <p className="text-xs leading-5 text-muted">{recoverInTab ? "Tab recovery is enabled for up to 8 hours. Text is stored in this browser tab; use only on a trusted device." : "Recovery is off or browser storage is unavailable. Unsaved text stays in page memory only."} Up to 10 case/action drafts, 2,000 characters each. Identity/access changes and sign-out clear recovery. A successful save clears that draft. This does not submit or approve anything.</p>
            <label className="flex items-start gap-2 text-xs leading-5">
              <input type="checkbox" checked={includeReviewFocus} onChange={event => setIncludeReviewFocus(event.target.checked)} disabled={!canCreate || busy}/>
              Save review focus with this draft (synthetic demo agency only). Local AI selects existing cited items; unavailable AI uses a labelled template. This may take about 20 seconds.
            </label>
            <button type="submit" className="control control-primary w-full" disabled={!canCreate || busy || rationale.trim().length < 10}>
              <Plus size={16}/> Save exercise draft
            </button>
          </form>
        </section>
        <section className="panel min-w-0">
          <div className="panel-heading"><div><h2 className="flex items-center gap-2 text-base font-bold"><ClipboardCheck size={17} className="text-accent"/> Agency approval queue</h2><p className="mt-1 text-xs text-muted">Records are filtered to the signed agency on the server.</p></div>
            <span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">{proposals.length} proposals</span></div>
          <div className="max-h-[700px] divide-y divide-stroke overflow-y-auto">
            {loading && <p className="p-6 text-sm text-muted">Loading approval records...</p>}
            {!loading && proposals.length === 0 && <p className="p-6 text-sm text-muted">No proposals yet. Operators can create an exercise draft.</p>}
            {proposals.map(proposal => <article key={proposal.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div>
                <p className="text-sm font-bold">{actionTypes.find(item => item.value === proposal.action_type)?.label ?? proposal.action_type}</p>
                <p className="mt-1 text-xs text-muted">Maker: {proposal.maker_subject} · Incident {proposal.incident_id.slice(0,8)}</p>
              </div><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statuses[proposal.status] ?? "bg-elevated"}`}>{proposal.status}</span></div>
              <p className="mt-3 text-sm leading-6 text-muted">{proposal.proposal?.rationale || "No rationale recorded"}</p>
              {proposal.proposal.response_draft && <div className="mt-3 text-sm text-muted">
                <p>Playbook: {proposal.proposal.response_draft.playbook.version}</p>
                {proposal.proposal.response_draft.review_brief && <ExerciseReviewBrief brief={proposal.proposal.response_draft.review_brief}/>}
                <p>Captured context: {proposal.proposal.response_draft.context_state.replaceAll("_", " ")}</p>
                <p>{proposal.proposal.response_draft.playbook.synthetic_evidence_ids.length} synthetic evidence references preserved for review.</p>
                <ul className="mt-2 list-disc pl-5">{proposal.proposal.response_draft.recommendation_draft.map(step => <li key={step}>{step}</li>)}</ul>
              </div>}
              {proposal.proposal.review_focus && <section className="mt-3 rounded-xl border border-stroke p-3" aria-label="Saved review focus">
                <h3 className="text-sm font-bold">Saved review focus</h3>
                <p className="mt-1 text-xs text-muted">Captured when this draft was created. Selection is not evidence validation or approval.</p>
                <ReviewFocusDetails focus={proposal.proposal.review_focus}/>
              </section>}
              {proposal.status === "draft" && <section className="mt-3 rounded-xl border border-stroke p-3" aria-label="Bounded assistance run">
                <h3 className="text-sm font-bold">Bounded assistance run</h3>
                {!proposal.proposal.assistance_run && <p className="mt-1 text-xs text-muted">Optional three-step review: gather saved references, check recorded quality, validate the draft, then stop for human review.</p>}
                {proposal.proposal.assistance_run && <div className="mt-2 text-xs leading-6 text-muted">
                  <p>Status: <strong>{proposal.proposal.assistance_run.status.replaceAll("_", " ")}</strong> · {proposal.proposal.assistance_run.completed_steps.length}/{proposal.proposal.assistance_run.step_budget} steps</p>
                  {proposal.proposal.assistance_run.next_step && <p>Next explicit step: {proposal.proposal.assistance_run.next_step.replaceAll("_", " ")}</p>}
                  <ol className="mt-1 list-decimal pl-5">{proposal.proposal.assistance_run.completed_steps.map(item => <li key={item.step}>{item.step.replaceAll("_", " ")}</li>)}</ol>
                  <p>No submission, approval, dispatch or acknowledgement is performed by this run.</p>
                </div>}
                {canMake && proposal.maker_subject === auth.subject && (!proposal.proposal.assistance_run || proposal.proposal.assistance_run.status === "cancelled") && <button type="button" className="control mt-2" disabled={busy} onClick={() => void change(proposal, "start_assistance")}>{proposal.proposal.assistance_run ? "Start a new bounded run" : "Start bounded assistance"}</button>}
                {canMake && proposal.maker_subject === auth.subject && proposal.proposal.assistance_run?.status === "running" && <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="control" disabled={busy} onClick={() => void change(proposal, "advance_assistance")}>Run next bounded step</button>
                  <input className="field max-w-sm" aria-label={`Cancellation rationale for ${proposal.id}`} maxLength={2000} placeholder="Cancellation rationale (required)" value={reviewReasons[`${proposal.id}:assistance`] || ""} onChange={event => setReviewReasons(value => ({...value,[`${proposal.id}:assistance`]:event.target.value}))}/>
                  <button type="button" className="control" disabled={busy || (reviewReasons[`${proposal.id}:assistance`] || "").trim().length < 10} onClick={() => void change(proposal, "cancel_assistance")}>Cancel run</button>
                </div>}
              </section>}
              {proposal.status === "approved" && canMake && proposal.proposal.response_draft && !proposal.proposal.simulation &&
                <button type="button" className="control mt-3" disabled={busy} onClick={() => void change(proposal, "prepare_tasks")}>
                  Prepare scripted department tasks
                </button>}
              {proposal.proposal.simulation && <div className="mt-3 text-sm text-muted">
                <p>Operator-recorded simulation only · no messages sent · no real department acknowledgements.</p>
                <details className="mt-2"><summary className="cursor-pointer font-semibold">Scripted task progress</summary>
                <ul className="mt-3 space-y-4">{proposal.proposal.simulation.tasks.map(task => <li key={task.department} className="rounded-xl border border-stroke p-3">
                  <p className="font-semibold">{task.department}: {task.state}</p>
                  {task.due_at && <p className="mt-1 text-xs">Synthetic review target: {task.sla_minutes} minutes · due {new Date(task.due_at).toLocaleString()} · <strong>{task.sla_status?.replaceAll("_", " ")}</strong></p>}
                  <p className="mt-1 text-xs">Assigned desk: {(task.assigned_department || task.id || task.department).replaceAll("_", " ")}</p>
                  <ol className="mt-2 text-xs">{task.events?.map((event, index) => <li key={index}>{event.kind} · {new Date(event.occurred_at).toLocaleString()}{event.actor_subject ? ` · ${event.actor_subject}` : ""}{event.rationale ? ` · ${event.rationale}` : ""}</li>)}</ol>
                  {proposal.status === "approved" && canMake && task.id && task.state !== "closed" && ["aegis.proposal.simulation.v2", "aegis.proposal.simulation.v3"].includes(proposal.proposal.simulation?.version || "") && <div className="mt-3">
                    <label htmlFor={`task-${proposal.id}-${task.id}`} className="text-xs font-semibold">Scripted task rationale for {task.department} (required)</label>
                    <textarea id={`task-${proposal.id}-${task.id}`} className="field mt-1 !h-20 resize-y py-2" maxLength={2000}
                      value={reviewReasons[`${proposal.id}:${task.id}`] || ""} onChange={event => setReviewReasons(value => ({ ...value, [`${proposal.id}:${task.id}`]: event.target.value }))}/>
                    <button type="button" className="control mt-2" aria-label={`${task.state === "prepared" ? "Record scripted acknowledgement" : "Close scripted task"} for ${task.department}`} disabled={busy || (reviewReasons[`${proposal.id}:${task.id}`] || "").trim().length < 10}
                      onClick={() => void change(proposal, task.state === "prepared" ? "acknowledge_task" : "close_task", task.id)}>
                      {task.state === "prepared" ? "Record scripted acknowledgement" : "Close scripted task"}
                    </button>
                    {task.state === "prepared" && <div className="mt-3">
                      <label className="block text-xs font-semibold" htmlFor={`assign-${proposal.id}-${task.id}`}>Reassign rehearsal task</label>
                      <select id={`assign-${proposal.id}-${task.id}`} className="field mt-1" disabled={busy}
                        value={assignmentTargets[`${proposal.id}:${task.id}`] || ""}
                        onChange={event => setAssignmentTargets(current => ({ ...current, [`${proposal.id}:${task.id}`]: event.target.value }))}>
                        <option value="">Choose a different desk</option>
                        {["control_room", "infrastructure", "communications"].filter(department => department !== (task.assigned_department || task.id)).map(department => <option key={department} value={department}>{department.replaceAll("_", " ")}</option>)}
                      </select>
                      <button type="button" className="control mt-2" disabled={busy || !assignmentTargets[`${proposal.id}:${task.id}`] || (reviewReasons[`${proposal.id}:${task.id}`] || "").trim().length < 10}
                        onClick={() => void change(proposal, "reassign_task", task.id)}>Reassign with rationale</button>
                      <p className="mt-1 text-xs">Unacknowledged tasks only. The original synthetic target remains unchanged.</p>
                    </div>}
                  </div>}
                </li>)}</ul></details>
                {proposal.proposal.simulation.sla_policy && <p className="mt-2 text-xs">Synthetic rehearsal targets only; no operational SLA, escalation, notification or department participation.</p>}
              </div>}
              <a className="mt-3 inline-block text-sm underline" href={`/api/proposals/${proposal.id}/audit`} target="_blank" rel="noreferrer">Open private proposal audit JSON</a>
              {proposal.status === "approved" && proposal.action_type === "prepare_warning" && proposal.proposal.response_draft && <div className="mt-3 text-sm">
                <a className="control" href={`/api/proposals/${proposal.id}/cap-draft`}>Download exercise CAP XML draft</a>
                <p className="mt-2 text-xs text-muted">Private exercise artifact only. Unknown hazard severity; no verified footprint. Never transmit or use for operations.</p>
              </div>}
              {proposal.status === "draft" && canMake && proposal.maker_subject === auth.subject &&
                <button type="button" className="control mt-3" disabled={busy} onClick={() => void change(proposal, "submit")}>
                  Submit for independent review
                </button>}
              {proposal.status === "submitted" && canReview && proposal.maker_subject !== auth.subject && <div className="mt-4 rounded-xl border border-stroke bg-elevated/30 p-3">
                <label htmlFor={`review-${proposal.id}`} className="text-xs font-semibold text-muted">Checker rationale (required)</label>
                <textarea id={`review-${proposal.id}`} className="field mt-2 !h-20 resize-y py-2" maxLength={2000}
                  value={reviewReasons[proposal.id] || ""} onChange={event => setReviewReasons(value => ({ ...value, [proposal.id]: event.target.value }))}
                  placeholder="Record why you accept or reject this exercise proposal..." />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="control control-primary" disabled={busy || !(reviewReasons[proposal.id]?.trim())} onClick={() => void change(proposal, "approve")}><Check size={16}/> Approve draft</button>
                  <button type="button" className="control" disabled={busy || !(reviewReasons[proposal.id]?.trim())} onClick={() => void change(proposal, "reject")}><X size={16}/> Reject draft</button>
                </div>
              </div>}
              {proposal.status === "submitted" && proposal.maker_subject === auth.subject && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">You cannot approve your own proposal.</p>}
            </article>)}
          </div>
        </section>
      </div>
    </div>}
  </AppShell>;
}
