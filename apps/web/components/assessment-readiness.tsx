"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, ClipboardCheck, RefreshCw, ShieldAlert } from "lucide-react";

type Freshness = "fresh" | "delayed" | "stale" | "no_data" | "clock_anomaly";
type Readiness = {
  incident_id: string;
  radius_m: number;
  source: "synthetic_exercise";
  assessment_kind: "explainable_context_checklist_only";
  context_state: "insufficient_simulated_context" | "simulated_context_for_human_review";
  model_eligible_for_real_forecast: false;
  validated_risk_model: false;
  real_world_risk_probability: null;
  real_world_asset_impact_known: false;
  operational_actions_enabled: false;
  needs_accountable_human_review: true;
  source_freshness_counts: Record<Freshness, number>;
  synthetic_evidence_records: number;
  fictional_assets_nearby: number;
  reasons: { code: string; description: string }[];
  recommendation_draft: string[];
  playbook: {
    version: "AEGIS-URBAN-FLOOD-EXERCISE-v0.1";
    status: "illustrative_not_approved_operational_sop";
    step_refs: string[];
    synthetic_evidence_ids: string[];
    synthetic_source_ids: string[];
    generated_by: "deterministic_exercise_checklist_not_ai_forecast";
    operational_actions_enabled: false;
  };
};
const rad = [1000, 3000, 5000] as const;

export function AssessmentReadiness({ incidentId }: { incidentId: string }) {
  const [radius, setRadius] = useState<(typeof rad)[number]>(3000);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setBusy(true);
    setError("");
    fetch(`/api/incidents/${encodeURIComponent(incidentId)}/readiness?radius_m=${radius}`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Exercise assessment could not be loaded");
      const data = await response.json() as Readiness;
      if (data.incident_id !== incidentId || data.radius_m !== radius ||
          data.source !== "synthetic_exercise" ||
          data.assessment_kind !== "explainable_context_checklist_only" ||
          data.context_state !== "simulated_context_for_human_review" &&
          data.context_state !== "insufficient_simulated_context" ||
          data.operational_actions_enabled !== false ||
          data.model_eligible_for_real_forecast !== false ||
          data.validated_risk_model !== false ||
          data.real_world_asset_impact_known !== false ||
          data.real_world_risk_probability !== null ||
          data.needs_accountable_human_review !== true ||
          !Array.isArray(data.reasons) || !Array.isArray(data.recommendation_draft) ||
          data.playbook?.version !== "AEGIS-URBAN-FLOOD-EXERCISE-v0.1" ||
          data.playbook.operational_actions_enabled !== false ||
          data.playbook.generated_by !== "deterministic_exercise_checklist_not_ai_forecast" ||
          !Array.isArray(data.playbook.synthetic_evidence_ids) ||
          !Array.isArray(data.playbook.synthetic_source_ids)) {
        throw new Error("Assessment classification not verified");
      }
      if (!controller.signal.aborted) setResult(data);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unavailable");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [incidentId, radius, revision]);

  return <section className="panel mt-5 overflow-hidden" aria-label="Evidence review readiness">
    <div className="panel-heading">
      <div>
        <h3 className="flex items-center gap-2 text-base font-bold">
          <BrainCircuit size={19} className="text-accent"/> Human Assessment Readiness
        </h3>
        <p className="mt-1 text-xs text-muted">Synthetic evidence checks, not a flood prediction</p>
      </div>
      <button type="button" className="control text-xs" disabled={busy} onClick={() => setRevision(n => n+1)}>
        <RefreshCw size={16} className={busy ? "animate-spin" : ""}/> Recheck
      </button>
    </div>
    <div className="flex gap-3 border-b border-amber-500/25 bg-amber-500/10 px-5 py-4 text-xs leading-6 text-amber-800 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 shrink-0" size={19}/>
      <p><strong>Exercise-only analysis.</strong> No validated flood probability, verified infrastructure damage, automated response order or authority to send warnings is produced.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <label htmlFor={"readiness-radius-" + incidentId} className="text-xs font-semibold text-muted">Search radius</label>
      <select id={"readiness-radius-" + incidentId} className="field !w-32" value={radius}
        onChange={event => setRadius(Number(event.target.value) as typeof radius)}>
        {rad.map(value => <option key={value} value={value}>{value/1000} km</option>)}
      </select>
      <span className="text-xs text-muted" role="status">
        {busy ? "Checking synthetic records..." : result ? "Readiness checklist available; human review required" : "No result"}
      </span>
    </div>
    {error && <p role="alert" className="border-y border-rose-500/25 bg-rose-500/10 px-5 py-3 text-sm text-rose-700 dark:text-rose-300">
      {error}. No simulated conclusion is available.
    </p>}
    {result && <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-bold">
          {result.context_state === "insufficient_simulated_context" ?
            <AlertTriangle size={18} className="text-amber-500"/> :
            <CheckCircle2 size={18} className="text-accent"/>}
          {result.context_state === "insufficient_simulated_context" ?
            "Insufficient simulated context" :
            "Simulated context available — human interpretation required"}
        </h4>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {[
            ["Current-window demo feeds", result.source_freshness_counts.fresh],
            ["Stale demo feeds", result.source_freshness_counts.stale],
            ["Synthetic evidence records", result.synthetic_evidence_records],
            ["Nearby fictional assets", result.fictional_assets_nearby],
          ].map(([label,value]) => <div key={label} className="rounded-xl bg-elevated p-3">
            <dt className="text-muted">{label}</dt>
            <dd className="mt-2 text-xl font-bold tabular-nums">{value}</dd>
          </div>)}
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted">These are simulation record counts, not hazard probabilities or verified exposure counts.</p>
      </div>
      <div>
        <h4 className="text-sm font-bold">Why these checks matter</h4>
        <ul className="mt-3 space-y-2">
          {result.reasons.map(item => <li className="rounded-xl border border-stroke p-3 text-xs leading-6 text-muted" key={item.code}>{item.description}</li>)}
        </ul>
      </div>
      <div className="rounded-xl border border-stroke bg-elevated/40 p-4 lg:col-span-2">
        <h4 className="text-sm font-bold">Human exercise-review checklist</h4>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6 text-muted">
          {result.recommendation_draft.map(step => <li key={step}>{step}</li>)}
        </ol>
        <p className="mt-3 text-xs text-muted">Static safety guidance, not a machine-issued emergency action or automatically generated forecast.</p>
        <div className="mt-4 rounded-xl border border-stroke bg-surface p-3 text-xs leading-6 text-muted">
          <p className="font-semibold text-ink">Traceable teaching references</p>
          <p className="mt-1">Playbook: {result.playbook.version} · {result.playbook.status.replaceAll("_", " ")}</p>
          <p className="mt-1">{result.playbook.synthetic_evidence_ids.length} synthetic case evidence IDs and {result.playbook.synthetic_source_ids.length} synthetic source IDs cited.</p>
          <p className="mt-1 break-all font-mono text-[11px]">{result.playbook.synthetic_evidence_ids.join(" · ") || "No case evidence reference available"}</p>
          <Link href="/playbooks" className="mt-2 inline-flex items-center gap-1 font-semibold text-accent">Read referenced playbook <ArrowRight size={14}/></Link>
        </div>
        <Link href="/approvals" className="control mt-3 text-xs"><ClipboardCheck size={16}/> Open verified exercise approvals <ArrowRight size={15}/></Link>
      </div>
    </div>}
  </section>;
}
