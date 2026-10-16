import Link from "next/link";
import { ArrowRight, BookOpenCheck, CheckCircle2, ShieldAlert } from "lucide-react";
import { AppShell } from "../../components/app-shell";

// Versioned teaching reference, not an official emergency response SOP.
const PLAYBOOK = "AEGIS-URBAN-FLOOD-EXERCISE-v0.1";
const steps = [
  { id: "URB-01", title: "Verify the simulated observation", details: "Check exercise source identity, observation-versus-ingestion times, configured update interval, measurement units and case-specific evidence. Missing data never implies safety." },
  { id: "URB-02", title: "Inspect geographic candidates", details: "Review fictional road, shelter, drainage and care facility points only as proximity candidates; do not infer flood depth, actual exposure or damage." },
  { id: "URB-03", title: "Prepare an evidence-cited tabletop recommendation", details: "Reference the incident ID, synthetic source/evidence UUIDs and this playbook version. Describe uncertainty, missing corroboration and fictional desk ownership. Do not send an order." },
  { id: "URB-04", title: "Request independent exercise authorization", details: "Only a verified checker may review a maker's submitted proposal. The browser workbench stays locked when no trusted identity provider is configured. No live warning or dispatch can execute." },
  { id: "URB-05", title: "Inspect scripted department acknowledgements", details: "Open the AgencySync board to inspect seeded prepared, acknowledged and closed task events. These fictional acknowledgements were not received from real responders." },
];
export default function PlaybooksPage() {
  return <AppShell title="Response Playbooks"
    description="Versioned citation reference for the integrated urban-flood exercise; not an approved emergency SOP.">
    <div role="note" className="mb-5 flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
      <ShieldAlert size={20} className="shrink-0"/>
      <span>SIMULATION ONLY. These review steps are illustrative. Real emergency procedures require authority approval, validated data and separate human decisions.</span>
    </div>
    <section className="panel overflow-hidden">
      <div className="panel-heading">
        <div><h2 className="flex items-center gap-2 text-base font-bold"><BookOpenCheck size={19} className="text-accent"/> Urban Flood Exercise · Referenced Steps</h2>
          <p className="mt-1 font-mono text-xs text-muted">{PLAYBOOK}</p></div>
        <span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">Draft · Unapproved</span>
      </div>
      <div className="space-y-3 p-5">
        {steps.map((step,index) => <details className="group rounded-xl border border-stroke bg-elevated/40 p-4" key={step.id} open={index === 0}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm font-semibold">
            <CheckCircle2 size={18} className="shrink-0 text-accent"/>
            <span className="rounded bg-accent/10 px-2 py-1 font-mono text-xs text-accent">{step.id}</span>{step.title}
          </summary>
          <p className="ml-8 mt-3 text-sm leading-6 text-muted">{step.details}</p>
        </details>)}
      </div>
    </section>
    <section className="panel mt-5 p-5" aria-label="Exercise playbook cross references">
      <h3 className="text-sm font-bold">Continue the cited tabletop workflow</h3>
      <p className="mt-2 text-xs leading-6 text-muted">The incident review checklist cites this version and source/evidence UUIDs, while AgencySync task rows reference the same version. These links are explanatory—not operational authorization.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/demo" className="control text-xs">Guided walkthrough <ArrowRight size={15}/></Link>
        <Link href="/incidents/22222222-2222-4222-8222-222222222222" className="control text-xs">Synthetic case evidence <ArrowRight size={15}/></Link>
        <Link href="/agency-sync" className="control text-xs">Scripted task audit <ArrowRight size={15}/></Link>
        <Link href="/approvals" className="control text-xs">Human approval gate <ArrowRight size={15}/></Link>
      </div>
    </section>
  </AppShell>;
}
