"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, FileDiff, GitPullRequest, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { EmptyState, ErrorState, Panel, SkeletonRows, StatusPill } from "./ui";
import { useOperatorSession } from "../lib/use-operator-session";
import { SignInRequired } from "./sign-in-required";
import {
  cleanConfig, cleanProposal, cleanScenarios, cleanWindow, pctLabel,
  type ConfigView, type LearningWindow, type Proposal, type Scenario,
} from "../lib/learning";

const BASIS_LABEL: Record<string, string> = {
  synthetic_rehearsal: "Synthetic rehearsal", known_events_unreviewed: "Unreviewed catalogue labels", registered_protocol_labels: "Protocol-eligible labels",
};
const STATUS_TONE = { draft: "neutral", submitted: "warning", approved: "success", rejected: "danger" } as const;

async function call<T>(url: string, clean: (value: unknown) => T | null, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const info = data as { error?: string; code?: string } | null;
    throw new Error([info?.error || "Request failed", info?.code].filter(Boolean).join(" · "));
  }
  const cleaned = clean(data);
  if (!cleaned) throw new Error("Invalid response");
  return cleaned;
}

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
    {error && <ErrorState message={t(error)} onRetry={() => void load()}/>}
    {session?.authenticated && !loading && !error && <div className="space-y-4">
      {config && <Panel title={t("Engine configuration")} icon={ShieldCheck}>
        <p className="text-sm">{t("Effective version")}: <code className="break-all">{config.effective_version}</code> · {t("Source")}: <code>{config.config_source}</code></p>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs">
          <caption className="sr-only">{t("Effective trigger thresholds")}</caption>
          <thead><tr><th scope="col">{t("Hazard")}</th><th scope="col">{t("Watch")}</th><th scope="col">{t("Candidate")}</th></tr></thead>
          <tbody>{Object.entries(config.thresholds).map(([name, spec]) => <tr key={name}><td>{name}</td><td>{spec.watch}</td><td>{spec.candidate}</td></tr>)}</tbody>
        </table></div>
        {config.versions.length > 0 && <ul className="mt-2 space-y-1 text-xs">{config.versions.map(v => <li key={v.version_id}><code className="break-all">{v.version_id}</code> · {v.applied_by} · {v.applied_at}</li>)}</ul>}
      </Panel>}

      {isMaker && <Panel title={t("Close or replay an event window")} icon={Play}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="learn-scenario" className="block text-xs font-bold">{t("Replay a synthetic scenario")}</label>
            <select id="learn-scenario" className="field" value={scenario} onChange={e => setScenario(e.target.value)}>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
            <button type="button" className="control" disabled={busy || !scenario} onClick={() => act("/api/learning/windows/replay", { source: "synthetic", scenario_id: scenario }, "Window recorded")}>{t("Replay scenario")}</button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold">{t("Replay catalogue events (training years 2000-2017 only)")}</p>
            <input aria-label={t("Window start")} className="field" type="date" value={range.start} onChange={e => setRange({ ...range, start: e.target.value })}/>
            <input aria-label={t("Window end")} className="field" type="date" value={range.end} onChange={e => setRange({ ...range, end: e.target.value })}/>
            <button type="button" className="control" disabled={busy} onClick={() => act("/api/learning/windows/replay", { source: "known_events", window_start: range.start, window_end: range.end }, "Window recorded")}>{t("Replay catalogue events")}</button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold">{t("Close an operator event window")}</p>
            <select aria-label={t("Hazard")} className="field" value={close.hazard} onChange={e => setClose({ ...close, hazard: e.target.value })}>
              {Object.keys(config?.thresholds ?? { heavy_rain: null }).map(name => <option key={name} value={name}>{name}</option>)}</select>
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
            <strong>{w.hazard}</strong><span>{w.window_start} → {w.window_end}</span>
            <StatusPill tone={w.basis === "synthetic_rehearsal" ? "sample" : "warning"}>{t(BASIS_LABEL[w.basis])}</StatusPill>
            <code className="text-[11px] break-all">{w.config_version}</code>
          </div>
          <p className="mt-1 text-xs text-muted">{w.basis_note}</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs">
            <caption className="sr-only">{t("Per-rule statistics")}</caption>
            <thead><tr><th scope="col">{t("Rule")}</th><th scope="col">{t("Hits")}</th><th scope="col">{t("Misses")}</th><th scope="col">{t("False-alarm episodes")}</th><th scope="col">{t("Detected share")}</th><th scope="col">{t("False-alarm share")}</th><th scope="col">{t("Lead time (days)")}</th></tr></thead>
            <tbody>{w.rules.map(r => <tr key={r.rule_id}><td>{r.rule_id}</td><td>{r.hits}</td><td>{r.misses}</td><td>{r.false_alarm_episodes}</td>
              <td>{pctLabel(r.probability_of_detection)}{r.probability_of_detection.ci_reason && <span className="text-muted"> · {r.probability_of_detection.ci_reason}</span>}</td>
              <td>{pctLabel(r.false_alarm_ratio)}</td><td>{r.lead_time_days.n ? `${r.lead_time_days.min}/${r.lead_time_days.median}/${r.lead_time_days.max}` : "n/a"}</td></tr>)}</tbody>
          </table></div>
          {w.event_refs.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{w.event_refs.map(ref => <code key={ref} className="rounded bg-surface-2 px-1 text-[11px]">{ref}</code>)}</p>}
          {isMaker && <button type="button" className="control mt-2" disabled={busy} onClick={() => act("/api/learning/proposals", { window_id: w.id }, "Proposal drafted")}><FileDiff size={16}/>{t("Propose threshold change")}</button>}
        </div>)}</div>}
      </Panel>

      <Panel title={t("Threshold proposals")} icon={GitPullRequest}>
        {proposals.length === 0 ? <EmptyState title={t("No threshold proposals yet")}/> : <div className="space-y-3">{proposals.map(p => <div key={p.id} className="rounded-lg border border-stroke p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={STATUS_TONE[p.status]}>{t(p.status)}</StatusPill>
            {p.applied_version ? <StatusPill tone="info">{t("Applied to engine")}</StatusPill> : p.status === "approved" ? <StatusPill tone="warning">{t("Approved candidate, not applied")}</StatusPill> : null}
            <code className="text-[11px] break-all">{p.base_version} → {p.new_version}</code>
          </div>
          <ul className="mt-2 text-xs">{p.changes.map(c => <li key={c.path}><code>{c.path}</code>: {c.old} → {c.new}</li>)}</ul>
          <p className="mt-1 text-xs text-muted">{t("Maker")}: {p.maker_subject}{p.checker_subject ? ` · ${t("Checker")}: ${p.checker_subject}` : ""}</p>
          {p.status === "draft" && isMaker && <button type="button" className="control mt-2" disabled={busy} onClick={() => act(`/api/learning/proposals/${p.id}/submit`, {}, "Submitted for independent review")}>{t("Submit for review")}</button>}
          {(p.status === "submitted" && isChecker || p.status === "approved" && !p.applied_version && isAdmin) && <div className="mt-2 space-y-2">
            <label htmlFor={`rationale-${p.id}`} className="block text-xs font-bold">{t("Decision rationale (10 to 2000 characters)")}</label>
            <textarea id={`rationale-${p.id}`} className="field !h-20 py-2" maxLength={2000} value={note(p.id)} onChange={e => setRationale({ ...rationale, [p.id]: e.target.value })}/>
            <div className="flex flex-wrap gap-2">
              {p.status === "submitted" && <>
                <button type="button" className="control control-primary" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/review`, { approve: true, rationale: note(p.id) }, "Recorded as approved candidate")}><Check size={16}/>{t("Approve candidate")}</button>
                <button type="button" className="control" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/review`, { approve: false, rationale: note(p.id) }, "Proposal rejected")}><X size={16}/>{t("Reject")}</button>
              </>}
              {p.status === "approved" && <button type="button" className="control control-primary" disabled={busy || note(p.id).trim().length < 10} onClick={() => act(`/api/learning/proposals/${p.id}/apply`, { rationale: note(p.id) }, "New config version applied")}>{t("Apply as new config version")}</button>}
            </div>
            <p className="text-[11px] text-muted">{t("The API refuses self-approval, system subjects and other agencies. Apply is a separate platform_admin action.")}</p>
          </div>}
        </div>)}</div>}
      </Panel>
      <div className="flex items-center gap-3"><button type="button" className="control" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/>{t("Refresh")}</button>
        <span aria-live="polite" role="status" className="text-xs">{message}</span></div>
    </div>}
  </AppShell>;
}
