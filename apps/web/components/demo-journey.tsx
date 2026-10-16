"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenCheck, ClipboardCheck, Compass, Database, FlaskConical, RadioTower, ShieldAlert, UsersRound, Workflow, Archive } from "lucide-react";

type ReadinessState = "ready" | "not_ready" | "unavailable";
interface Snapshot {
  database: ReadinessState;
  caseAvailable: boolean;
  sourceAvailable: boolean;
  assessmentState: "simulated_context_for_human_review" | "insufficient_simulated_context" | "unavailable";
  taskCount: number | null;
  scriptedAcknowledgements: number | null;
  modelLabAvailable: boolean;
}
const EXAMPLE = "22222222-2222-4222-8222-222222222222";
const steps = [
  {
    title: "Confirm the simulated environment",
    subtitle: "Startup and safety gate",
    description: "Check that PostGIS migrations, fictional incidents and source fixtures exist. A passing preflight does not mean sensors are connected or that the public is safe.",
    href: "/help",
    link: "Review environment guidance",
    icon: ShieldAlert,
    playbook: "Setup prerequisite",
  },
  {
    title: "Inspect DataFusion ingestion",
    subtitle: "Validate event contracts and duplicate handling",
    description: "Observe the synthetic ingestion ledger and metadata-only quarantine. The replay is a deliberately separate, reviewed Docker CLI action—not a live feed.",
    href: "/ingestion",
    link: "Open DataFusion Monitor",
    icon: Workflow,
    playbook: "Observation provenance",
  },
  {
    title: "Check source freshness",
    subtitle: "Observed time versus ingestion time",
    description: "Review late, missing and clock-anomalous observations. A recently ingested old measurement is still stale.",
    href: "/sources",
    link: "Open Source Observatory",
    icon: RadioTower,
    playbook: "Step 01 · Verify observations",
  },
  {
    title: "Open the synthetic incident",
    subtitle: "Evidence manifest and case chronology",
    description: "Explore fictional case evidence, quality labels, original times, exercise chronology and the geospatial context of the simulated incident.",
    href: "/incidents/" + EXAMPLE,
    link: "Open example incident",
    icon: Database,
    playbook: "Step 01 · Inspect evidence",
  },
  {
    title: "Interpret geographic candidates",
    subtitle: "Proximity is not demonstrated impact",
    description: "Examine sources and fictional infrastructure within a selected radius. Neither physical flood depth nor actual facility damage is assessed.",
    href: "/incidents/" + EXAMPLE,
    link: "Explore PostGIS candidates",
    icon: Compass,
    playbook: "Step 02 · Geographic review",
  },
  {
    title: "Review model limitations",
    subtitle: "Offline synthetic evaluation only",
    description: "The Model Lab shows reproducible generated-label metrics; its artificial holdout performance is not a validated flood forecast for Hyderabad.",
    href: "/model-lab",
    link: "View Model Evaluation Lab",
    icon: FlaskConical,
    playbook: "Human uncertainty review",
  },
  {
    title: "Use the illustrative response playbook",
    subtitle: "Citations and human review checklist",
    description: "Read the exercise-only playbook before drafting actions. It is not an approved SOP; no recommendations can directly dispatch responders.",
    href: "/playbooks",
    link: "Open cited exercise playbook",
    icon: BookOpenCheck,
    playbook: "Steps 03–05 · Version 0.1",
  },
  {
    title: "Inspect the independent checker gate",
    subtitle: "Authenticated exercise approvals",
    description: "An operator may draft a simulated proposal, but only a separate OIDC-verified checker can review it. Without a provisioned IdP the workbench intentionally remains locked.",
    href: "/approvals",
    link: "Open Approval Workbench",
    icon: ClipboardCheck,
    playbook: "Step 04 · Accountable review",
  },
  {
    title: "Inspect scripted department acknowledgements",
    subtitle: "AgencySync and scenario audit",
    description: "Review seven fictional desk tasks and their prepared, acknowledged and closed events. These are read-only scripted history; no real message was sent.",
    href: "/agency-sync",
    link: "Open AgencySync",
    icon: UsersRound,
    playbook: "Step 05 · Simulated response history",
  },
  {
    title: "Export the synthetic case trace",
    subtitle: "Audit360 checksum and reviewed evidence",
    description: "Download a bounded synthetic incident bundle containing case chronology, evidence references, human-review checklist and scripted department events. Its SHA-256 is an unsigned content checksum, not a legal audit attestation.",
    href: "/audit",
    link: "Open Audit360 export",
    icon: Archive,
    playbook: "Review traceability and provenance",
  },
];

export function DemoJourney({ snapshot }: { snapshot: Snapshot }) {
  const [active, setActive] = useState(0);
  const current = steps[active];
  const ActiveIcon = current.icon;
  return <>
    <div role="note" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200">
      <ShieldAlert size={20} className="mt-1 shrink-0"/>
      <p><strong>Tabletop simulation only.</strong> This walkthrough uses fictional Hyderabad incident fixtures. It cannot forecast actual floods, contact departments, issue public warnings or dispatch responders. Advancing a step only changes what is shown on this page.</p>
    </div>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Demonstration environment snapshot">
      {[
        ["Local database", snapshot.database === "ready" ? "Fixtures present" : snapshot.database === "not_ready" ? "Not ready" : "Unavailable", "Schema and seeds, not field readiness"],
        ["Case evidence", snapshot.caseAvailable ? "Demo case found" : "Unavailable", "Synthetic incident only"],
        ["Assessment", snapshot.assessmentState === "simulated_context_for_human_review" ? "Demo context available" :
         snapshot.assessmentState === "insufficient_simulated_context" ? "Insufficient demo context" : "Unavailable", "Never a validated flood prediction"],
        ["AgencySync", snapshot.taskCount === null ? "Unavailable" : snapshot.taskCount + " scripted tasks",
          snapshot.scriptedAcknowledgements === null ? "No field contacts" : snapshot.scriptedAcknowledgements + " simulated acknowledgements"],
      ].map(([heading,value,caption]) => <article className="panel p-4" key={heading}>
        <h2 className="text-xs font-semibold text-muted">{heading}</h2>
        <p className="mt-3 text-base font-bold">{value}</p>
        <p className="mt-2 text-[11px] text-muted">{caption}</p>
      </article>)}
    </section>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(210px,.65fr)_minmax(0,1.4fr)]">
      <nav className="panel p-3" aria-label="Exercise demo steps">
        <p className="eyebrow px-3 pt-2">Guided journey · {steps.length} stages</p>
        <div className="mt-3 space-y-1">
          {steps.map((step,index) => <button key={step.title} type="button"
            onClick={() => setActive(index)} aria-current={index === active ? "step" : undefined}
            className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-xs font-semibold transition-colors ${index === active ? "bg-accent/10 text-accent" : "text-muted hover:bg-elevated"}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/30 text-[11px] tabular-nums">{index+1}</span>
            <span>{step.title}</span>
          </button>)}
        </div>
      </nav>
      <article className="panel min-w-0 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Stage {active+1} / {steps.length}</span>
          <span className="rounded-full bg-elevated px-3 py-1 text-[11px] font-semibold text-muted">No live actions</span>
        </div>
        <div className="mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent"><ActiveIcon size={27}/></div>
        <h2 className="mt-5 text-xl font-bold">{current.title}</h2>
        <p className="mt-2 text-sm font-semibold text-accent">{current.subtitle}</p>
        <p className="mt-4 text-sm leading-7 text-muted">{current.description}</p>
        <div className="mt-5 rounded-xl border border-stroke bg-elevated/40 p-4 text-xs leading-6">
          <p className="font-semibold">Exercise reference</p>
          <p className="mt-1 text-muted">{current.playbook} · AEGIS-URBAN-FLOOD-EXERCISE-v0.1</p>
        </div>
        <div className="mt-6">
          <Link href={current.href} className="control control-primary inline-flex text-sm">
            {current.link} <ArrowRight size={16}/>
          </Link>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-stroke pt-5">
          <button type="button" onClick={() => setActive(index => Math.max(0,index-1))}
            disabled={active===0} className="control text-xs"><ArrowLeft size={15}/> Previous</button>
          <span className="text-xs text-muted">Navigation does not approve, notify or mutate data.</span>
          <button type="button" className="control text-xs"
            disabled={active === steps.length-1}
            onClick={() => setActive(index => Math.min(steps.length-1,index+1))}>Next stage <ArrowRight size={15}/></button>
        </div>
      </article>
    </div>
    <p className="mt-5 text-xs leading-6 text-muted">
      The demo uses only seeded exercise incidents and reads the actual local API where available.
      The browser does not fabricate missing results. The separate OIDC login and full Windows Docker acceptance still require authorized testing.
    </p>
  </>;
}
