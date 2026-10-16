"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BrainCircuit, Check, ClipboardCheck, Clock3,
  Copy, Database, FileClock, History, MapPinned, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { GeoMap } from "./geo-map";
import { StatusBadge } from "./status-badge";
import type { IncidentWorkspace, IncidentEvent, IncidentEvidence } from "../lib/incident-intelligence";

type View = "evidence" | "timeline" | "interpretation";
const views: { value: View; label: string; icon: typeof Database }[] = [
  { value: "evidence", label: "Source evidence", icon: Database },
  { value: "timeline", label: "Exercise chronology", icon: History },
  { value: "interpretation", label: "AI transparency", icon: BrainCircuit },
];

function timeInIndia(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(date) + " IST";
}
function kindLabel(kind: IncidentEvidence["source_kind"]): string {
  const names: Record<IncidentEvidence["source_kind"], string> = {
    exercise_sensor: "Simulated sensor",
    exercise_report: "Fictional case report",
    exercise_gis: "Simulated GIS layer",
  };
  return names[kind];
}
function eventLabel(kind: IncidentEvent["event_type"]): string {
  const names: Record<IncidentEvent["event_type"], string> = {
    observation: "Observation recorded",
    assessment: "Exercise assessment",
    coordination: "Coordination note",
    resolution: "Scenario resolution",
  };
  return names[kind];
}
function shortDelay(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Unknown";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function IncidentIntelligence({ workspace }: { workspace: IncidentWorkspace }) {
  const [view, setView] = useState<View>("evidence");
  const [selectedId, setSelectedId] = useState<string | null>(workspace.incident.id);
  const [copyState, setCopyState] = useState("Copy case ID");
  const incident = workspace.incident;

  async function copyId() {
    try {
      await navigator.clipboard.writeText(incident.id);
      setCopyState("Copied");
    } catch {
      setCopyState("Copy unavailable");
    }
  }

  return <AppShell title="Incident Intelligence" description="Explore a synthetic incident, its evidence lineage, recorded events and decision constraints.">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/incidents" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft size={16}/> Incident Registry
      </Link>
      <Link href="/approvals" className="control">
        <ClipboardCheck size={16}/> Exercise Approval Workbench <ArrowRight size={15}/>
      </Link>
    </div>
    <div role="note" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <ShieldAlert className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" size={20}/>
      <p className="text-xs leading-6 text-amber-800 dark:text-amber-200">
        <strong>SIMULATION · Not a real public-safety incident.</strong> All sources, people labels,
        timestamps and event narratives on this page are synthetic exercise fixtures.
        This interface cannot issue live warnings or dispatch responders.
      </p>
    </div>

    <section className="panel mb-5 p-5 sm:p-6" aria-label="Case overview">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Incident reference · Hyderabad training area</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{incident.hazard_type}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={incident.status}/>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              Synthetic exercise
            </span>
            <span className="text-xs text-muted">Case opened {timeInIndia(incident.created_at)}</span>
          </div>
        </div>
        <button type="button" onClick={() => void copyId()} className="control text-xs">
          {copyState === "Copied" ? <Check size={15}/> : <Copy size={15}/>}
          {copyState}
        </button>
      </div>
      <p className="mt-5 break-all rounded-lg bg-elevated/60 px-3 py-2 font-mono text-xs text-muted">{incident.id}</p>
    </section>

    <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Evidence and intelligence summary">
      {[
        { title: "Evidence records", value: workspace.evidence.length.toString(), detail: "Mock source references", icon: Database },
        { title: "Timeline events", value: workspace.timeline.length.toString(), detail: "Training exercise only", icon: FileClock },
        { title: "AI forecast", value: "Not assessed", detail: "No validated prediction", icon: BrainCircuit },
        { title: "Operational actions", value: "Disabled", detail: "Approval never dispatches", icon: ShieldCheck },
      ].map(item => <div key={item.title} className="panel p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted">{item.title}</p>
          <span className="rounded-lg bg-accent/10 p-2 text-accent"><item.icon size={18}/></span>
        </div>
        <h3 className="mt-3 text-xl font-bold">{item.value}</h3>
        <p className="mt-1 text-xs text-muted">{item.detail}</p>
      </div>)}
    </section>

    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)]">
      <section className="panel min-w-0 overflow-hidden">
        <div className="panel-heading">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold"><MapPinned className="text-accent" size={18}/> Geospatial context</h3>
            <p className="mt-1 text-xs text-muted">Single simulated case marker · MapLibre</p>
          </div>
          <span className="rounded-full border border-stroke px-3 py-1 text-xs text-muted">2D exercise view</span>
        </div>
        <GeoMap incidents={[incident]} selectedId={selectedId} onSelect={setSelectedId}/>
        <div className="border-t border-stroke px-5 py-3 text-xs text-muted">
          Coordinates: {incident.lat?.toFixed(5) ?? "—"}, {incident.lon?.toFixed(5) ?? "—"}
          <span className="mt-1 block">Map tiles are loaded from a public provider; no restricted geography is shown.</span>
        </div>
      </section>
      <section className="panel p-5 sm:p-6" aria-label="Operator interpretation">
        <p className="eyebrow">Decision-support guidance</p>
        <h3 className="mt-3 text-lg font-bold">Verify evidence before action</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          The evidence list below is demonstrative. In an authorized response environment,
          operators should verify source identity, observation time, source quality,
          jurisdiction and approved SOPs before drafting any recommendation.
        </p>
        <ol className="mt-5 space-y-3">
          {[
            ["01", "Inspect time and origin", "Recorded and observed timestamps may differ."],
            ["02", "Check for corroboration", "Unverified reports are not confirmed hazards."],
            ["03", "Document uncertainty", "No calibrated model result is available for this case."],
            ["04", "Submit for independent review", "Only authorized identities can approve exercise proposals."],
          ].map(([num, label, detail]) => <li key={num} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-xs font-bold text-accent">{num}</span>
            <span><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs leading-5 text-muted">{detail}</span></span>
          </li>)}
        </ol>
        <Link href="/playbooks" className="control mt-6 w-full">
          View exercise response playbooks <ArrowRight size={16}/>
        </Link>
      </section>
    </div>

    <section className="panel mt-5 overflow-hidden">
      <div className="panel-heading">
        <div>
          <h3 className="text-base font-bold">Evidence, chronology & AI transparency</h3>
          <p className="mt-1 text-xs text-muted">Recorded exercise information · no verified real-world observations</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-stroke p-4" aria-label="Case information categories">
        {views.map(item => <button key={item.value} type="button" aria-pressed={view === item.value}
          onClick={() => setView(item.value)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${view === item.value ? "border-accent bg-accent/10 text-accent" : "border-stroke text-muted hover:bg-elevated"}`}>
          <item.icon size={15}/>{item.label}
        </button>)}
      </div>
      {view === "evidence" && <div className="grid gap-3 p-4 md:grid-cols-2 sm:p-5" aria-label="Source provenance">
        {workspace.evidence.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted">
          No exercise evidence is attached. Never infer that missing data confirms safety.
        </p>}
        {workspace.evidence.map(item => <article key={item.id} className="rounded-xl border border-stroke bg-elevated/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Database size={18}/></span>
            <span className="rounded-full border border-stroke px-2.5 py-1 text-[11px] font-semibold text-muted">
              {item.quality_status === "synthetic_curated" ? "Curated fixture" : "Unverified fixture"}
            </span>
          </div>
          <h4 className="mt-3 text-sm font-bold">{item.source_label}</h4>
          <p className="mt-1 text-xs font-medium text-accent">{kindLabel(item.source_kind)}</p>
          <p className="mt-3 text-sm leading-6 text-muted">{item.summary}</p>
          <dl className="mt-4 grid gap-3 border-t border-stroke pt-4 text-xs">
            <div><dt className="text-muted">Observed</dt><dd className="mt-1 font-medium">{timeInIndia(item.observed_at)}</dd></div>
            <div><dt className="text-muted">Ingested</dt><dd className="mt-1 font-medium">{timeInIndia(item.ingested_at)}</dd></div>
            <div><dt className="text-muted">Simulated ingestion delay</dt><dd className="mt-1 font-medium">{shortDelay(item.ingest_lag_seconds)}</dd></div>
          </dl>
        </article>)}
        <p className="col-span-full text-xs leading-6 text-muted">
          “Curated fixture” describes prepared exercise data; it does not mean real-world verification.
          No physical media, facial recognition or evidentiary chain of custody is attached.
        </p>
      </div>}
      {view === "timeline" && <div className="p-5" aria-label="Synthetic incident chronology">
        <p className="mb-4 text-xs text-muted">This simulated chronology is distinct from the secured operational approval audit log.</p>
        {workspace.timeline.length === 0 && <p className="py-8 text-center text-sm text-muted">No simulated chronology events have been entered for this case.</p>}
        <ol className="space-y-0">
          {workspace.timeline.map((event, index) => <li key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                <Clock3 size={17}/>
              </span>
              {index < workspace.timeline.length - 1 && <span className="my-2 min-h-8 w-px flex-1 bg-stroke"/>}
            </div>
            <div className="min-w-0 flex-1 pb-7">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{eventLabel(event.event_type)}</strong>
                <span className="rounded-full bg-elevated px-2 py-1 text-[11px] text-muted">Synthetic</span>
              </div>
              <p className="mt-1 text-xs text-muted">{timeInIndia(event.occurred_at)} · {event.actor_label}</p>
              <p className="mt-3 text-sm leading-6">{event.summary}</p>
              <p className="mt-2 text-xs text-muted">Recorded {timeInIndia(event.recorded_at)}</p>
            </div>
          </li>)}
        </ol>
      </div>}
      {view === "interpretation" && <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h4 className="flex items-center gap-2 text-sm font-bold"><BrainCircuit size={18} className="text-amber-600 dark:text-amber-300"/> No trained forecast</h4>
          <p className="mt-3 text-sm leading-6 text-muted">{workspace.assessment.message}</p>
          <dl className="mt-4 space-y-2 text-xs text-muted">
            <div><dt className="inline">Model version: </dt><dd className="inline font-semibold">Not available</dd></div>
            <div><dt className="inline">Calibrated probability: </dt><dd className="inline font-semibold">Not available</dd></div>
            <div><dt className="inline">Prediction horizon: </dt><dd className="inline font-semibold">Not available</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border border-stroke bg-elevated/30 p-5">
          <h4 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={18} className="text-accent"/> Human decision boundary</h4>
          <p className="mt-3 text-sm leading-6 text-muted">
            AEGIS may document simulated analyses and internal proposals.
            Real alerting, emergency dispatch and life-safety commands are not connected.
            Any future operational workflow requires authorized human oversight.
          </p>
          <p className="mt-4 text-xs text-muted">Response generated {timeInIndia(workspace.generated_at)}</p>
        </div>
      </div>}
    </section>
  </AppShell>;
}
