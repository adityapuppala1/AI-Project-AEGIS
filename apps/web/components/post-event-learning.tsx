"use client";

import { PermissionState, Button } from "./ui";
import { pageRoles, refusalHome } from "../lib/roles";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, FileDiff, GitPullRequest, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { EmptyState, ErrorState, Panel, SkeletonRows, StatusPill } from "./ui";
import { useOperatorSession } from "../lib/use-operator-session";
import { SignInRequired } from "./sign-in-required";
import { SortableTable, HazardGlyph, RecordRef, TwoKey, formatAbsolute, keysForStatus } from "./ui";
import { apiFailureText, codeLabel, sentenceCase } from "../lib/labels";
import {
  cleanConfig, cleanProposal, cleanScenarios, cleanWindow, pctLabel,
  type ConfigView, type LearningWindow, type Proposal, type Scenario, call } from "../lib/learning";

const BASIS_LABEL: Record<string, string> = {
  synthetic_rehearsal: "Synthetic rehearsal", known_events_unreviewed: "Unreviewed catalogue labels", registered_protocol_labels: "Protocol-eligible labels",
};
const STATUS_TONE = { draft: "neutral", submitted: "warning", approved: "success", rejected: "danger" } as const;

/** A8: closed event windows, rehearsal statistics and maker-checker threshold proposals. Approval never applies. */
export function PostEventLearning() {
  const t = useT();
  const session = useOperatorSession();
  const roles = session?.roles ?? [];
  const isMaker = roles.includes("incident_operator");
  const isChecker = roles.includes("incident_checker") || roles.includes("platform_admin");
  const isAdmin = roles.includes("platform_admin");
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [windows, setWindows] = useState<LearningWindow[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState("");
  const [range, setRange] = useState({ start: "2000-08-01", end: "2000-08-31" });
  const [close, setClose] = useState({ hazard: "heavy_rain", start: "", end: "", days: "" });
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageFailed, setMessageFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cfg, win, prop, scen] = await Promise.all([
        call("/api/learning/config", cleanConfig),
        call("/api/learning/windows", v => (v as { windows?: unknown[] })?.windows?.map(cleanWindow).filter((w): w is LearningWindow => w !== null) ?? null),
        call("/api/learning/proposals", v => (v as { proposals?: unknown[] })?.proposals?.map(cleanProposal).filter((p): p is Proposal => p !== null) ?? null),
        call("/api/learning/scenarios", cleanScenarios),
      ]);
      setConfig(cfg); setWindows(win); setProposals(prop); setScenarios(scen.scenarios);
      setScenario(current => current || scen.scenarios[0]?.id || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Learning service unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (session?.authenticated) void load(); else if (session) setLoading(false); }, [session, load]);

  async function act(url: string, body: unknown, done: string) {
    setBusy(true); setMessage(null); setMessageFailed(false);
    try { await call(url, v => v, body); setMessage(t(done)); await load(); }
    catch (err) { setMessageFailed(true); setMessage(t(apiFailureText(err, "Request failed"))); }
    finally { setBusy(false); }
  }
  const note = (id: string) => rationale[id] ?? "";
  const closeDays = close.days.split(",").map(d => d.trim()).filter(Boolean);

  return <AppShell title="Post-event Learning" description="Score closed event windows per trigger rule and propose threshold changes for independent review. Approval never changes the engine; only an explicit platform apply does.">
    <div className="mb-4 flex flex-wrap gap-2">
      <StatusPill tone="sample">{t("Synthetic exercise data")}</StatusPill>
      <StatusPill tone="info">{t("Rehearsal statistics, not forecasting accuracy")}</StatusPill>
      <StatusPill tone="warning">{t("Approval never changes the engine")}</StatusPill>
    </div>
    {session && !session.authenticated && <SignInRequired session={session}/>}
    {loading && session?.authenticated !== false && <SkeletonRows rows={5} label={t("Loading learning records")}/>}
    {error && (/insufficient role/i.test(error)
      ? <PermissionState needs={pageRoles("/learning") ?? []} roles={session?.roles} what={t("Learning records belong to the incident desk, so they are for the incident desk and administrators.")} where={refusalHome(session?.roles, { href: "/department-tasks", label: t("Open the Department Inbox") }, t("Open My Team"))} />
      : <ErrorState message={t(error)} onRetry={() => void load()}/>)}
    {session?.authenticated && !loading && !error && <div className="space-y-4">
      {config && <Panel title={t("Engine configuration")} icon={ShieldCheck}>
        <p className="text-sm">{t("Source")}: <strong className="font-semibold" title={config.config_source}>{t(codeLabel(config.config_source))}</strong></p>
        <div className="mt-3 rounded-md border border-stroke"><SortableTable label={t("Effective trigger thresholds")} minWidth="24rem" rows={Object.entries(config.thresholds)} rowKey={([name]) => name} columns={[
          { key: "hazard", label: t("Hazard"), sortValue: ([name]) => t(codeLabel(name)), cell: ([name]) => <span title={name}><HazardGlyph value={name} label={t(codeLabel(name))} /></span> },
          { key: "watch", label: t("Watch"), numeric: true, sortValue: ([, spec]) => spec.watch, cell: ([, spec]) => spec.watch },
          { key: "candidate", label: t("Candidate"), numeric: true, sortValue: ([, spec]) => spec.candidate, cell: ([, spec]) => spec.candidate },
        ]}/></div>
        <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">{t("Technical details")}</summary>
          <p className="mt-2">{t("Effective version")}: <code className="break-all">{config.effective_version}</code></p>
          {config.versions.length > 0 && <ul className="mt-2 space-y-1.5">{config.versions.map(v => <li key={v.version_id} className="flex flex-wrap items-center gap-2"><code className="break-all">{v.version_id}</code><RecordRef id={v.applied_by} /><time className="tnum">{formatAbsolute(v.applied_at) || v.applied_at}</time></li>)}</ul>}
        </details>
      </Panel>}

      {isMaker && <Panel title={t("Close or replay an event window")} icon={Play}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="learn-scenario" className="field-label">{t("Replay a synthetic scenario")}</label>
            <select id="learn-scenario" className="field" value={scenario} onChange={e => setScenario(e.target.value)}>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
            <Button type="button" disabled={busy || !scenario} onClick={() => act("/api/learning/windows/replay", { source: "synthetic", scenario_id: scenario }, "Window recorded")}>{t("Replay scenario")}</Button>
          </div>
          <div className="space-y-2">
            <p className="field-label">{t("Replay catalogue events (training years 2000-2017 only)")}</p>
            <input aria-label={t("Window start")} className="field" type="date" value={range.start} onChange={e => setRange({ ...range, start: e.target.value })}/>
            <input aria-label={t("Window end")} className="field" type="date" value={range.end} onChange={e => setRange({ ...range, end: e.target.value })}/>
            <Button type="button" disabled={busy} onClick={() => act("/api/learning/windows/replay", { source: "known_events", window_start: range.start, window_end: range.end }, "Window recorded")}>{t("Replay catalogue events")}</Button>
          </div>
          <div className="space-y-2">
            <p className="field-label">{t("Close an operator event window")}</p>
            <select aria-label={t("Hazard")} className="field" value={close.hazard} onChange={e => setClose({ ...close, hazard: e.target.value })}>
              {Object.keys(config?.thresholds ?? { heavy_rain: null }).map(name => <option key={name} value={name}>{t(codeLabel(name))}</option>)}</select>
            <input aria-label={t("Window start")} className="field" type="date" value={close.start} onChange={e => setClose({ ...close, start: e.target.value })}/>
            <input aria-label={t("Window end")} className="field" type="date" value={close.end} onChange={e => setClose({ ...close, end: e.target.value })}/>
            <input aria-label={t("Observed event days (comma-separated ISO dates)")} placeholder="2026-07-04, 2026-07-20" className="field" value={close.days} onChange={e => setClose({ ...close, days: e.target.value })}/>
            <Button type="button" disabled={busy || !close.start || !close.end} onClick={() => act("/api/learning/windows/close", { hazard: close.hazard, window_start: close.start, window_end: close.end, observed_event_days: closeDays }, "Window recorded")}>{t("Close window")}</Button>
          </div>
        </div>
      </Panel>}

      <Panel title={t("Closed event windows")} icon={BarChart3}>
        {windows.length === 0 ? <EmptyState title={t("No closed windows yet")}/> : <div className="space-y-3">{windows.map(w => <div key={w.id} className="rounded-lg border border-stroke p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-semibold" title={w.hazard}><HazardGlyph value={w.hazard} label={t(codeLabel(w.hazard))} /></strong><span className="tnum">{w.window_start} → {w.window_end}</span>
            <StatusPill tone={w.basis === "synthetic_rehearsal" ? "sample" : "warning"}>{t(BASIS_LABEL[w.basis])}</StatusPill>
          </div>
          <p className="mt-1 text-xs text-muted">{w.basis_note}</p>
          <div className="mt-2 rounded-md border border-stroke"><SortableTable label={t("Per-rule statistics")} minWidth="44rem" rows={w.rules} rowKey={r => r.rule_id} columns={[
            { key: "rule", label: t("Rule"), sortValue: r => t(codeLabel(r.rule_id)), cell: r => <span title={r.rule_id}>{t(codeLabel(r.rule_id))}</span> },
            { key: "hits", label: t("Hits"), numeric: true, sortValue: r => r.hits, cell: r => r.hits },
            { key: "misses", label: t("Misses"), numeric: true, sortValue: r => r.misses, cell: r => r.misses },
            { key: "fa", label: t("False-alarm episodes"), numeric: true, sortValue: r => r.false_alarm_episodes, cell: r => r.false_alarm_episodes },
            { key: "pod", label: t("Detected share"), numeric: true, sortValue: r => r.probability_of_detection.estimate, cell: r => <>{pctLabel(r.probability_of_detection)}{r.probability_of_detection.ci_reason && <span className="text-muted" title={r.probability_of_detection.ci_reason}> · {t(codeLabel(r.probability_of_detection.ci_reason))}</span>}</> },
            { key: "far", label: t("False-alarm share"), numeric: true, sortValue: r => r.false_alarm_ratio.estimate, cell: r => pctLabel(r.false_alarm_ratio) },
            { key: "lead", label: t("Lead time (days)"), numeric: true, sortValue: r => r.lead_time_days.n ? r.lead_time_days.median : null, cell: r => r.lead_time_days.n ? r.lead_time_days.min + "/" + r.lead_time_days.median + "/" + r.lead_time_days.max : t("n/a") },
          ]}/></div>
          <p className="helper mt-1" title={w.config_version}>{t("Scored against the thresholds in force when the window closed.")}</p>
          {w.event_refs.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{w.event_refs.map(ref => <RecordRef key={ref} id={ref} />)}</p>}
          {isMaker && <Button size="sm" className="mt-2" type="button" disabled={busy} onClick={() => act("/api/learning/proposals", { window_id: w.id }, "Proposal drafted")}><FileDiff size={16}/>{t("Propose threshold change")}</Button>}
        </div>)}</div>}
      </Panel>

      <Panel title={t("Threshold proposals")} icon={GitPullRequest}>
        {proposals.length === 0 ? <EmptyState title={t("No threshold proposals yet")}/> : <div className="space-y-3">{proposals.map(p => <div key={p.id} className="rounded-lg border border-stroke p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold" title={p.status}>{t(codeLabel(p.status))}</span><TwoKey {...keysForStatus(p.status)} />
            {p.applied_version ? <StatusPill tone="info">{t("Applied to engine")}</StatusPill> : p.status === "approved" ? <StatusPill tone="warning">{t("Approved candidate, not applied")}</StatusPill> : null}
          </div>
          <ul className="mt-2 space-y-1 text-sm">{p.changes.map(c => <li key={c.path} title={c.path}>{t(sentenceCase(c.path))}: <span className="tnum">{c.old} → <strong className="font-semibold">{c.new}</strong></span></li>)}</ul>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{t("Maker")}</span><RecordRef id={p.maker_subject} />{p.checker_subject && <><span>{t("Checker")}</span><RecordRef id={p.checker_subject} /></>}</p>
          <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">{t("Technical details")}</summary><code className="break-all">{p.base_version} → {p.new_version}</code></details>
          {p.status === "draft" && isMaker && <Button className="mt-2" type="button" disabled={busy} onClick={() => act(`/api/learning/proposals/${p.id}/submit`, {}, "Submitted for independent review")}>{t("Submit for review")}</Button>}
          {(p.status === "submitted" && isChecker || p.status === "approved" && !p.applied_version && isAdmin) && <div className="mt-2 space-y-2">
            <label htmlFor={`rationale-${p.id}`} className="field-label">{t("Decision rationale (10 to 2000 characters)")}</label>
            <textarea id={`rationale-${p.id}`} className="field !h-20 py-2" maxLength={2000} value={note(p.id)} onChange={e => setRationale({ ...rationale, [p.id]: e.target.value })}/>
            <div className="flex flex-wrap gap-2">
              {p.status === "submitted" && <>
                <Button variant="primary" type="button" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/review`, { approve: true, rationale: note(p.id) }, "Recorded as approved candidate")}><Check size={16}/>{t("Approve candidate")}</Button>
                <Button variant="danger" type="button" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/review`, { approve: false, rationale: note(p.id) }, "Proposal rejected")}><X size={16}/>{t("Reject")}</Button>
              </>}
              {p.status === "approved" && <Button variant="primary" type="button" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/apply`, { rationale: note(p.id) }, "New config version applied")}>{t("Apply as new config version")}</Button>}
            </div>
            <p className="helper">{t("The server refuses self-approval, system accounts and other agencies. Applying is a separate Administrator action.")}</p>
          </div>}
        </div>)}</div>}
      </Panel>
      <div><Button type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/>{t("Refresh")}</Button></div>
      {/* The one status element. Actions sit in several panels, so it stays pinned at the bottom of the viewport, in view next to whatever was pressed; the line is reserved so nothing jumps. */}
      <div role="status" aria-live="polite" className="sticky bottom-3 z-10 min-h-7">
        {message && <StatusPill tone={messageFailed ? "danger" : "success"} className="max-w-full whitespace-normal bg-surface text-left shadow-panel">{message}</StatusPill>}</div>
    </div>}
  </AppShell>;
}
