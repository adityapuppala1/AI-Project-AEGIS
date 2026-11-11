"use client";

import { PermissionState } from "./ui";
import { pageRoles } from "../lib/roles";
import { RecordRef } from "./ui";
import { codeLabel, plainText } from "../lib/labels";
import { DataTable } from "./ui";
import { useCallback, useEffect, useState } from "react";
import { AlarmClock, ClipboardCheck, GraduationCap, Play, RefreshCw } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { EmptyState, ErrorState, Panel, SkeletonRows, StatusPill } from "./ui";
import { useOperatorSession } from "../lib/use-operator-session";
import { SignInRequired } from "./sign-in-required";
import { DRILL_ACTIONS, cleanDrill, cleanReport, cleanScenarios, simClock, type Drill, type DrillAction, type DrillReport, type Scenario, call } from "../lib/learning";

const ACTION_LABEL: Record<DrillAction, string> = {
  acknowledge_watch: "Acknowledge watch", take_handoff: "Take hand-off", submit: "Submit", approve: "Approve (checker)",
};
const SLA_LABEL: Record<string, string> = {
  within_synthetic_target: "Within synthetic target", synthetic_target_elapsed: "Synthetic target elapsed", not_taken: "Not taken", not_applicable: "Not applicable",
};
const SLA_TONE = { within_synthetic_target: "success", synthetic_target_elapsed: "warning", not_taken: "danger", not_applicable: "neutral" } as const;
const STEPS = [5, 15, 30, 60] as const;

/** A9 tabletop drills on a simulated clock. Exercise-only; nothing here touches live watch data or sends. */
export function ExerciseDrills() {
  const t = useT();
  const session = useOperatorSession();
  const roles = session?.roles ?? [];
  const isOperator = roles.includes("incident_operator");
  const isChecker = roles.includes("incident_checker");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [note, setNote] = useState("");
  const [scenario, setScenario] = useState("");
  const [drills, setDrills] = useState<Drill[]>([]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [report, setReport] = useState<DrillReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [scen, list] = await Promise.all([
        call("/api/drills/scenarios", cleanScenarios),
        call("/api/drills", v => (v as { drills?: unknown[] })?.drills?.map(cleanDrill).filter((d): d is Drill => d !== null) ?? null),
      ]);
      setScenarios(scen.scenarios); setNote(scen.note); setDrills(list);
      setScenario(current => current || scen.scenarios[0]?.id || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Drill service unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (session?.authenticated) void load(); else if (session) setLoading(false); }, [session, load]);

  const refreshReport = useCallback(async (id: string) => {
    try { setReport(await call(`/api/drills/${id}/report`, cleanReport)); } catch { setReport(null); }
  }, []);
  useEffect(() => { if (drill) void refreshReport(drill.id); else setReport(null); }, [drill, refreshReport]);

  async function act(url: string, body: unknown) {
    setBusy(true); setMessage(null);
    try { const next = await call(url, cleanDrill, body); setDrill(next); setDrills(list => [next, ...list.filter(d => d.id !== next.id)]); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Request failed"); }
    finally { setBusy(false); }
  }

  const ready = (action: DrillAction): boolean => {
    if (!drill || drill.status !== "running" || drill.actions[action]) return false;
    if (action === "acknowledge_watch") return isOperator && drill.first_watch_minute !== null;
    if (action === "take_handoff") return isOperator && drill.first_candidate_minute !== null && Boolean(drill.actions.acknowledge_watch);
    if (action === "submit") return isOperator && Boolean(drill.actions.take_handoff);
    return isChecker && Boolean(drill.actions.submit);
  };

  return <AppShell title="Exercise Drills" description="Tabletop drills replayed on a simulated clock from catalogue dates and synthetic scenarios. Operator timeliness is scored against synthetic SLA targets. Exercise only.">
    <div className="mb-4 flex flex-wrap gap-2">
      <StatusPill tone="sample">{t("Exercise drill")}</StatusPill>
      <StatusPill tone="info">{t("Simulated clock: nothing follows wall time or is sent")}</StatusPill>
      <StatusPill tone="warning">{t("Synthetic SLA targets, not contractual SLAs")}</StatusPill>
    </div>
    {session && !session.authenticated && <SignInRequired session={session}/>}
    {loading && session?.authenticated !== false && <SkeletonRows rows={4} label={t("Loading drills")}/>}
    {error && (/insufficient role/i.test(error)
      ? <PermissionState needs={pageRoles("/drills") ?? []} roles={session?.roles} what={t("Drills rehearse the incident desk, so they are for the incident desk and administrators.")} where={{ href: "/department-tasks", label: t("Open the Department Inbox") }} />
      : <ErrorState message={t(error)} onRetry={() => void load()}/>)}
    {session?.authenticated && !loading && !error && <div className="space-y-4">
      <Panel title={t("Start a drill")} icon={Play}>
        <p className="helper mb-2">{plainText(note)}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div><label htmlFor="drill-scenario" className="field-label">{t("Scenario")}</label>
            <select id="drill-scenario" className="field" value={scenario} onChange={e => setScenario(e.target.value)}>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
          <button type="button" className="control control-primary" disabled={busy || !scenario || !isOperator} onClick={() => act("/api/drills", { scenario_id: scenario })}>{t("Start drill")}</button>
          {drills.length > 0 && <div><label htmlFor="drill-pick" className="field-label">{t("Open an earlier drill")}</label>
            <select id="drill-pick" className="field" value={drill?.id ?? ""} onChange={e => setDrill(drills.find(d => d.id === e.target.value) ?? null)}>
              <option value="">-</option>{drills.map(d => <option key={d.id} value={d.id}>{d.title} · {simClock(d.sim_minute)}</option>)}</select></div>}
        </div>
      </Panel>

      {drill && <Panel title={drill.title} icon={AlarmClock}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill tone="sample">{t("Exercise drill")}</StatusPill>
          <strong>{simClock(drill.sim_minute)}</strong><span className="text-muted">/ {simClock(drill.end_minute)}</span>
          <StatusPill tone={drill.trigger_state === "candidate" ? "danger" : drill.trigger_state === "watch" ? "warning" : "neutral"}>{t("Trigger state")}: {t(drill.trigger_state)}</StatusPill>
          <StatusPill tone={drill.status === "running" ? "info" : "neutral"}>{t(codeLabel(drill.status))}</StatusPill>
          {drill.event_ref && <RecordRef id={drill.event_ref} />}
        </div>
        <ol className="mt-3 space-y-1.5 text-xs">{drill.injected.map(i => <li key={i.evidence_id} className="flex flex-wrap items-center gap-2 tnum"><span>{simClock(i.minute)}</span><span>{i.value}</span><span>{t(i.trigger_state)}</span><RecordRef id={i.evidence_id} /></li>)}</ol>
        {drill.status === "running" && isOperator && <div className="mt-3 flex flex-wrap gap-2">
          {STEPS.map(step => <button key={step} type="button" className="control control-sm" disabled={busy} onClick={() => act(`/api/drills/${drill.id}/clock`, { expected_minute: drill.sim_minute, minutes: step })}>+{step} {t("min")}</button>)}
        </div>}
        <div className="mt-3 flex flex-wrap gap-2">
          {DRILL_ACTIONS.map(action => <button key={action} type="button" className="control" disabled={busy || !ready(action)} onClick={() => act(`/api/drills/${drill.id}/respond`, { action })}>
            <ClipboardCheck size={16}/>{t(ACTION_LABEL[action])}{drill.actions[action] ? ` · ${simClock(drill.actions[action]!.minute)}` : ""}</button>)}
        </div>
        <p className="helper mt-2">{t("Approval in a drill needs a different person with the checker role, as in the real workflow.")}</p>
      </Panel>}

      {report && <Panel title={t("Coach report")} icon={GraduationCap}>
        <p className="helper mb-2">{plainText(report.note)}</p>
        <div className="rounded-md border border-stroke"><DataTable label={t("Timeliness against synthetic targets")} minWidth="34rem">
          <thead><tr><th scope="col">{t("Step")}</th><th scope="col" className="num">{t("Target (min)")}</th><th scope="col" className="num">{t("Elapsed (min)")}</th><th scope="col">{t("Result")}</th><th scope="col">{t("Coach note")}</th></tr></thead>
          <tbody>{report.actions.map(a => <tr key={a.action}><td>{t(ACTION_LABEL[a.action])}</td><td>{a.target_minutes}</td><td>{a.elapsed_minutes ?? "-"}</td>
            <td><StatusPill tone={SLA_TONE[a.status]}>{t(SLA_LABEL[a.status])}</StatusPill></td><td>{plainText(a.coach_note)}</td></tr>)}</tbody>
        </DataTable></div>
        <p className="mt-2 flex flex-wrap gap-1">{report.cited_event_ids.map(id => <RecordRef key={id} id={id} />)}</p>
      </Panel>}
      <div className="flex items-center gap-3"><button type="button" className="control" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/>{t("Refresh")}</button>
        <span aria-live="polite" role="status" className="text-xs">{message}</span></div>
    </div>}
  </AppShell>;
}
