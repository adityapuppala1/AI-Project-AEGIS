"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Archive, ArrowRight, Download, FileCheck2, FileClock, RefreshCw, ShieldAlert } from "lucide-react";
import { AppShell } from "./app-shell";

const CASES = [
  { id: "22222222-2222-4222-8222-222222222222", label: "Synthetic waterlogging" },
  { id: "33333333-3333-4333-8333-333333333333", label: "Synthetic rainfall" },
  { id: "44444444-4444-4444-8444-444444444444", label: "Synthetic drainage obstruction" },
  { id: "55555555-5555-4555-8555-555555555555", label: "Synthetic road inundation" },
  { id: "66666666-6666-4666-8666-666666666666", label: "Resolved exercise scenario" },
];
interface AuditBundle {
  bundle_version: "aegis.exercise.audit360.v1";
  source: "synthetic_exercise";
  incident_id: string;
  playbook_ref: string;
  operational_actions_enabled: false;
  contains_real_agency_records: false;
  outbound_messages_sent: false;
  manifest_sha256: string;
  integrity_note: string;
  exported_at: string;
  incident_workspace: { evidence: unknown[]; timeline: unknown[]; };
  readiness_checklist: { context_state: string; };
  agency_task_board: { tasks: unknown[]; };
  scripted_task_events: {
    id: string; task_id: string; kind: string;
    occurred_at: string; actor_label: string; summary: string; synthetic: true;
  }[];
}
function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" :
    date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST";
}

export function Audit360Dashboard() {
  const [incidentId, setIncidentId] = useState(CASES[0].id);
  const [bundle, setBundle] = useState<AuditBundle | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setBundle(null); setError(""); setLoading(true);
    fetch("/api/incidents/" + incidentId + "/audit", {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Synthetic audit export unavailable");
      const data = await response.json() as AuditBundle;
      if (data.bundle_version !== "aegis.exercise.audit360.v1" ||
          data.source !== "synthetic_exercise" || data.incident_id !== incidentId ||
          data.operational_actions_enabled !== false || data.contains_real_agency_records !== false ||
          data.outbound_messages_sent !== false || !Array.isArray(data.scripted_task_events) ||
          !/^[a-f0-9]{64}$/.test(data.manifest_sha256)) {
        throw new Error("Refusing unexpected audit classification");
      }
      if (!controller.signal.aborted) setBundle(data);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unavailable");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [incidentId, revision]);

  return <AppShell title="Audit360 — Exercise Evidence"
    description="Export a bounded, check-summed synthetic incident story from evidence through scripted acknowledgements.">
    <div role="note" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200">
      <ShieldAlert size={19} className="mt-0.5 shrink-0"/>
      <p><strong>Fictional audit demonstration, not a legally signed audit.</strong> The export includes only public exercise fixture data.
        It excludes private approval histories, verified operator identities and real agency communications.
        A SHA-256 content checksum is not a signature or proof of independent custody.</p>
    </div>
    <section className="panel overflow-hidden">
      <div className="panel-heading"><div>
        <h2 className="flex items-center gap-2 text-base font-bold"><Archive size={18} className="text-accent"/> Traceable Exercise Snapshot</h2>
        <p className="mt-1 text-xs text-muted">Choose one of five synthetic incidents; no private cases are searchable here.</p>
      </div>
      <button type="button" className="control text-xs" disabled={loading}
        onClick={() => setRevision(value=>value+1)}>
        <RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh
      </button>
      </div>
      <div className="p-5">
        <label htmlFor="audit-case" className="mb-2 block text-xs font-semibold text-muted">Synthetic exercise case</label>
        <select id="audit-case" className="field max-w-[420px]" value={incidentId}
          onChange={event => setIncidentId(event.target.value)}>
          {CASES.map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0,8)}</option>)}
        </select>
        {loading && <p role="status" className="mt-4 text-sm text-muted">Generating safe read-only exercise snapshot…</p>}
        {error && <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle size={17}/>{error}. No saved prior snapshot is displayed as current.</p>}
        {bundle && <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Synthetic case evidence", value: bundle.incident_workspace.evidence.length },
              { label: "Case chronology entries", value: bundle.incident_workspace.timeline.length },
              { label: "Fictional desk tasks", value: bundle.agency_task_board.tasks.length },
              { label: "Scripted task events", value: bundle.scripted_task_events.length },
            ].map(item => <article key={item.label} className="rounded-xl border border-stroke bg-elevated/40 p-4">
              <p className="text-xs font-semibold text-muted">{item.label}</p>
              <p className="mt-3 text-2xl font-bold tabular-nums">{item.value}</p>
            </article>)}
          </div>
          <dl className="mt-5 space-y-3 rounded-xl border border-stroke p-4 text-xs leading-6">
            <div><dt className="font-semibold">Playbook reference</dt><dd className="break-all text-muted">{bundle.playbook_ref}</dd></div>
            <div><dt className="font-semibold">Assessment status</dt><dd className="text-muted">{bundle.readiness_checklist.context_state.replaceAll("_", " ")}</dd></div>
            <div><dt className="font-semibold">Snapshot time</dt><dd className="text-muted">{timestamp(bundle.exported_at)}</dd></div>
            <div><dt className="font-semibold">Unsigned SHA-256 manifest</dt><dd className="break-all font-mono text-[11px] text-muted">{bundle.manifest_sha256}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={"/api/incidents/" + incidentId + "/audit"} className="control control-primary text-xs"
              download={"aegis-exercise-audit-" + incidentId + ".json"}>
              <Download size={15}/> Export synthetic JSON bundle
            </a>
            <Link className="control text-xs" href={"/incidents/" + incidentId}>
              <FileCheck2 size={15}/> Open case details <ArrowRight size={14}/>
            </Link>
          </div>
          <details className="mt-5 rounded-xl border border-stroke p-4">
            <summary className="cursor-pointer text-xs font-semibold">Inspect scripted acknowledgement timeline ({bundle.scripted_task_events.length})</summary>
            <ol className="mt-4 space-y-3">
              {bundle.scripted_task_events.map(event => <li key={event.id} className="rounded-lg bg-elevated/40 p-3 text-xs leading-6">
                <p className="flex items-center gap-2 font-bold"><FileClock size={14}/> {event.kind.replaceAll("_"," ")}</p>
                <p className="mt-1 text-muted">{event.summary}</p>
                <p className="mt-1 text-[11px] text-muted">{timestamp(event.occurred_at)} · {event.actor_label}</p>
              </li>)}
            </ol>
          </details>
          <p className="mt-4 text-xs leading-5 text-muted">{bundle.integrity_note}</p>
        </>}
      </div>
    </section>
  </AppShell>;
}
