import { BookOpenCheck, CheckCircle2, ShieldAlert } from "lucide-react";
import { AppShell } from "../../components/app-shell";

const steps = [
  { title: "1. Verify the observation", details: "Check source identity, measurement age, geography and corroborating evidence before escalating." },
  { title: "2. Assess potential exposure", details: "Review roads, drainage, essential services and vulnerable infrastructure against validated hazard information." },
  { title: "3. Prepare a response recommendation", details: "Draft department-specific tasks with rationale, uncertainty, evidence references and clear ownership." },
  { title: "4. Obtain independent authorization", details: "Route consequential decisions to an authorized checker. The maker must not approve their own proposal." },
  { title: "5. Track acknowledgements and outcomes", details: "Capture human decisions, agency updates, evidence and verified outcomes for later evaluation." },
];
export default function PlaybooksPage() {
  return <AppShell title="Response Playbooks" description="Exercise reference workflow for multi-agency urban flood response. Not an approved emergency SOP.">
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"><ShieldAlert size={20}/><span>Illustrative playbook only. Actual operational procedures must be approved by the relevant authorities.</span></div>
    <section className="panel overflow-hidden">
      <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><BookOpenCheck size={19} className="text-accent"/> Urban flood response · exercise flow</h2><span className="eyebrow">Version 0.1 · Draft</span></div>
      <div className="space-y-3 p-5">{steps.map((step,index) => <details className="group rounded-xl border border-stroke bg-elevated/40 p-4" key={step.title} open={index === 0}><summary className="flex cursor-pointer items-center gap-3 text-sm font-semibold"><CheckCircle2 size={18} className="shrink-0 text-accent"/>{step.title}</summary><p className="ml-8 mt-3 text-sm leading-6 text-muted">{step.details}</p></details>)}</div>
    </section>
  </AppShell>;
}
