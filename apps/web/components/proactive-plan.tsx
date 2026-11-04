"use client";

import { useEffect, useState } from "react";
import { Activity, MapPinned, ShieldAlert } from "lucide-react";
import { useT } from "./language-provider";
import { EmptyState, ErrorState, SkeletonRows, StatusPill, type Tone } from "./ui";
import { formatIst } from "../lib/earth-watch";
import {
  cleanObservability, cleanPlan, PLAN_LABEL, type NodeStatus, type PlanReason, type PrepositioningPlan, type RunObservability, type RunStep,
} from "../lib/proactive";

const short = (id: string) => id.slice(0, 8);
const REASON_TEXT: Record<PlanReason, string> = {
  run_blocked: "The judgment was blocked, so no plan was prepared.",
  no_exposure: "No exposure layer was cited for this run, so the planner abstained.",
  no_critical_facilities: "No critical facilities were cited in the footprint, so the planner abstained.",
  no_staging_points: "No facility or shelter could serve as a staging point, so the planner abstained.",
  no_available_teams: "No synthetic team with a matching capability is available at the trigger time.",
  exposure_unavailable: "The exposure layer could not be read, so the planner abstained.",
  teams_unavailable: "The synthetic team fixture could not be read, so the planner abstained.",
};
const STEP_LABEL: Record<RunStep, string> = {
  gather_evidence: "Gather evidence", simulate_variants: "Simulate variants", judge: "Judge", draft_cap: "Draft CAP",
  plan_prepositioning: "Plan pre-positioning", hand_to_human: "Hand to human",
};
const NODE_TONE: Record<NodeStatus, Tone> = { done: "success", next: "info", pending: "neutral", blocked: "danger" };
const fmtMs = (value: number | null) => value === null ? "—" : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
const outcomeText = (value: string | null) => value ? value.replace(/_/g, " ") : "—";

function useRunResource<T>(path: string | null, clean: (value: unknown) => T, refreshKey: string) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  useEffect(() => {
    if (!path) { setData(null); setState("idle"); return; }
    const controller = new AbortController();
    setState("loading");
    fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 409) { setData(null); setState("missing"); return; }
        if (!response.ok) throw new Error("load");
        setData(clean(await response.json())); setState("ready");
      })
      .catch(() => { if (!controller.signal.aborted) { setData(null); setState("error"); } });
    return () => controller.abort();
  }, [path, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, state };
}

/** A5 plan panel. Read-only: no control here moves, notifies or tasks a team. */
export function RunPlanPanel({ runId, refreshKey, sample = false }: Readonly<{ runId: string; refreshKey: string; sample?: boolean }>) {
  const t = useT();
  const { data, state } = useRunResource<PrepositioningPlan>(sample ? null : `/api/proactive/runs/${runId}/plan`, cleanPlan, refreshKey);
  if (sample || state === "idle" || state === "missing") return null;
  return <div className="space-y-3 rounded-xl border border-stroke p-4" role="group" aria-labelledby="plan-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 id="plan-title" className="flex items-center gap-2 text-sm font-bold"><MapPinned size={16} aria-hidden="true"/>{t("Pre-positioning options")}</h4>
      <StatusPill tone="sample">{t("estimated, synthetic")}</StatusPill>
    </div>
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold leading-5 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true"/>{t(PLAN_LABEL)}. {t("Any task still needs an approved proposal.")}</p>
    {state === "loading" && <SkeletonRows rows={2} label={t("Loading plan")}/>}
    {state === "error" && <ErrorState message={t("The plan could not be loaded.")}/>}
    {data && data.status === "abstained" && <EmptyState icon={MapPinned} title={t("No plan prepared")} body={t(data.reason ? REASON_TEXT[data.reason] : "The planner abstained.")}/>}
    {data && data.status === "planned" && <>
      <p className="text-[11px] text-muted">{t("Travel time: straight line × road factor at a fixed speed")} ({data.road_factor ?? "—"} × · {data.speed_kmh ?? "—"} km/h) · {t("Search")}: {data.search_method === "exact" ? t("exact") : t("greedy fallback")} · {t("Synthetic teams")}: {data.cited_team_ids.join(", ")}</p>
      <ol className="space-y-3">{data.options.map(option => <li key={option.rank} className="rounded-lg border border-stroke p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill tone={option.rank === 1 ? "info" : "neutral"}>{t("Option")} {option.rank}</StatusPill>
          <span>{t("Covers")} <strong className="tabular-nums">{option.covered}/{option.critical_total}</strong> {t("critical facilities")}</span>
          <span>· {t("Worst travel")} <strong className="tabular-nums">{option.max_minutes} min</strong></span>
          <span className="text-muted">· {t("Team move")} ≤ {option.max_preposition_minutes} min</span>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">{t("Option")} {option.rank}</caption>
            <thead><tr className="text-muted"><th scope="col" className="py-1 pr-3">{t("Team")}</th><th scope="col" className="pr-3">{t("Staging point")}</th><th scope="col" className="pr-3">{t("Team move")}</th><th scope="col">{t("Covers")}</th></tr></thead>
            <tbody>{option.assignments.map(a => <tr key={a.team_id} className="border-t border-stroke">
              <td className="py-1 pr-3"><span className="font-semibold">{a.team_label}</span> <code className="text-muted">{a.team_id}</code></td>
              <td className="pr-3">{t(a.staging_kind)} <code className="text-muted" title={a.staging_feature_id}>{short(a.staging_feature_id)}</code></td>
              <td className="pr-3 tabular-nums">{a.preposition_minutes} min</td>
              <td>{a.covers.length === 0 ? <span className="text-muted">{t("reserve")}</span> : a.covers.map(c => <code key={c.feature_id} className="mr-2" title={c.feature_id}>{short(c.feature_id)} · {c.minutes}m</code>)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {option.uncovered_feature_ids.length > 0 && <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">{t("Not covered within capacity")}: {option.uncovered_feature_ids.map(short).join(", ")}</p>}
      </li>)}</ol>
    </>}
  </div>;
}

/** Compact step graph with a table fallback. Static under reduced motion (no animation is used). */
export function RunTimeline({ runId, refreshKey, sample = false }: Readonly<{ runId: string; refreshKey: string; sample?: boolean }>) {
  const t = useT();
  const [showTable, setShowTable] = useState(false);
  const { data, state } = useRunResource<RunObservability>(sample ? null : `/api/proactive/runs/${runId}/observability`, cleanObservability, refreshKey);
  if (sample || state === "idle" || state === "missing") return null;
  const top = Math.max(1, ...(data?.nodes ?? []).map(n => n.duration_ms ?? 0));
  return <div className="space-y-3 rounded-xl border border-stroke p-4" role="group" aria-labelledby="timeline-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 id="timeline-title" className="flex items-center gap-2 text-sm font-bold"><Activity size={16} aria-hidden="true"/>{t("Run timeline")}</h4>
      <button type="button" className="control !min-h-9 text-xs" onClick={() => setShowTable(v => !v)} aria-expanded={showTable} aria-controls="timeline-table">{showTable ? t("Show graph") : t("Show table")}</button>
    </div>
    {state === "loading" && <SkeletonRows rows={2} label={t("Loading timeline")}/>}
    {state === "error" && <ErrorState message={t("The run timeline could not be loaded.")}/>}
    {data && <>
      <p className="text-xs" role="status">{t("Step budget")}: <strong className="tabular-nums">{data.budget_used}/{data.step_budget}</strong> {t("used")} · {data.budget_remaining} {t("remaining")} · {t("Step time")} {fmtMs(data.total_step_ms)}
        {Object.values(data.sentinel_flags).some(n => n > 0) && <> · {t("Evidence change flags")}: {Object.entries(data.sentinel_flags).filter(([, n]) => n > 0).map(([name, n]) => `${t(name)} ${n}`).join(", ")}</>}</p>
      {data.cancellation && <p className="text-xs text-rose-700 dark:text-rose-300">{t("Cancelled by")} {t(data.cancellation.by_kind)}: {data.cancellation.reason}</p>}
      {!showTable && <ol className="space-y-1.5" aria-label={t("Run steps")}>{data.nodes.map(node => <li key={node.step} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-[11px]">
        <span className="truncate font-semibold">{t(STEP_LABEL[node.step])}</span>
        <span className="h-2 rounded-full bg-elevated" aria-hidden="true"><span className={`block h-2 rounded-full ${node.status === "done" ? "bg-emerald-500" : node.status === "blocked" ? "bg-rose-500" : node.status === "next" ? "bg-accent" : "bg-muted/30"}`}
          style={{ width: node.status === "done" ? `${Math.max(4, Math.round(((node.duration_ms ?? 0) / top) * 100))}%` : "4%" }}/></span>
        <span className="flex items-center gap-1"><StatusPill tone={NODE_TONE[node.status]}>{t(node.status)}</StatusPill><span className="tabular-nums text-muted">{fmtMs(node.duration_ms)}</span></span>
      </li>)}</ol>}
      {showTable && <div id="timeline-table" className="overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{t("Run timeline")}</caption>
          <thead><tr className="text-muted"><th scope="col" className="py-1 pr-2">{t("Event")}</th><th scope="col" className="pr-2">{t("Finished")}</th><th scope="col" className="pr-2">{t("Duration")}</th><th scope="col" className="pr-2">{t("Actor")}</th><th scope="col" className="pr-2">{t("Outcome")}</th><th scope="col">{t("Budget")}</th></tr></thead>
          <tbody>{data.events.map((event, index) => <tr key={`${event.step}-${index}`} className="border-t border-stroke">
            <td className="py-1 pr-2">{event.step in STEP_LABEL ? t(STEP_LABEL[event.step as RunStep]) : t(outcomeText(event.step))}</td>
            <td className="pr-2">{formatIst(event.finished_at)}</td><td className="pr-2 tabular-nums">{fmtMs(event.duration_ms)}</td>
            <td className="pr-2">{t(event.actor_kind)}</td><td className="pr-2">{t(outcomeText(event.outcome))}</td>
            <td className="tabular-nums">{event.budget_used}/{data.step_budget}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {data.scheduler_ticks && data.scheduler_ticks.length > 0 && <details className="text-[11px]">
        <summary className="cursor-pointer font-semibold">{t("Recent scheduler ticks")}</summary>
        <table className="data-table mt-1">
          <thead><tr className="text-muted"><th scope="col" className="pr-2">{t("Started")}</th><th scope="col" className="pr-2">{t("Duration")}</th><th scope="col" className="pr-2">{t("Outcome")}</th><th scope="col">{t("Runs started")}</th></tr></thead>
          <tbody>{data.scheduler_ticks.map(tick => <tr key={tick.id} className="border-t border-stroke"><td className="pr-2">{formatIst(tick.started_at)}</td>
            <td className="pr-2 tabular-nums">{fmtMs(tick.duration_ms ?? null)}</td><td className="pr-2">{t(outcomeText(tick.outcome))}</td><td className="tabular-nums">{tick.runs_started}</td></tr>)}</tbody>
        </table>
      </details>}
    </>}
  </div>;
}
