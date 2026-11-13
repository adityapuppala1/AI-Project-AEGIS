"use client";

import { codeLabel } from "../lib/labels";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LocalReviewFocus } from "./local-review-focus";
import { contextErrorMessage } from "../lib/context-errors";
import { ExerciseReviewBrief, type ReviewBrief } from "./exercise-review-brief";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, CircleHelp, ClipboardCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { useT } from "./language-provider";
import { DataFreshness, ErrorState, InlineHelp, Panel, SegmentedControl, SkeletonRegion, Skeleton, StatTile, StatusPill, Button, buttonClass } from "./ui";

type Freshness = "fresh" | "delayed" | "stale" | "no_data" | "clock_anomaly";
type Readiness = {
  review_brief?: ReviewBrief;
  checklist_version: "aegis.exercise.context.v2";
  reference_time: string;
  reference_clock: "source_freshness_evaluation_time";
  unknowns: string[];
  next_review_step: string;
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
  source_comparison: {
    version: "aegis.exercise.source-comparison.v1";
    status: "agreement" | "disagreement" | "not_comparable";
    groups: { comparison_group: string; status: "agreement" | "disagreement" | "not_comparable";
      metric_unit: string; window_seconds: number; tolerance: number;
      observed_span_seconds: number | null; value_range: number | null; source_ids: string[] }[];
    synthetic: true; validated_forecast: false; operational_actions_enabled: false; note: string;
  };
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
  const t = useT();
  const [radius, setRadius] = useState<(typeof rad)[number]>(3000);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [copyResult, setCopyResult] = useState("");
  async function copyExerciseReview() {
    if (!result) return;
    const rationale = [
      "IndTrana SIMULATION ONLY: fictional case " + result.incident_id,
      "Playbook: " + result.playbook.version,
      "Human-review checklist: " + result.recommendation_draft.join(" "),
      "Synthetic evidence IDs: " + result.playbook.synthetic_evidence_ids.join(", "),
      "Synthetic source IDs: " + result.playbook.synthetic_source_ids.join(", "),
      "No real hazard prediction, operational warning or responder dispatch is authorized.",
    ].join("\n").slice(0,1800);
    try {
      await navigator.clipboard.writeText(rationale);
      setCopyResult(t("Review text copied to clipboard"));
    } catch {
      setCopyResult(t("Clipboard access unavailable; review references above manually"));
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setCopyResult("");
    setBusy(true);
    setError("");
    fetch(`/api/incidents/${encodeURIComponent(incidentId)}/readiness?radius_m=${radius}`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(response.status === 404 ? "Synthetic case or geography not found" : contextErrorMessage(failure?.code));
      }
      const data = await response.json() as Readiness;
      if (data.checklist_version !== "aegis.exercise.context.v2" ||
          data.reference_clock !== "source_freshness_evaluation_time" ||
          typeof data.reference_time !== "string" || !Number.isFinite(Date.parse(data.reference_time)) ||
          !Array.isArray(data.unknowns) || !data.unknowns.every(item => typeof item === "string") ||
          typeof data.next_review_step !== "string" ||
          data.incident_id !== incidentId || data.radius_m !== radius ||
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
          data.source_comparison?.version !== "aegis.exercise.source-comparison.v1" ||
          !["agreement", "disagreement", "not_comparable"].includes(data.source_comparison.status) ||
          data.source_comparison.synthetic !== true ||
          data.source_comparison.validated_forecast !== false ||
          data.source_comparison.operational_actions_enabled !== false ||
          !Array.isArray(data.source_comparison.groups) ||
          !Array.isArray(data.reasons) || !Array.isArray(data.recommendation_draft) ||
          data.playbook?.version !== "AEGIS-URBAN-FLOOD-EXERCISE-v0.1" ||
          data.playbook.operational_actions_enabled !== false ||
          data.playbook.generated_by !== "deterministic_exercise_checklist_not_ai_forecast" ||
          !Array.isArray(data.playbook.synthetic_evidence_ids) ||
          !Array.isArray(data.playbook.synthetic_source_ids)) {
        throw new Error("Assessment classification not verified");
      }
      if (!controller.signal.aborted) {
        setResult(data);
        setCheckedAt(new Date().toISOString());
      }
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unavailable");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [incidentId, radius, revision]);

  const counts = result?.source_freshness_counts;
  const checks = result && counts ? [
    { ok: counts.fresh > 0, label: t("Current-window demo feeds"), pass: t("Present"), fail: t("None in window") },
    { ok: counts.stale + counts.no_data + counts.clock_anomaly === 0, label: t("Stale, empty or clock-anomaly feeds"), pass: t("None"), fail: t("Needs attention") },
    { ok: result.synthetic_evidence_records > 0, label: t("Synthetic evidence records"), pass: t("Present"), fail: t("None attached") },
    { ok: result.fictional_assets_nearby > 0, label: t("Nearby fictional assets"), pass: t("Present"), fail: t("None nearby") },
    { ok: result.source_comparison.status === "agreement", label: t("Explicit source comparison"), pass: t("Agreement"), fail: result.source_comparison.status === "disagreement" ? t("Disagreement") : t("Not comparable") },
  ] : [];
  const radiusOptions = rad.map(value => ({ value: String(value), label: `${value / 1000} km` }));

  return <Panel id="readiness" className="mt-5 overflow-hidden" title={t("Human Assessment Readiness")} icon={BrainCircuit}
    description={t("Synthetic evidence checks, not a flood prediction")}
    actions={<>
      <InlineHelp label={t("About this checklist")}>{t("A deterministic checklist of simulated inputs. It does not forecast anything, and approval is still required from an independent human reviewer.")}</InlineHelp>
      <Button size="sm" type="button" disabled={busy} onClick={() => setRevision(n => n + 1)}>
        <RefreshCw size={16} aria-hidden="true" className={busy ? "animate-spin" : ""}/> {t("Recheck")}
      </Button>
    </>}>
    <div className="flex gap-3 border-b border-amber-500/25 bg-amber-500/10 px-5 py-4 text-xs leading-6 text-amber-800 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 shrink-0" size={19} aria-hidden="true"/>
      <p><strong>{t("Exercise-only analysis.")}</strong> {t("No validated flood probability, verified infrastructure damage, automated response order or authority to send warnings is produced.")}</p>
    </div>
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <span className="text-xs font-semibold text-muted">{t("Search radius")}</span>
      <SegmentedControl label={t("Search radius")} options={radiusOptions} value={String(radius)} onChange={value => setRadius(Number(value) as typeof radius)}/>
      <span className="text-xs text-muted" role="status">
        {busy ? t("Checking synthetic records...") : result ? t("Readiness checklist available; human review required") : t("No result")}
      </span>
    </div>
    {busy && !result && <div className="px-5 pb-5"><SkeletonRegion label={t("Checking synthetic records...")}>
      <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-20"/><Skeleton className="h-20"/><Skeleton className="h-20"/></div>
    </SkeletonRegion></div>}
    {error && <div className="px-5 pb-4"><ErrorState message={`${t(error)}. ${t("No simulated conclusion is available.")}`} onRetry={() => setRevision(n => n + 1)}/></div>}
    {result && <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div className="rounded-lg border border-stroke bg-elevated/40 p-4 lg:col-span-2">
        <h4 className="text-sm font-bold">{t("Context and limits")}</h4>
        <dl className="mt-3 space-y-2 text-xs leading-6 text-muted">
          <div><dt className="inline font-semibold">{t("Freshness evaluated at")}: </dt><dd className="inline"><time dateTime={result.reference_time}>{result.reference_time}</time> {t("(synthetic observations, not live sensors)")}</dd></div>
          <div><dt className="inline font-semibold">{t("Checklist retrieved")}: </dt><dd className="inline"><time dateTime={checkedAt}>{checkedAt}</time> {t("(browser time; does not refresh observations)")} <DataFreshness observedAt={checkedAt}/></dd></div>
          <div><dt className="inline font-semibold">{t("Checklist version")}: </dt><dd className="inline">{result.checklist_version}</dd></div>
        </dl>
        <p className="mt-3 text-xs font-semibold">{t("Not established by this checklist")}</p>
        <ul className="mt-2 space-y-1 text-xs leading-6 text-muted">
          {result.unknowns.map(item => <li key={item} className="flex items-start gap-2"><CircleHelp size={14} aria-hidden="true" className="mt-1 shrink-0"/><span>{item}</span></li>)}
        </ul>
        <p className="mt-3 text-sm"><strong>{t("Next human review step")}:</strong> {result.next_review_step}</p>
        <div className="mt-4 rounded-lg border border-stroke bg-surface p-3 text-xs leading-6">
          <p className="font-semibold">{t("Explicit source comparison")}: {codeLabel(result.source_comparison.status)}</p>
          {result.source_comparison.groups.map(group => <p className="mt-1 text-muted" key={group.comparison_group}>
            {group.comparison_group}: {codeLabel(group.status)} · {t("tolerance")} {group.tolerance} {group.metric_unit}
            {group.value_range === null ? "" : ` · ${t("observed range")} ${group.value_range} ${group.metric_unit}`} · {group.source_ids.length} {t("cited sources")}
          </p>)}
          <p className="mt-2 text-muted">{result.source_comparison.note}</p>
        </div>
        <Link href="/sources" className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent">{t("Inspect source history")} <ArrowRight size={14} aria-hidden="true"/></Link>
      </div>
      <div>
        <h4 className="flex items-center gap-2 text-sm font-bold">
          {result.context_state === "insufficient_simulated_context" ?
            <AlertTriangle size={18} aria-hidden="true" className="text-amber-500"/> :
            <CheckCircle2 size={18} aria-hidden="true" className="text-accent"/>}
          {result.context_state === "insufficient_simulated_context" ?
            t("Insufficient simulated context") :
            t("Simulated context available — human interpretation required")}
        </h4>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatTile index={0} label={t("Current-window demo feeds")} value={result.source_freshness_counts.fresh} tone="success"/>
          <StatTile index={1} label={t("Delayed demo feeds")} value={result.source_freshness_counts.delayed} tone={result.source_freshness_counts.delayed ? "warning" : "neutral"}/>
          <StatTile index={2} label={t("Stale demo feeds")} value={result.source_freshness_counts.stale} tone={result.source_freshness_counts.stale ? "warning" : "neutral"}/>
          <StatTile index={3} label={t("Feeds without data")} value={result.source_freshness_counts.no_data} tone={result.source_freshness_counts.no_data ? "warning" : "neutral"}/>
          <StatTile index={4} label={t("Feeds with clock anomalies")} value={result.source_freshness_counts.clock_anomaly} tone={result.source_freshness_counts.clock_anomaly ? "danger" : "neutral"}/>
          <StatTile index={5} label={t("Synthetic evidence records")} value={result.synthetic_evidence_records} tone="info"/>
          <StatTile index={6} label={t("Nearby fictional assets")} value={result.fictional_assets_nearby} tone="info"/>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">{t("These are simulation record counts, not hazard probabilities or verified exposure counts.")}</p>
        <h4 className="mt-5 text-sm font-bold">{t("Input checks")}</h4>
        <ul className="mt-2 space-y-2">
          {checks.map(check => <li key={check.label} className="flex items-start gap-2 rounded-lg border border-stroke p-3 text-xs">
            {check.ok ? <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300"/> : <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"/>}
            <span className="min-w-0 flex-1">{check.label}</span>
            <StatusPill tone={check.ok ? "success" : "warning"}>{check.ok ? check.pass : check.fail}</StatusPill>
          </li>)}
        </ul>
        <p className="mt-2 text-xs leading-5 text-muted">{t("A passing input check only means simulated records are present. It never means the situation is safe or that a forecast exists.")}</p>
        {result.review_brief && <ExerciseReviewBrief brief={result.review_brief}/>}
        <LocalReviewFocus incidentId={incidentId}/>
      </div>
      <div>
        <h4 className="text-sm font-bold">{t("Why these checks matter")}</h4>
        <ul className="mt-3 space-y-2">
          {result.reasons.map(item => <li className="rounded-lg border border-stroke p-3 text-xs leading-6 text-muted" key={item.code}>{item.description}</li>)}
        </ul>
      </div>
      <div className="rounded-lg border border-stroke bg-elevated/40 p-4 lg:col-span-2">
        <h4 className="text-sm font-bold">{t("Human exercise-review checklist")}</h4>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6 text-muted">
          {result.recommendation_draft.map(step => <li key={step}>{step}</li>)}
        </ol>
        <p className="mt-3 text-xs text-muted">{t("Static safety guidance, not a machine-issued emergency action or automatically generated forecast.")}</p>
        <div className="mt-4 rounded-lg border border-stroke bg-surface p-3 text-xs leading-6 text-muted">
          <p className="font-semibold text-ink">{t("Traceable teaching references")}</p>
          <p className="mt-1">{t("Playbook")}: {result.playbook.version} · {codeLabel(result.playbook.status)}</p>
          <p className="mt-1">{result.playbook.synthetic_evidence_ids.length} {t("synthetic case evidence IDs and")} {result.playbook.synthetic_source_ids.length} {t("synthetic source IDs cited.")}</p>
          <p className="mt-1 break-all font-mono text-[11px]">{result.playbook.synthetic_evidence_ids.join(" · ") || t("No case evidence reference available")}</p>
          <Link href="/playbooks" className="mt-2 inline-flex min-h-9 items-center gap-1 font-semibold text-accent">{t("Read referenced playbook")} <ArrowRight size={14} aria-hidden="true"/></Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" type="button" onClick={() => void copyExerciseReview()}>
            {t("Copy synthetic review rationale")}
          </Button>
          <Link href="/approvals" className={buttonClass({ size: "sm" })}><ClipboardCheck size={16} aria-hidden="true"/> {t("Open verified exercise approvals")} <ArrowRight size={15} aria-hidden="true"/></Link>
          {copyResult && <span role="status" className="text-xs text-muted">{copyResult}</span>}
        </div>
      </div>
    </div>}
  </Panel>;
}
