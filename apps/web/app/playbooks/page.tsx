"use client";
import { recordIdTitle } from "../../lib/labels";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, CheckCircle2, ShieldAlert } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { useT } from "../../components/language-provider";
import { EmptyState, SearchField, StatStrip, StatTile, buttonClass, Panel } from "../../components/ui";

// Versioned teaching reference, not an official emergency response SOP.
const PLAYBOOK = "AEGIS-URBAN-FLOOD-EXERCISE-v0.1";
const PREREQS: Record<string, string[]> = {
  "URB-01": ["Exercise source identified", "Units and update interval checked"],
  "URB-02": ["Observation verified", "Map candidates treated as proximity only"],
  "URB-03": ["Evidence UUIDs cited", "Uncertainty stated"],
  "URB-04": ["Maker proposal submitted", "Independent verified checker available"],
  "URB-05": ["Proposal approved in exercise", "AgencySync board opened"],
};
const steps = [
  { id: "URB-01", title: "Verify the simulated observation", details: "Check exercise source identity, observation-versus-ingestion times, configured update interval, measurement units and case-specific evidence. Missing data never implies safety." },
  { id: "URB-02", title: "Inspect geographic candidates", details: "Review fictional road, shelter, drainage and care facility points only as proximity candidates; do not infer flood depth, actual exposure or damage." },
  { id: "URB-03", title: "Prepare an evidence-cited tabletop recommendation", details: "Reference the incident ID, synthetic source/evidence UUIDs and this playbook version. Describe uncertainty, missing corroboration and fictional desk ownership. Do not send an order." },
  { id: "URB-04", title: "Request independent exercise authorization", details: "Only a verified checker may review a maker's submitted proposal. The browser workbench stays locked when no trusted identity provider is configured. No live warning or dispatch can execute." },
  { id: "URB-05", title: "Inspect scripted department acknowledgements", details: "Open the AgencySync board to inspect seeded prepared, acknowledged and closed task events. These fictional acknowledgements were not received from real responders." },
];
export default function PlaybooksPage() {
  const t = useT();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => steps.filter(x => !query.trim() || `${x.id} ${x.title} ${x.details}`.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  return <AppShell title="Response Playbooks"
    description="Versioned citation reference for the integrated urban-flood exercise; not an approved emergency SOP.">
    <div role="note" className="mb-5 flex items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
      <ShieldAlert size={20} className="shrink-0"/>
      <span>SIMULATION ONLY. These review steps are illustrative. Real emergency procedures require authority approval, validated data and separate human decisions.</span>
    </div>
    <StatStrip label={t("Playbook summary")}>
      <StatTile label={t("Steps")} value={steps.length} icon={BookOpenCheck}/>
      <StatTile label={t("Shown")} value={shown.length} icon={CheckCircle2}/>
    </StatStrip>
    <SearchField label={t("Search playbook steps")} value={query} onChange={setQuery} className="mb-4"/>
    <Panel className="overflow-hidden" bodyClassName="p-0" icon={BookOpenCheck} title="Urban Flood Exercise · Referenced Steps" description={recordIdTitle(PLAYBOOK)}
      actions={<span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">Draft · Unapproved</span>}>
        {shown.length === 0 && <div className="md:col-span-2"><EmptyState title={t("No playbook steps match")} body={t("No match does not mean a step is unnecessary; clear the search to see all steps.")}/></div>}
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {shown.map((step,index) => <details className="group rounded-lg border border-stroke bg-elevated/40 p-4" key={step.id} open={index === 0 && !query}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm font-semibold">
            <CheckCircle2 size={18} className="shrink-0 text-accent"/>
            <span className="rounded bg-accent/10 px-2 py-1 font-mono text-xs text-accent">{step.id}</span>{step.title}
          </summary>
          <p className="ml-8 mt-3 text-sm leading-6 text-muted">{step.details}</p>
          <ul className="ml-8 mt-3 space-y-1 text-xs text-muted" aria-label={t("Prerequisites")}>
            {(PREREQS[step.id] ?? []).map(item => <li key={item} className="flex items-center gap-2"><CheckCircle2 size={13} aria-hidden="true" className="text-accent"/>{item}</li>)}
          </ul>
        </details>)}
      </div>
    </Panel>
    <Panel className="mt-5" aria-label="Exercise playbook cross references">
      <h3 className="text-sm font-bold">Continue the cited tabletop workflow</h3>
      <p className="mt-2 text-xs leading-6 text-muted">The incident review checklist cites this version and source/evidence UUIDs, while AgencySync task rows reference the same version. These links are explanatory—not operational authorization.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/demo" className={buttonClass({ size: "sm" })}>Guided walkthrough <ArrowRight size={15}/></Link>
        <Link href="/incidents/22222222-2222-4222-8222-222222222222" className={buttonClass({ size: "sm" })}>Synthetic case evidence <ArrowRight size={15}/></Link>
        <Link href="/agency-sync" className={buttonClass({ size: "sm" })}>Scripted task audit <ArrowRight size={15}/></Link>
        <Link href="/approvals" className={buttonClass({ size: "sm" })}>Human approval gate <ArrowRight size={15}/></Link>
      </div>
    </Panel>
  </AppShell>;
}
