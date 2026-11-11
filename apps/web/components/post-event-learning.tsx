"use client";

import { PermissionState } from "./ui";
import { pageRoles } from "../lib/roles";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, FileDiff, GitPullRequest, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { EmptyState, ErrorState, Panel, SkeletonRows, StatusPill } from "./ui";
import { useOperatorSession } from "../lib/use-operator-session";
import { SignInRequired } from "./sign-in-required";
import { DataTable, HazardGlyph, RecordRef, TwoKey, formatAbsolute, keysForStatus } from "./ui";
import { codeLabel, sentenceCase } from "../lib/labels";
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
    setBusy(true); setMessage(null);
    try { await call(url, v => v, body); setMessage(t(done)); await load(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Request failed"); }
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
      ? <PermissionState needs={pageRoles("/learning") ?? []} roles={session?.roles} what={t("Learning records belong to the incident desk, so they are for the incident desk and administrators.")} where={{ href: "/department-tasks", label: t("Open the Department Inbox") }} />
      : <ErrorState message={t(error)} onRetry={() => void load()}/>)}
    {session?.authenticated && !loading && !error && <div className="space-y-4">
      {config && <Panel title={t("Engine configuration")} icon={ShieldCheck}>
        <p className="text-sm">{t("Source")}: <strong className="font-semibold" title={config.config_source}>{t(codeLabel(config.config_source))}</strong></p>
        <div className="mt-3 rounded-md border border-stroke"><DataTable label={t("Effective trigger thresholds")} minWidth="24rem">
          <thead><tr><th scope="col">{t("Hazard")}</th><th scope="col" className="num">{t("Watch")}</th><th scope="col" className="num">{t("Candidate")}</th></tr></thead>
          <tbody>{Object.entries(config.thresholds).map(([name, spec]) => <tr key={name}><td title={name}><HazardGlyph value={name} label={t(codeLabel(name))} /></td><td className="num">{spec.watch}</td><td className="num">{spec.candidate}</td></tr>)}</tbody>
        </DataTable></div>
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
            <button type="button" className="control" disabled={busy || !scenario} onClick={() => act("/api/learning/windows/replay", { source: "synthetic", scenario_id: scenario }, "Window recorded")}>{t("Replay scenario")}</button>
          </div>
          <div className="space-y-2">
            <p className="field-label">{t("Replay catalogue events (training years 2000-2017 only)")}</p>
            <input aria-label={t("Window start")} className="field" type="date" value={range.start} onChange={e => setRange({ ...range, start: e.target.value })}/>
            <input aria-label={t("Window end")} className="field" type="date" value={range.end} onChange={e => setRange({ ...range, end: e.target.value })}/>
            <button type="button" className="control" disabled={busy} onClick={() => act("/api/learning/windows/replay", { source: "known_events", window_start: range.start, window_end: range.end }, "Window recorded")}>{t("Replay catalogue events")}</button>
          </div>
          <div className="space-y-2">
            <p className="field-label">{t("Close an operator event window")}</p>
            <select aria-label={t("Hazard")} className="field" value={close.hazard} onChange={e => setClose({ ...close, hazard: e.target.value })}>
              {Object.keys(config?.thresholds ?? { heavy_rain: null }).map(name => <option key={name} value={name}>{t(codeLabel(name))}</option>)}</select>
            <input aria-label={t("Window start")} className="field" type="date" value={close.start} onChange={e => setClose({ ...close, start: e.target.value })}/>
            <input aria-label={t("Window end")} className="field" type="date" value={close.end} onChange={e => setClose({ ...close, end: e.target.value })}/>
            <input aria-label={t("Observed event days (comma-separated ISO dates)")} placeholder="2026-07-04, 2026-07-20" className="field" value={close.days} onChange={e => setClose({ ...close, days: e.target.value })}/>
            <button type="button" className="control" disabled={busy || !close.start || !close.end} onClick={() => act("/api/learning/windows/close", { hazard: close.hazard, window_start: close.start, window_end: close.end, observed_event_days: closeDays }, "Window recorded")}>{t("Close window")}</button>
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
          <div className="mt-2 rounded-md border border-stroke"><DataTable label={t("Per-rule statistics")} minWidth="44rem" rows={w.rules.length} columns={7}>
            <thead><tr><th scope="col">{t("Rule")}</th><th scope="col" className="num">{t("Hits")}</th><th scope="col" className="num">{t("Misses")}</th><th scope="col" className="num">{t("False-alarm episodes")}</th><th scope="col" className="num">{t("Detected share")}</th><th scope="col" className="num">{t("False-alarm share")}</th><th scope="col" className="num">{t("Lead time (days)")}</th></tr></thead>
            <tbody>{w.rules.map(r => <tr key={r.rule_id}><td title={r.rule_id}>{t(codeLabel(r.rule_id))}</td><td className="num">{r.hits}</td><td className="num">{r.misses}</td><td className="num">{r.false_alarm_episodes}</td>
              <td className="num">{pctLabel(r.probability_of_detection)}{r.probability_of_detection.ci_reason && <span className="text-muted" title={r.probability_of_detection.ci_reason}> · {t(codeLabel(r.probability_of_detection.ci_reason))}</span>}</td>
              <td className="num">{pctLabel(r.false_alarm_ratio)}</td><td className="num">{r.lead_time_days.n ? `${r.lead_time_days.min}/${r.lead_time_days.median}/${r.lead_time_days.max}` : t("n/a")}</td></tr>)}</tbody>
          </DataTable></div>
          <p className="helper mt-1" title={w.config_version}>{t("Scored against the thresholds in force when the window closed.")}</p>
          {w.event_refs.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{w.event_refs.map(ref => <RecordRef key={ref} id={ref} />)}</p>}
          {isMaker && <button type="button" className="control control-sm mt-2" disabled={busy} onClick={() => act("/api/learning/proposals", { window_id: w.id }, "Proposal drafted")}><FileDiff size={16}/>{t("Propose threshold change")}</button>}
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
          {p.status === "draft" && isMaker && <button type="button" className="control mt-2" disabled={busy} onClick={() => act(`/api/learning/proposals/${p.id}/submit`, {}, "Submitted for independent review")}>{t("Submit for review")}</button>}
          {(p.status === "submitted" && isChecker || p.status === "approved" && !p.applied_version && isAdmin) && <div className="mt-2 space-y-2">
            <label htmlFor={`rationale-${p.id}`} className="field-label">{t("Decision rationale (10 to 2000 characters)")}</label>
            <textarea id={`rationale-${p.id}`} className="field !h-20 py-2" maxLength={2000} value={note(p.id)} onChange={e => setRationale({ ...rationale, [p.id]: e.target.value })}/>
            <div className="flex flex-wrap gap-2">
              {p.status === "submitted" && <>
                <button type="button" className="control control-primary" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/review`, { approve: true, rationale: note(p.id) }, "Recorded as approved candidate")}><Check size={16}/>{t("Approve candidate")}</button>
                <button type="button" className="control control-danger" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/review`, { approve: false, rationale: note(p.id) }, "Proposal rejected")}><X size={16}/>{t("Reject")}</button>
              </>}
              {p.status === "approved" && <button type="button" className="control control-primary" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/apply`, { rationale: note(p.id) }, "New config version applied")}>{t("Apply as new config version")}</button>}
            </div>
            <p className="helper">{t("The server refuses self-approval, system accounts and other agencies. Applying is a separate Administrator action.")}</p>
          </div>}
        </div>)}</div>}
      </Panel>
      <div className="flex items-center gap-3"><button type="button" className="control" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/>{t("Refresh")}</button>
        <span aria-live="polite" role="status" className="text-xs">{message}</span></div>
    </div>}
  </AppShell>;
}
