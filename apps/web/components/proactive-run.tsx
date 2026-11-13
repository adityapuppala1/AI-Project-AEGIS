"use client";

import { codeLabel } from "../lib/labels";
import { SortableTable, Button, Panel, buttonClass } from "./ui";
import { useCallback, useEffect, useState } from "react";
import { Ban, Check, CheckCircle2, Copy, Download, FileText, Gavel, Loader2, Play, ShieldAlert, StepForward, UserCheck, type LucideIcon } from "lucide-react";
import { useT } from "./language-provider";
import { ExposureCounts, ImpactChip, SampleChip } from "./watch-parts";
import { RunPlanPanel, RunTimeline } from "./proactive-plan";
import { StatusPill, type Tone } from "./ui";
import { formatIst } from "../lib/earth-watch";
import { SAMPLE_CAP_TEXT, sampleRunAt } from "../lib/proactive-sample";
import {
  BAND_LABEL, BAND_POLICY, BAND_STYLE, RUN_STEPS, barWidth, capFilename, openRunFor, pct, previewLines,
  type DecisionBand, type ProactiveRun, type Question, type RunStep, type SentinelFlagName,
} from "../lib/proactive";

const STEP_LABEL: Record<RunStep, string> = {
  gather_evidence: "Gather evidence", simulate_variants: "Simulate variants", judge: "Judge", draft_cap: "Draft CAP", plan_prepositioning: "Plan pre-positioning", hand_to_human: "Hand to human",
};
const STEP_CAPTION: Record<RunStep, string> = {
  gather_evidence: "Cited records for this trigger", simulate_variants: "Threshold what-ifs", judge: "Pick among fixed options", draft_cap: "Exercise CAP file", plan_prepositioning: "Recommendation only", hand_to_human: "Stops at a person",
};
const FLAG_LABEL: Record<SentinelFlagName, string> = { strengthened: "Evidence strengthened", weakened: "Evidence weakened", contradicted: "Evidence contradicts trigger", stale: "Evidence stale" };
const FLAG_TONE: Record<SentinelFlagName, Tone> = { strengthened: "warning", weakened: "info", contradicted: "danger", stale: "neutral" };
const BAND_ICON: Record<DecisionBand, LucideIcon> = { recommended: CheckCircle2, needs_review: UserCheck, blocked: Ban };
const humanise = (name: string) => codeLabel(name);

function Bars({ title, question }: Readonly<{ title: string; question: Question }>) {
  const t = useT();
  const entries = Object.entries(Object.keys(question.probabilities).length ? question.probabilities : question.values);
  const top = Math.max(...entries.map(([, value]) => value), 0);
  return <div className="rounded-lg border border-stroke p-3">
    <h4 className="text-xs font-bold">{title}</h4>
    {entries.length === 0 ? <p className="mt-2 text-[11px] text-muted">{t("No values returned.")}</p>
      : <ul className="mt-2 space-y-2">{entries.map(([name, value]) => <li key={name} className="text-[11px]">
        <div className="flex justify-between gap-2"><span className="min-w-0 break-words">{humanise(name)}</span><span className="tabular-nums font-semibold">{pct(value)}</span></div>
        <div className="mt-1 h-2 rounded-full bg-elevated" aria-hidden="true"><div className={`bar-grow h-2 rounded-full ${value === top ? "bg-accent" : "bg-muted/50"}`} style={{ width: barWidth(value) }}/></div>
      </li>)}</ul>}
  </div>;
}

function Stepper({ run, active, busy }: Readonly<{ run: ProactiveRun; active: boolean; busy: boolean }>) {
  const t = useT();
  const steps = run.steps ?? RUN_STEPS;
  const doneCount = run.completed_steps.length;
  const progress = Math.max(0, Math.min(1, doneCount / (steps.length - 1)));
  const lineStyle = (axis: "x" | "y") => ({ transform: axis === "x" ? `scaleX(${progress})` : `scaleY(${progress})` });
  return <ol className={`relative grid gap-4 sm:gap-2 ${steps.length === 6 ? "sm:grid-cols-6" : "sm:grid-cols-5"}`} aria-label={t("Run steps")}>
    <span className="absolute bottom-4 left-4 top-4 w-0.5 bg-stroke sm:hidden" aria-hidden="true"/>
    <span className="line-grow absolute bottom-4 left-4 top-4 w-0.5 origin-top bg-emerald-500 sm:hidden" style={lineStyle("y")} aria-hidden="true"/>
    <span className="absolute left-[10%] right-[10%] top-4 hidden h-0.5 bg-stroke sm:block" aria-hidden="true"/>
    <span className="line-grow absolute left-[10%] right-[10%] top-4 hidden h-0.5 bg-emerald-500 sm:block" style={lineStyle("x")} aria-hidden="true"/>
    {steps.map((step, index) => {
      const done = run.completed_steps.includes(step);
      const current = run.next_step === step && active;
      const blocked = !done && run.status === "cancelled";
      const status = done ? t("done") : current ? t("next") : blocked ? t("blocked") : t("pending");
      return <li key={step} aria-current={current ? "step" : undefined} className="reveal-in relative flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center" style={{ "--i": index } as React.CSSProperties}>
        <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-surface text-xs font-bold ${done ? "border-emerald-600 bg-emerald-600 text-white" : current ? "step-pulse border-accent text-accent" : blocked ? "border-rose-500 text-rose-700 dark:text-rose-300" : "border-stroke text-muted"}`}>
          {done ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path className="draw-check" d="M4 12.5l5 5L20 6.5"/></svg>
            : current && busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true"/>
            : blocked ? <Ban size={14} aria-hidden="true"/> : <span aria-hidden="true">{index + 1}</span>}
        </span>
        <span className="min-w-0"><span className="field-label">{t(STEP_LABEL[step])}</span>
          <span className="block text-[11px] text-muted">{t(STEP_CAPTION[step])}</span>
          <span className="sr-only">{status}</span></span>
      </li>;
    })}
  </ol>;
}

export function ProactiveRunPanel({ triggerEventId, triggerKey = null, canOperate, disabledReason, onRun, sample = false }: Readonly<{ triggerEventId: string; triggerKey?: string | null; canOperate: boolean; disabledReason: string; onRun?: (run: ProactiveRun | null) => void; sample?: boolean }>) {
  const t = useT();
  const [run, setRun] = useState<ProactiveRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [rationale, setRationale] = useState("");
  const [capFull, setCapFull] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A different trigger always starts from a clean slate; runs are never carried across selections.
  useEffect(() => { setRun(null); setMessage(""); setCancelling(false); setRationale(""); setCapFull(null); setCopied(false); }, [triggerEventId, sample]);

  useEffect(() => { onRun?.(run); }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume an open run for this trigger (for example one prepared by the scheduler). Read-only lookup;
  // a person still advances it. Nothing is started automatically.
  useEffect(() => {
    if (sample || !canOperate) return;
    const controller = new AbortController();
    fetch("/api/proactive/runs", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<{ runs: ProactiveRun[] }> : Promise.reject(new Error("runs")))
      .then(data => { const open = openRunFor(data.runs, triggerEventId, triggerKey); if (open) setRun(current => current ?? open); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [triggerEventId, triggerKey, sample, canOperate]);

  const post = useCallback(async (path: string, body: object): Promise<ProactiveRun | null> => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as ProactiveRun & { error?: string; code?: string };
      if (!response.ok) {
        setMessage(data.code === "proactive_paused" ? t("Proactive automation is paused by a platform administrator. Existing drafts stay readable and runs can still be cancelled.")
          : response.status === 409 ? t("The run changed or this step is not available. Reload the run state.") : data.error ?? t("Run request failed"));
        return null;
      }
      return data;
    } catch { setMessage(t("Run request failed")); return null; } finally { setBusy(false); }
  }, [t]);

  // In sample mode every step is local: no request is made and nothing is written.
  async function start() {
    if (sample) { setRun(sampleRunAt(0, triggerEventId)); return; }
    const next = await post("/api/proactive/runs", { trigger_event_id: triggerEventId }); if (next) setRun(next);
  }
  async function advance() {
    if (!run?.next_step) return;
    if (sample) { setRun(sampleRunAt(run.completed_steps.length + 1, triggerEventId)); return; }
    const next = await post(`/api/proactive/runs/${run.id}/advance`, { expected_step: run.next_step }); if (next) setRun(next);
  }
  async function cancel() {
    if (!run) return;
    if (sample) { setRun({ ...run, status: "cancelled", next_step: null }); setCancelling(false); setRationale(""); return; }
    const next = await post(`/api/proactive/runs/${run.id}/cancel`, { rationale });
    if (next) { setRun(next); setCancelling(false); setRationale(""); }
  }
  const capSha = run?.cap?.sha256;
  useEffect(() => {
    if (!run || !capSha) { setCapFull(null); return; }
    if (sample) { setCapFull(SAMPLE_CAP_TEXT); return; }
    const controller = new AbortController();
    fetch(`/api/proactive/runs/${run.id}/cap`, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.text() : Promise.reject(new Error("cap")))
      .then(setCapFull)
      .catch(() => { if (!controller.signal.aborted) setCapFull(null); });
    return () => controller.abort();
  }, [run?.id, capSha, sample]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyCap() {
    if (!capFull) return;
    try { await navigator.clipboard.writeText(capFull); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setMessage(t("Copy failed. Select the text and copy it manually.")); }
  }
  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_CAP_TEXT], { type: "application/xml" }));
    const link = document.createElement("a"); link.href = url; link.download = "indtrana-sample-exercise-cap.xml"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const judgment = run?.judgment ?? null;
  const active = run?.status === "running";
  const BandIcon = judgment ? BAND_ICON[judgment.decision_band] : ShieldAlert;
  return <Panel level={3} className="min-w-0" aria-labelledby="proactive-run-title" titleId="proactive-run-title" bodyClassName="p-0" icon={Gavel} title={t("Bounded run")}
    actions={<>{sample && <SampleChip/>}
      {!run && <Button variant="primary" type="button" onClick={start} disabled={!canOperate || busy} aria-describedby="run-reason">
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}{t("Start bounded run")}</Button>}</>}>
    <div className="space-y-4 p-5">
      {!run && !canOperate && <p id="run-reason" className="text-xs text-muted">{disabledReason}</p>}
      {!run && canOperate && <p id="run-reason" className="text-xs text-muted">{sample ? t("Sample walkthrough: each step reveals a pre-computed result. Nothing is requested or saved.") : t("A bounded run gathers cited evidence, simulates threshold variants, asks the judge to pick among fixed options and drafts an Exercise CAP file. It stops at a human.")}</p>}

      {run && <>
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold leading-5 text-amber-800 dark:text-amber-200" role="note">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true"/>
          {run.status === "review_ready" ? t("Stopped at a human. An accountable person must review the draft; IndTrana sends nothing.") : t("Exercise only. This run stops at a human and IndTrana sends nothing.")}</p>
        <Stepper run={run} active={active} busy={busy}/>
        <p className="text-xs text-muted" role="status" aria-live="polite">{t("Run status")}: <strong>{run.status === "running" ? t("running") : run.status === "review_ready" ? t("review ready") : t("cancelled")}</strong>{run.next_step ? ` · ${t("Next step")}: ${t(STEP_LABEL[run.next_step])}` : ""}</p>

        {run.impact && <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("Impact")}><ImpactChip impact={run.impact}/><ExposureCounts impact={run.impact} compact/></div>}
        {run.origin === "scheduler" && <p className="text-[11px] text-muted">{t("Prepared by the scheduler. Only a signed-in person can take the hand-off.")}</p>}
        {(run.sentinel_flags?.length ?? 0) > 0 && <div className="space-y-2" role="group" aria-label={t("Evidence change flags")}>
          <h4 className="text-xs font-bold">{t("Evidence change flags")}</h4>
          <ul className="space-y-1">{[...(run.sentinel_flags ?? [])].reverse().slice(0, 10).map((flag, index) =>
            <li key={`${flag.at ?? ""}-${index}`} className="flex flex-wrap items-center gap-2 text-[11px]">
              <StatusPill tone={FLAG_TONE[flag.flag]}>{t(FLAG_LABEL[flag.flag])}</StatusPill>
              <span className="text-muted">{formatIst(flag.at)} · {flag.evidence_ids.length} {t("cited records")}</span>
            </li>)}</ul>
          <p className="text-[11px] text-muted">{t("Flags compare newer evidence with this run. They never change the draft or CAP; review them before the hand-off.")}</p>
        </div>}

        {run.variants.length > 0 && <div className="reveal-in overflow-x-auto">
          <SortableTable label={t("Threshold variants")} minWidth="18rem" rows={run.variants} rowKey={variant => variant.id} columns={[
            { key: "variant", label: t("Variant"), sortValue: variant => variant.label, cell: variant => variant.label },
            { key: "delta", label: t("Threshold change"), numeric: true, sortValue: variant => variant.threshold_delta, cell: variant => (variant.threshold_delta > 0 ? "+" : "") + variant.threshold_delta },
            { key: "outcome", label: t("Outcome"), sortValue: variant => t(variant.resulting_state), cell: variant => t(variant.resulting_state) },
            { key: "score", label: t("Score"), numeric: true, sortValue: variant => variant.score, cell: variant => variant.score.toFixed(2) },
          ]}/>
        </div>}

        {judgment && <div className="reveal-in space-y-3 rounded-lg border border-stroke p-4" aria-label={t("Judgment")} role="group">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${judgment.provider === "typesafe_jev" ? "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300" : "bg-slate-500/10 text-slate-700 ring-slate-500/30 dark:text-slate-300"}`}>
              {judgment.provider === "typesafe_jev" ? t("Typesafe Jev") : t("Test double")} · {judgment.model}</span>
          </div>
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ring-1 ${BAND_STYLE[judgment.decision_band]}`}>
            <BandIcon size={28} className="shrink-0" aria-hidden="true"/>
            <div className="min-w-0"><p className="text-lg font-bold">{t(BAND_LABEL[judgment.decision_band])}</p>
              <p className="text-xs leading-5">{t(BAND_POLICY[judgment.decision_band])}</p></div>
          </div>
          <p className="text-sm leading-6">{t("Evidence supports option")} <strong>{humanise(judgment.playbook_option.choice) || t("none")}</strong> {t("with")} <strong>{pct(judgment.playbook_option.confidence)}</strong> {t("confidence")} — {t(BAND_LABEL[judgment.decision_band])}.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Bars title={t("Playbook option")} question={judgment.playbook_option}/>
            <Bars title={t("Severity band")} question={judgment.severity_band}/>
            <Bars title={t("Citations clean")} question={judgment.citation_clean}/>
            <Bars title={t("Staleness risk")} question={judgment.staleness_risk}/>
          </div>
        </div>}

        {run.cap && <div className="reveal-in space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-bold"><FileText size={16} aria-hidden="true"/>{t("Exercise CAP preview")}</h4>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" type="button" onClick={copyCap} disabled={!capFull}>{copied ? <Check size={14} aria-hidden="true"/> : <Copy size={14} aria-hidden="true"/>}{copied ? t("Copied") : t("Copy")}</Button>
              {sample ? <Button size="sm" type="button" onClick={downloadSample}><Download size={14} aria-hidden="true"/>{t("Download CAP draft")}</Button>
                : <a className={buttonClass({ size: "sm" })} href={`/api/proactive/runs/${run.id}/cap`} download={capFilename(run.id)}><Download size={14} aria-hidden="true"/>{t("Download CAP draft")}</a>}
            </div>
          </div>
          <p className="break-all text-[11px] text-muted">SHA-256 {run.cap.sha256}</p>
          {run.cap.languages.length > 0 && <div className="flex flex-wrap gap-2" aria-label={t("CAP language blocks")}>
            {run.cap.languages.map(item => <StatusPill key={item.language} tone={item.review_status === "pending" ? "warning" : item.review_status === "approved" ? "success" : "neutral"}>
              {item.language}: {item.review_status === "pending" ? t("pending native review") : item.review_status === "approved" ? t("native review signed off") : t("source text")}</StatusPill>)}
          </div>}
          <pre className="max-h-72 overflow-auto rounded-lg border border-stroke bg-elevated p-3 font-mono text-[11px] leading-5" tabIndex={0} aria-label={t("First 40 lines of the Exercise CAP draft")}><code>{capFull ? previewLines(capFull, 40) : t("Loading preview…")}</code></pre>
        </div>}

        <RunPlanPanel runId={run.id} refreshKey={`${run.completed_steps.length}-${run.status}`} sample={sample}/>
        <RunTimeline runId={run.id} refreshKey={`${run.completed_steps.length}-${run.status}`} sample={sample}/>

        {active && <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" type="button" onClick={advance} disabled={busy || !run.next_step}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <StepForward size={16} aria-hidden="true"/>}{t("Advance")}</Button>
          <Button type="button" onClick={() => setCancelling(open => !open)} aria-expanded={cancelling} aria-controls="run-cancel"><Ban size={16} aria-hidden="true"/>{t("Cancel run")}</Button>
        </div>}
        {cancelling && active && <div id="run-cancel" className="space-y-2">
          <label htmlFor="run-cancel-reason" className="field-label">{t("Cancellation rationale (10 to 2000 characters)")}</label>
          <textarea id="run-cancel-reason" className="field !h-24 py-2" value={rationale} maxLength={2000} onChange={event => setRationale(event.target.value)} aria-describedby="run-cancel-hint"/>
          <p id="run-cancel-hint" className="text-[11px] text-muted">{rationale.trim().length}/2000 · {t("Recorded in the run audit.")}</p>
          <Button variant="primary" type="button" onClick={cancel} disabled={busy || rationale.trim().length < 10}><Check size={16} aria-hidden="true"/>{t("Confirm cancellation")}</Button>
        </div>}
      </>}
      <div aria-live="polite" role="status" className="min-h-4 text-xs text-rose-700 dark:text-rose-300">{message}</div>
    </div>
  </Panel>;
}
