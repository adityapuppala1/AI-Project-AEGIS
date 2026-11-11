"use client";

import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, BarChart3, Binary, BrainCircuit, CheckCircle2, Database, FlaskConical, ShieldAlert, ShieldCheck } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ModelReport } from "../lib/model-lab";
import { useT } from "./language-provider";
import { InlineHelp, ResponsiveTable, StatStrip, StatTile } from "./ui";

const fraction = (value: number) => (value * 100).toFixed(1) + "%";

export function ModelLabDashboard({ report }: { report: ModelReport }) {
  const t = useT();
  const metrics = report.metrics;
  const matrix = metrics.confusion_matrix;
  const bins = metrics.illustrative_calibration_bins
    .filter(value => value.count > 0)
    .map(value => ({
      label: value.interval[0].toFixed(1) + "–" + value.interval[1].toFixed(1),
      mean_score: value.mean_score === null ? null : Number((value.mean_score * 100).toFixed(2)),
      positive_fraction: value.positive_fraction === null ? null : Number((value.positive_fraction * 100).toFixed(2)),
      count: value.count,
    }));
  return <>
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"/>
      <div>
        <p className="text-sm font-bold text-amber-800 dark:text-amber-200">SIMULATION ONLY — never a real flood forecast</p>
        <p className="mt-1 text-xs leading-6 text-amber-800 dark:text-amber-200">
          All observations and labels were algorithmically generated. These held-out metrics
          demonstrate a reproducible testing pipeline, <strong>not predictive skill in Hyderabad,
          calibrated disaster probabilities, or clearance for emergency decisions</strong>.
        </p>
      </div>
    </div>

    <StatStrip label={t("Synthetic evaluation summary")} className="xl:grid-cols-4">
      <StatTile index={0} label={t("Holdout scenarios")} icon={Database} tone="info" value={String(report.holdout_group_count)} hint={metrics.holdout_count + " fully synthetic cases"}/>
      <StatTile index={1} label={t("Synthetic accuracy")} icon={BarChart3} tone="neutral" value={fraction(metrics.accuracy)} hint={t("Only against generated labels")}/>
      <StatTile index={2} label={t("Synthetic ROC AUC")} icon={Activity} tone="neutral" value={metrics.roc_auc.toFixed(3)} hint={t("Not real-world ranking skill")}/>
      <StatTile index={3} label={t("Synthetic Brier error")} icon={BrainCircuit} tone="neutral" value={metrics.brier_score.toFixed(3)} hint={t("Lower is better on this fixture only")}/>
    </StatStrip>
    <InlineHelp className="mb-5" label={t("What this does and does not show")}>
      {t("These numbers check that the offline test pipeline runs the same way every time on generated cases. They do not show how well anything would work on real events, and they must not be used for any warning or dispatch decision.")}
    </InlineHelp>

    <section className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(315px,.9fr)]">
      <article className="panel min-w-0 overflow-hidden">
        <div className="panel-heading">
          <div><h2 className="flex items-center gap-2 t-title"><FlaskConical size={19} className="text-accent"/> Illustrative score reliability</h2>
            <p className="mt-1 text-xs leading-5 text-muted">Synthetic holdout only · small bins do not establish calibration</p></div>
          <span className="rounded-full bg-elevated px-3 py-1 text-[11px] font-semibold text-muted">5 score bins</span>
        </div>
        <div className="h-[280px] w-full px-2 pb-4 pt-5 sm:px-5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={bins} margin={{ top: 6, right: 12, bottom: 8, left: -15 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--chart-grid) / .22)" strokeDasharray="3 4"/>
              <XAxis dataKey="label" tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false}/>
              <YAxis domain={[0,100]} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ background: "rgb(var(--chart-tooltip))", border: "1px solid rgb(var(--stroke))", borderRadius: 10, color: "#f3f7fc" }}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Line type="linear" dataKey="mean_score" name="Mean synthetic model score (%)" stroke="rgb(var(--accent))" strokeWidth={2.5} dot={{r:4}} isAnimationActive={false}/>
              <Line type="linear" dataKey="positive_fraction" name="Generated positive label fraction (%)" stroke="rgb(var(--signal))" strokeWidth={2.5} dot={{r:4}} isAnimationActive={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <details className="border-t border-stroke px-5 py-4">
          <summary className="cursor-pointer text-sm font-semibold">Show underlying score-bin table</summary>
          <div className="mt-3">
            <ResponsiveTable label={t("Score-bin table")} caption="Generated holdout scores versus synthetic labels by bin" className="[&>table]:min-w-[400px] [&>table]:text-left [&>table]:text-xs">
              <thead className="text-muted"><tr><th className="p-2">Score bin</th><th className="p-2">Cases</th><th className="p-2">Mean score</th><th className="p-2">Generated positives</th></tr></thead>
              <tbody className="divide-y divide-stroke">{metrics.illustrative_calibration_bins.map(value => <tr key={value.bin}>
                <td className="p-2 tabular-nums">{value.interval.join("–")}</td>
                <td className="p-2 tabular-nums">{value.count}</td>
                <td className="p-2 tabular-nums">{value.mean_score === null ? "N/A" : fraction(value.mean_score)}</td>
                <td className="p-2 tabular-nums">{value.positive_fraction === null ? "N/A" : fraction(value.positive_fraction)}</td>
              </tr>)}</tbody>
            </ResponsiveTable>
          </div>
        </details>
      </article>
      <article className="panel overflow-hidden" aria-label="Synthetic holdout confusion matrix">
        <div className="panel-heading"><h2 className="flex items-center gap-2 t-title"><Binary size={18} className="text-accent"/> Classification breakdown</h2></div>
        <div className="p-5">
          <p className="text-xs leading-5 text-muted">Threshold: {report.model_configuration.threshold}. Counts compare model outputs against artificially generated labels.</p>
          <ResponsiveTable className="mt-4 [&>table]:min-w-0 [&>table]:text-center [&>table]:text-xs" label={t("Confusion matrix table")} caption="Synthetic holdout confusion matrix">
            <thead><tr><th scope="col" className="p-2 text-left text-muted">Prediction</th><th scope="col" className="p-2 text-muted">Generated positive</th><th scope="col" className="p-2 text-muted">Generated negative</th></tr></thead>
            <tbody>
              <tr><th scope="row" className="p-2 text-left text-muted">Positive</th><td className="rounded-lg bg-accent/10 p-3 font-bold tabular-nums">{matrix.true_positive}</td><td className="rounded-lg bg-amber-500/10 p-3 font-bold tabular-nums">{matrix.false_positive}</td></tr>
              <tr><th scope="row" className="p-2 text-left text-muted">Negative</th><td className="rounded-lg bg-amber-500/10 p-3 font-bold tabular-nums">{matrix.false_negative}</td><td className="rounded-lg bg-accent/10 p-3 font-bold tabular-nums">{matrix.true_negative}</td></tr>
            </tbody>
          </ResponsiveTable>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-stroke pt-4 text-xs">
            <div><dt className="text-muted">Precision (synthetic)</dt><dd className="mt-1 text-lg font-bold tabular-nums">{fraction(metrics.precision)}</dd></div>
            <div><dt className="text-muted">Recall (synthetic)</dt><dd className="mt-1 text-lg font-bold tabular-nums">{fraction(metrics.recall)}</dd></div>
            <div><dt className="text-muted">F1 (synthetic)</dt><dd className="mt-1 text-lg font-bold tabular-nums">{metrics.f1.toFixed(3)}</dd></div>
            <div><dt className="text-muted">Constant-baseline Brier</dt><dd className="mt-1 text-lg font-bold tabular-nums">{metrics.constant_baseline_brier.toFixed(3)}</dd></div>
          </dl>
        </div>
      </article>
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <article className="panel p-4">
        <p className="eyebrow">Dataset provenance</p>
        <h2 className="mt-3 text-base font-bold">Reproducible event-group holdout</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
          <p><strong className="text-ink">{report.dataset_count} generated cases</strong> across 24 artificial scenario groups. Entire groups are assigned to training or holdout; cases from one group never cross partitions.</p>
          <p>Training: {report.train_count} generated cases, {report.train_group_count} groups. Holdout: {metrics.holdout_count} cases, {report.holdout_group_count} groups. No official incident labels, public weather records or private data were used.</p>
          <p>Method: logistic regression trained offline using batch gradient descent and L2 regularization. The evaluation is repeatable from a fixed synthetic generator seed.</p>
        </div>
        <p className="mt-4 break-all rounded-lg bg-elevated px-3 py-2 font-mono text-[11px] text-muted" title="Synthetic dataset SHA-256">Dataset SHA-256: {report.dataset_sha256}</p>
        <p className="mt-3 text-[11px] font-semibold text-muted">Model: {report.model_version}</p>
      </article>
      <article className="panel p-4">
        <p className="eyebrow">Human-controlled decision boundary</p>
        <h2 className="mt-3 flex items-center gap-2 text-base font-bold"><ShieldCheck className="text-accent" size={20}/> Not operationally qualified</h2>
        <div className="mt-4 space-y-3">
          {report.limitations.map(value => <p key={value} className="flex items-start gap-2 text-sm leading-6 text-muted"><AlertTriangle size={16} className="mt-1 shrink-0 text-amber-500"/>{value}</p>)}
        </div>
        <p className="mt-4 rounded-lg border border-stroke bg-elevated/50 p-4 text-xs leading-6 text-muted">
          A synthetic holdout is useful for verifying software reproducibility, evaluation logic and transparent UX—but it cannot validate a flood model. Real deployment requires an independent, permissioned historical dataset; temporal and geographic holdout; calibration; uncertainty analysis; security review; and accountable agency approval.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/incidents" className="control control-sm"><Database size={15}/> Exercise incidents <ArrowRight size={15}/></Link>
          <Link href="/playbooks" className="control control-sm"><CheckCircle2 size={15}/> Response playbooks <ArrowRight size={15}/></Link>
        </div>
      </article>
    </div>
  </>;
}
