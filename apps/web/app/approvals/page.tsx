"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, ClipboardCheck, LockKeyhole, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { AppShell } from "../../components/app-shell";

type Role = "incident_operator" | "incident_checker" | "incident_auditor";
interface AuthState { authenticated: boolean; configured: boolean; subject?: string; agencyId?: string; roles?: Role[] }
interface Incident { id: string; hazard_type: string; status: string }
interface Proposal {
  id: string; incident_id: string; maker_subject: string;
  action_type: string; status: "draft" | "submitted" | "approved" | "rejected";
  proposal: { rationale?: string; exercise_only?: boolean };
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
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedIncident, setSelectedIncident] = useState("");
  const [actionType, setActionType] = useState("internal_triage");
  const [rationale, setRationale] = useState("");
  const [reviewReasons, setReviewReasons] = useState<Record<string,string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json() as AuthState;
      setAuth(session);
      if (!session.authenticated) { setProposals([]); return; }
      const [casesResponse, approvalsResponse] = await Promise.all([
        fetch("/api/incidents", { cache: "no-store" }),
        fetch("/api/proposals", { cache: "no-store" }),
      ]);
      if (!casesResponse.ok || !approvalsResponse.ok) throw new Error("Could not load agency proposals");
      const cases: Incident[] = await casesResponse.json();
      const tasks: Proposal[] = await approvalsResponse.json();
      setIncidents(cases);
      setSelectedIncident(current => current || cases[0]?.id || "");
      setProposals(tasks);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Exercise service unavailable");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const canMake = !!auth?.roles?.includes("incident_operator");
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
    if (!canMake || !selectedIncident || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await mutation("/api/proposals", { incident_id: selectedIncident, action_type: actionType, rationale });
      setMessage("Exercise proposal saved as draft. It must be separately submitted and reviewed.");
      setRationale("");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create proposal"); }
    finally { setBusy(false); }
  }
  async function change(proposal: Proposal, operation: "submit" | "approve" | "reject") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await mutation(`/api/proposals/${proposal.id}/transition`, { operation, rationale: reviewReasons[proposal.id] || undefined });
      setMessage(`Exercise proposal ${operation === "submit" ? "submitted" : operation === "approve" ? "approved" : "rejected"} successfully. No operational action was taken.`);
      setReviewReasons(current => ({ ...current, [proposal.id]: "" }));
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to transition proposal"); }
    finally { setBusy(false); }
  }

  return <AppShell title="Approval Workbench" description="Authenticated exercise proposals, controlled submissions and independent checker decisions.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-amber-700 dark:text-amber-300">
      <ShieldCheck className="mt-0.5 shrink-0" size={20}/>
      <div><p className="text-sm font-bold">Training environment only</p><p className="mt-1 text-xs leading-5">
        Approval records document simulated decisions. They never issue public warnings or dispatch responders.
        This workbench requires a trusted identity provider with signed agency and role claims.</p></div>
    </div>

    {!auth && <section className="panel p-8 text-center text-sm text-muted">Checking secure operator session...</section>}
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
              <select id="exercise-incident" className="field" value={selectedIncident} onChange={event => setSelectedIncident(event.target.value)} disabled={!canMake || busy}>
                {!incidents.length && <option value="">No incidents available</option>}
                {incidents.map(item => <option key={item.id} value={item.id}>{item.hazard_type} · {item.id.slice(0,8)}</option>)}
              </select>
            </div>
            <div><label className="mb-2 block text-xs font-semibold text-muted" htmlFor="exercise-action">Proposed action</label>
              <select id="exercise-action" className="field" value={actionType} onChange={event => setActionType(event.target.value)} disabled={!canMake || busy}>
                {actionTypes.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div><label className="mb-2 block text-xs font-semibold text-muted" htmlFor="exercise-rationale">Supporting rationale</label>
              <textarea id="exercise-rationale" className="field !h-28 resize-y py-3" minLength={10} maxLength={2000} required
                value={rationale} onChange={event => setRationale(event.target.value)} disabled={!canMake || busy}
                placeholder="Explain evidence, affected area, uncertainty, and proposed action..."/>
            </div>
            <button type="submit" className="control control-primary w-full" disabled={!canMake || !selectedIncident || busy || rationale.trim().length < 10}>
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
              {proposal.status === "submitted" && proposal.maker_subject === auth.subject && <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">You cannot approve your own proposal.</p>}
            </article>)}
          </div>
        </section>
      </div>
    </div>}
  </AppShell>;
}
