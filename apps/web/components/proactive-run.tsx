"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Download, FileText, Gavel, Loader2, Play, StepForward } from "lucide-react";
import { useT } from "./language-provider";
import {
  BAND_LABEL, BAND_POLICY, BAND_STYLE, RUN_STEPS, barWidth, capFilename, pct, previewLines,
  type ProactiveRun, type Question, type RunStep,
} from "../lib/proactive";

const STEP_LABEL: Record<RunStep, string> = {
  gather_evidence: "Gather evidence", simulate_variants: "Simulate variants", judge: "Judge", draft_cap: "Draft CAP", hand_to_human: "Hand to human",
};

function Bars({ title, question }: Readonly<{ title: string; question: Question }>) {
  const t = useT();
  const entries = Object.entries(Object.keys(question.probabilities).length ? question.probabilities : question.values);
  return <div className="rounded-lg border border-stroke p-3">
    <h4 className="text-xs font-bold">{title}</h4>
    {entries.length === 0 ? <p className="mt-2 text-[11px] text-muted">{t("No values returned.")}</p>
      : <ul className="mt-2 space-y-1.5">{entries.map(([name, value]) => <li key={name} className="text-[11px]">
        <div className="flex justify-between"><span>{name}</span><span className="tabular-nums">{pct(value)}</span></div>
        <div className="h-1.5 rounded-full bg-elevated" aria-hidden="true"><div className="h-1.5 rounded-full bg-accent" style={{ width: barWidth(value) }}/></div>
      </li>)}</ul>}
  </div>;
}

export function ProactiveRunPanel({ triggerEventId, canOperate, disabledReason, onRun }: Readonly<{ triggerEventId: string; canOperate: boolean; disabledReason: string; onRun?: (run: ProactiveRun | null) => void }>) {
  const t = useT();
  const [run, setRun] = useState<ProactiveRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [rationale, setRationale] = useState("");
  const [capText, setCapText] = useState<string | null>(null);

  // A different trigger always starts from a clean slate; runs are never carried across selections.
  useEffect(() => { setRun(null); setMessage(""); setCancelling(false); setRationale(""); setCapText(null); }, [triggerEventId]);

  useEffect(() => { onRun?.(run); }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = useCallback(async (path: string, body: object): Promise<ProactiveRun | null> => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as ProactiveRun & { error?: string; code?: string };
      if (!response.ok) { setMessage(response.status === 409 ? t("The run changed or this step is not available. Reload the run state.") : data.error ?? t("Run request failed")); return null; }
      return data;
    } catch { setMessage(t("Run request failed")); return null; } finally { setBusy(false); }
  }, [t]);

  async function start() { const next = await post("/api/proactive/runs", { trigger_event_id: triggerEventId }); if (next) setRun(next); }
  async function advance() { if (run?.next_step) { const next = await post(`/api/proactive/runs/${run.id}/advance`, { expected_step: run.next_step }); if (next) setRun(next); } }
  async function cancel() {
    if (!run) return;
    const next = await post(`/api/proactive/runs/${run.id}/cancel`, { rationale });
    if (next) { setRun(next); setCancelling(false); setRationale(""); }
  }
  const capSha = run?.cap?.sha256;
  useEffect(() => {
    if (!run || !capSha) { setCapText(null); return; }
    const controller = new AbortController();
    fetch(`/api/proactive/runs/${run.id}/cap`, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.text() : Promise.reject(new Error("cap")))
      .then(xml => setCapText(previewLines(xml, 40)))
      .catch(() => { if (!controller.signal.aborted) setCapText(null); });
    return () => controller.abort();
  }, [run?.id, capSha]); // eslint-disable-line react-hooks/exhaustive-deps

  const judgment = run?.judgment ?? null;
  const active = run?.status === "running";
  return <section className="panel min-w-0" aria-labelledby="proactive-run-title">
    <div className="panel-heading">
      <h3 id="proactive-run-title" className="flex items-center gap-2 text-base font-bold"><Gavel size={18} className="text-accent" aria-hidden="true"/>{t("Bounded run")}</h3>
      {!run && <button type="button" className="control control-primary" onClick={start} disabled={!canOperate || busy} aria-describedby="run-reason">
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}{t("Start bounded run")}</button>}
    </div>
    <div className="space-y-4 p-5">
      {!run && !canOperate && <p id="run-reason" className="text-xs text-muted">{disabledReason}</p>}
      {!run && canOperate && <p id="run-reason" className="text-xs text-muted">{t("A bounded run gathers cited evidence, simulates threshold variants, asks the judge to pick among fixed options and drafts an Exercise CAP file. It stops at a human.")}</p>}

      {run && <>
        <ol className="flex flex-wrap items-center gap-2" aria-label={t("Run steps")}>
          {RUN_STEPS.map((step, index) => {
            const done = run.completed_steps.includes(step);
            const current = run.next_step === step && active;
            return <li key={step} className="reveal-in flex items-center gap-2" style={{ "--i": index } as React.CSSProperties} aria-current={current ? "step" : undefined}>
              <span className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${done ? "border-emerald-500/40 bg-emerald-500/10" : current ? "border-accent bg-accent/10 text-accent" : "border-stroke text-muted"}`}>
                {done ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path className="draw-check" d="M4 12.5l5 5L20 6.5"/></svg> : <span className="h-3.5 w-3.5 rounded-full border border-current" aria-hidden="true"/>}
                {t(STEP_LABEL[step])}<span className="sr-only">{done ? ` ${t("done")}` : current ? ` ${t("next")}` : ""}</span>
              </span>
              {index < RUN_STEPS.length - 1 && <span className={`h-px w-4 ${done ? "bg-emerald-500" : "bg-stroke"}`} aria-hidden="true"/>}
            </li>;
          })}
        </ol>
        <p className="text-xs text-muted" role="status" aria-live="polite">{t("Run status")}: <strong>{run.status === "running" ? t("running") : run.status === "review_ready" ? t("review ready") : t("cancelled")}</strong>{run.next_step ? ` · ${t("Next step")}: ${t(STEP_LABEL[run.next_step])}` : ""}</p>

        {run.variants.length > 0 && <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{t("Threshold variants")}</caption>
            <thead><tr className="text-muted"><th scope="col" className="py-1 pr-3">{t("Variant")}</th><th scope="col" className="pr-3">{t("Threshold change")}</th><th scope="col" className="pr-3">{t("Outcome")}</th><th scope="col">{t("Score")}</th></tr></thead>
            <tbody>{run.variants.map(variant => <tr key={variant.id} className="border-t border-stroke"><td className="py-1 pr-3">{variant.label}</td>
              <td className="pr-3 tabular-nums">{variant.threshold_delta > 0 ? "+" : ""}{variant.threshold_delta}</td><td className="pr-3">{t(variant.resulting_state)}</td><td className="tabular-nums">{variant.score.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>}

        {judgment && <div className="reveal-in space-y-3 rounded-xl border border-stroke p-4" aria-label={t("Judgment")} role="group">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${judgment.provider === "typesafe_jev" ? "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300" : "bg-slate-500/10 text-slate-700 ring-slate-500/30 dark:text-slate-300"}`}>
              {judgment.provider === "typesafe_jev" ? t("Typesafe Jev") : t("Test double")} · {judgment.model}</span>
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${BAND_STYLE[judgment.decision_band]}`}>{t(BAND_LABEL[judgment.decision_band])}</span>
          </div>
          <p className="text-xs leading-5 text-muted">{t(BAND_POLICY[judgment.decision_band])}</p>
          <p className="text-xs"><strong>{t("Playbook option")}:</strong> {judgment.playbook_option.choice || t("none")} · {t("confidence")} {pct(judgment.playbook_option.confidence)}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Bars title={t("Playbook option")} question={judgment.playbook_option}/>
            <Bars title={t("Severity band")} question={judgment.severity_band}/>
            <Bars title={t("Citations clean")} question={judgment.citation_clean}/>
            <Bars title={t("Staleness risk")} question={judgment.staleness_risk}/>
          </div>
        </div>}

        {run.cap && <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-bold"><FileText size={16} aria-hidden="true"/>{t("Exercise CAP preview")}</h4>
            <a className="control" href={`/api/proactive/runs/${run.id}/cap`} download={capFilename(run.id)}><Download size={16} aria-hidden="true"/>{t("Download CAP draft")}</a>
          </div>
          <p className="break-all text-[11px] text-muted">SHA-256 {run.cap.sha256}</p>
          <pre className="max-h-72 overflow-auto rounded-xl bg-elevated p-3 text-[11px] leading-5" tabIndex={0} aria-label={t("First 40 lines of the Exercise CAP draft")}><code>{capText ?? t("Loading preview…")}</code></pre>
        </div>}

        {active && <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="control control-primary" onClick={advance} disabled={busy || !run.next_step}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <StepForward size={16} aria-hidden="true"/>}{t("Advance")}</button>
          <button type="button" className="control" onClick={() => setCancelling(open => !open)} aria-expanded={cancelling} aria-controls="run-cancel"><Ban size={16} aria-hidden="true"/>{t("Cancel run")}</button>
        </div>}
        {cancelling && active && <div id="run-cancel" className="space-y-2">
          <label htmlFor="run-cancel-reason" className="block text-xs font-bold">{t("Cancellation rationale (10 to 2000 characters)")}</label>
          <textarea id="run-cancel-reason" className="field !h-24 py-2" value={rationale} maxLength={2000} onChange={event => setRationale(event.target.value)} aria-describedby="run-cancel-hint"/>
          <p id="run-cancel-hint" className="text-[11px] text-muted">{rationale.trim().length}/2000 · {t("Recorded in the run audit.")}</p>
          <button type="button" className="control control-primary" onClick={cancel} disabled={busy || rationale.trim().length < 10}><Check size={16} aria-hidden="true"/>{t("Confirm cancellation")}</button>
        </div>}
        {run.status === "review_ready" && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("Stopped at a human. An accountable person must review the draft; AEGIS sends nothing.")}</p>}
      </>}
      <div aria-live="polite" role="status" className="min-h-4 text-xs text-rose-700 dark:text-rose-300">{message}</div>
    </div>
  </section>;
}
