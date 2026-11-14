"use client";

import { shortId } from "../lib/labels";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BrainCircuit, ClipboardCheck, Database, FileClock, FileText, History, Layers, MapPinned,
  Radio, ShieldAlert, ShieldCheck, LayoutDashboard,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { GroundedEvidenceGuide } from "./grounded-evidence-guide";
import { GeoMap } from "./geo-map";
import { StatusBadge } from "./status-badge";
import { SpatialAnalysis } from "./spatial-analysis";
import { AssessmentReadiness } from "./assessment-readiness";
import { PublicSignalsNearCase } from "./public-signals-near-case";
import { SituationBriefButton } from "./situation-brief-button";
import { IncidentTeamResponse } from "./incident-team-response";
import { useT } from "./language-provider";
import { CopyButton, DataFreshness, EmptyState, KeyValueList, Panel, StatStrip, StatTile, StatusPill, TabPanel, Tabs, buttonClass } from "./ui";
import type { IncidentWorkspace, IncidentEvent, IncidentEvidence } from "../lib/incident-intelligence";

type View = "overview" | "evidence" | "timeline" | "readiness";
const YEARS = 24 * 365; // case records are historical fixtures; do not flag them stale by age alone

export function IncidentIntelligence({ workspace }: { workspace: IncidentWorkspace }) {
  const t = useT();
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(workspace.incident.id);
  const incident = workspace.incident;

  function timeInIndia(input: string): string {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return t("Time unavailable");
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) + " IST";
  }
  const kindLabel = (kind: IncidentEvidence["source_kind"]): string => ({
    exercise_sensor: t("Simulated sensor"),
    exercise_report: t("Fictional case report"),
    exercise_gis: t("Simulated GIS layer"),
  })[kind];
  const kindIcon = (kind: IncidentEvidence["source_kind"]) => ({ exercise_sensor: Radio, exercise_report: FileText, exercise_gis: Layers })[kind];
  const eventLabel = (kind: IncidentEvent["event_type"]): string => ({
    observation: t("Observation recorded"),
    assessment: t("Exercise assessment"),
    coordination: t("Coordination note"),
    resolution: t("Scenario resolution"),
  })[kind];
  function shortDelay(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return t("Unknown");
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  const tabs = [
    { value: "overview" as View, label: t("Overview"), icon: LayoutDashboard },
    { value: "evidence" as View, label: t("Evidence & provenance"), icon: Database, count: workspace.evidence.length },
    { value: "timeline" as View, label: t("Timeline"), icon: History, count: workspace.timeline.length },
    { value: "readiness" as View, label: t("Readiness"), icon: ClipboardCheck },
  ];

  return <AppShell title="Incident Intelligence" description="Explore a synthetic incident, its evidence lineage, recorded events and decision constraints."
    breadcrumbs={[{ label: t("Observe") }, { label: t("Incident Registry"), href: "/incidents" }, { label: shortId(workspace.incident.id) }]}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/incidents" className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft size={16} aria-hidden="true"/> {t("Incident Registry")}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/agency-sync" className={buttonClass()}>{t("Fictional agency tasks")} <ArrowRight size={15} aria-hidden="true"/></Link>
        <Link href="/audit" className={buttonClass()}>{t("Audit360 export")} <ArrowRight size={15} aria-hidden="true"/></Link>
        <Link href="/approvals" className={buttonClass()}>
          <ClipboardCheck size={16} aria-hidden="true"/> {t("Exercise Approval Workbench")} <ArrowRight size={15} aria-hidden="true"/>
        </Link>
      </div>
    </div>
    <div className="mb-5"><SituationBriefButton workspace={workspace}/></div>
    <div role="note" className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <ShieldAlert className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" size={20} aria-hidden="true"/>
      <p className="text-xs leading-6 text-amber-800 dark:text-amber-200">
        <strong>{t("SIMULATION · Not a real public-safety incident.")}</strong>{" "}
        {t("All sources, people labels, timestamps and event narratives on this page are synthetic exercise fixtures. This interface cannot issue live warnings or dispatch responders.")}
      </p>
    </div>

    <Panel data-tour="case-overview" className="mb-5" aria-label={t("Case overview")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{t("Incident reference · Hyderabad training area")}</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{incident.hazard_type}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={incident.status}/>
            <StatusPill tone="sample">{t("Synthetic exercise")}</StatusPill>
            <span className="text-xs text-muted">{t("Case opened")} {timeInIndia(incident.created_at)}</span>
            <DataFreshness observedAt={incident.created_at} staleAfterHours={YEARS}/>
          </div>
        </div>
        <CopyButton value={incident.id} label={t("Copy case ID")}/>
      </div>
      <p className="mt-5 break-all rounded-lg bg-elevated/60 px-3 py-2 font-mono text-xs text-muted">{incident.id}</p>
    </Panel>

    <StatStrip label={t("Evidence and intelligence summary")} className="xl:!grid-cols-4">
      <StatTile index={0} icon={Database} label={t("Evidence records")} value={workspace.evidence.length} tone="info" hint={t("Mock source references")}/>
      <StatTile index={1} icon={FileClock} label={t("Timeline events")} value={workspace.timeline.length} tone="info" hint={t("Training exercise only")}/>
      <StatTile index={2} icon={BrainCircuit} label={t("AI forecast")} value={t("Not assessed")} tone="warning" hint={t("No validated prediction")}/>
      <StatTile index={3} icon={ShieldCheck} label={t("Operational actions")} value={t("Disabled")} tone="success" hint={t("Approval never dispatches")}/>
    </StatStrip>

    <Tabs tour="case-tabs" idPrefix="case" label={t("Case information categories")} tabs={tabs} value={view} onChange={setView} className="mb-5"/>

    <TabPanel idPrefix="case" value="overview" active={view === "overview"}>
      <PublicSignalsNearCase lat={incident.lat} lon={incident.lon}/>
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)]">
        <Panel title={t("Geospatial context")} icon={MapPinned} description={t("Single simulated case marker · MapLibre")} className="min-w-0 overflow-hidden"
          actions={<StatusPill tone="neutral">{t("2D exercise view")}</StatusPill>}>
          <GeoMap incidents={[incident]} selectedId={selectedId} onSelect={setSelectedId}/>
          <div className="border-t border-stroke px-5 py-3 text-xs text-muted">
            {t("Coordinates")}: {incident.lat?.toFixed(5) ?? "—"}, {incident.lon?.toFixed(5) ?? "—"}
            <span className="mt-1 block">{t("Map tiles are loaded from a public provider; no restricted geography is shown.")}</span>
          </div>
        </Panel>
        <Panel aria-label={t("Operator interpretation")}>
          <p className="eyebrow">{t("Decision-support guidance")}</p>
          <h3 className="mt-3 text-lg font-bold">{t("Verify evidence before action")}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t("The evidence list below is demonstrative. In an authorized response environment, operators should verify source identity, observation time, source quality, jurisdiction and approved SOPs before drafting any recommendation.")}
          </p>
          <ol className="mt-5 space-y-3">
            {[
              ["01", t("Inspect time and origin"), t("Recorded and observed timestamps may differ.")],
              ["02", t("Check for corroboration"), t("Unverified reports are not confirmed hazards.")],
              ["03", t("Document uncertainty"), t("No calibrated model result is available for this case.")],
              ["04", t("Submit for independent review"), t("Only authorized identities can approve exercise proposals.")],
            ].map(([num, label, detail]) => <li key={num} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-xs font-bold text-accent">{num}</span>
              <span><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs leading-5 text-muted">{detail}</span></span>
            </li>)}
          </ol>
          <Link href="/playbooks" className={buttonClass({ className: "mt-6 w-full" })}>
            {t("View exercise response playbooks")} <ArrowRight size={16} aria-hidden="true"/>
          </Link>
        </Panel>
      </div>
      <SpatialAnalysis incidentId={incident.id}/>
      <IncidentTeamResponse incidentId={incident.id}/>
    </TabPanel>

    <TabPanel idPrefix="case" value="evidence" active={view === "evidence"}>
      <Panel title={t("Evidence, chronology & AI transparency")} icon={Database} description={t("Recorded exercise information · no verified real-world observations")}>
        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2" aria-label={t("Source provenance")}>
          {workspace.evidence.length === 0 && <EmptyState className="col-span-full" icon={Database} title={t("No exercise evidence is attached.")}
            body={t("Never infer that missing data confirms safety. Add or replay synthetic evidence before drawing any conclusion.")}/>}
          {workspace.evidence.map(item => {
            const Icon = kindIcon(item.source_kind);
            return <article key={item.id} className="reveal-in rounded-lg border border-stroke bg-elevated/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={18} aria-hidden="true"/></span>
                <StatusPill tone={item.quality_status === "synthetic_curated" ? "info" : "warning"}>
                  {item.quality_status === "synthetic_curated" ? t("Curated fixture") : t("Unverified fixture")}
                </StatusPill>
              </div>
              <h3 className="mt-3 text-sm font-bold">{item.source_label}</h3>
              <p className="mt-1 text-xs font-medium text-accent">{kindLabel(item.source_kind)}</p>
              <p className="mt-3 text-sm leading-6 text-muted">{item.summary}</p>
              <div className="mt-4 space-y-3 border-t border-stroke pt-4">
                <DataFreshness observedAt={item.observed_at} ingestedAt={item.ingested_at} staleAfterHours={YEARS}/>
                <KeyValueList items={[
                  { label: t("Observed"), value: <span className="text-xs font-medium">{timeInIndia(item.observed_at)}</span> },
                  { label: t("Ingested"), value: <span className="text-xs font-medium">{timeInIndia(item.ingested_at)}</span> },
                  { label: t("Simulated ingestion delay"), value: <span className="text-xs font-medium">{shortDelay(item.ingest_lag_seconds)}</span> },
                ]}/>
              </div>
            </article>;
          })}
          <p className="col-span-full text-xs leading-6 text-muted">
            {t("“Curated fixture” describes prepared exercise data; it does not mean real-world verification. No physical media, facial recognition or evidentiary chain of custody is attached.")}
          </p>
        </div>
      </Panel>
    </TabPanel>

    <TabPanel idPrefix="case" value="timeline" active={view === "timeline"}>
      <Panel title={t("Exercise chronology")} icon={History} description={t("This simulated chronology is distinct from the secured operational approval audit log.")}>
        <div className="p-5" aria-label={t("Synthetic incident chronology")}>
          {workspace.timeline.length === 0 && <EmptyState icon={History} title={t("No simulated chronology events have been entered for this case.")}
            body={t("An empty chronology does not mean nothing happened; it means nothing was recorded in this exercise.")}/>}
          <ol>
            {workspace.timeline.map((event, index) => <li key={event.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-sm font-bold text-accent">{index + 1}</span>
                {index < workspace.timeline.length - 1 && <span aria-hidden="true" className="my-2 min-h-8 w-px flex-1 bg-stroke"/>}
              </div>
              <div className="min-w-0 flex-1 pb-7">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{eventLabel(event.event_type)}</strong>
                  <StatusPill tone="sample">{t("Synthetic")}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted">{timeInIndia(event.occurred_at)} · {event.actor_label}</p>
                <p className="mt-3 text-sm leading-6">{event.summary}</p>
                <p className="mt-2 text-xs text-muted">{t("Recorded")} {timeInIndia(event.recorded_at)}</p>
              </div>
            </li>)}
          </ol>
        </div>
      </Panel>
    </TabPanel>

    <TabPanel idPrefix="case" value="readiness" active={view === "readiness"}>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5" aria-label={t("AI transparency")}>
          <h3 className="flex items-center gap-2 text-sm font-bold"><BrainCircuit size={18} aria-hidden="true" className="text-amber-700 dark:text-amber-300"/> {t("No trained forecast for this incident")}</h3>
          <p className="mt-3 text-sm leading-6 text-muted">{workspace.assessment.message}</p>
          <KeyValueList className="mt-4" items={[
            { label: t("Model version"), value: <strong className="text-xs">{t("Not available")}</strong> },
            { label: t("Calibrated probability"), value: <strong className="text-xs">{t("Not available")}</strong> },
            { label: t("Prediction horizon"), value: <strong className="text-xs">{t("Not available")}</strong> },
          ]}/>
        </section>
        <section className="rounded-lg border border-stroke bg-elevated/30 p-5" aria-label={t("Human decision boundary")}>
          <h3 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={18} aria-hidden="true" className="text-accent"/> {t("Human decision boundary")}</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            {t("IndTrana may document simulated analyses and internal proposals. Real alerting, emergency dispatch and life-safety commands are not connected. Any future operational workflow requires authorized human oversight.")}
          </p>
          <p className="mt-4 text-xs text-muted">{t("Response generated")} {timeInIndia(workspace.generated_at)}</p>
          <Link href="/model-lab" className="mt-4 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-accent hover:underline">{t("Explore offline synthetic model evaluation")} <ArrowRight size={14} aria-hidden="true"/></Link>
        </section>
      </div>
      <AssessmentReadiness incidentId={incident.id}/>
    </TabPanel>

    <GroundedEvidenceGuide incidentId={workspace.incident.id}/>
  </AppShell>;
}
