"use client";
import { useState } from "react";
import { Activity, Database, LockKeyhole, RadioTower, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AppShell } from "../../components/app-shell";

const modes = [
  { id: "observe", label: "Observe only", description: "Collect and inspect observations without preparing operational actions." },
  { id: "recommend", label: "Recommend", description: "Generate proposed actions for authorized human review." },
  { id: "supervised", label: "Supervised internal triage", description: "Route reversible internal tasks within preapproved policy boundaries." },
] as const;
const integrations = [
  { name: "India Meteorological Department", purpose: "Weather and warning data" },
  { name: "NDMA SACHET", purpose: "Official disaster alert interoperability" },
  { name: "Municipal sensor network", purpose: "Rainfall, water level and infrastructure" },
  { name: "Authorized edge vision", purpose: "Environmental imagery observations" },
];
export default function AdminPage() {
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("recommend");
  const [auditPreview, setAuditPreview] = useState(true);
  const selected = modes.find(item => item.id === mode)!;
  return <AppShell title="Administration" description="Preview future policy controls, data sources and governance requirements. Nothing on this screen changes backend authorization.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
      <LockKeyhole className="mt-0.5 shrink-0" size={18}/><div><strong>Configuration preview only</strong><p className="mt-1 text-xs leading-5">Authentication, role-based policy enforcement and persistent administration are not implemented in this exercise UI. Critical actions remain unavailable.</p></div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
      <section className="panel">
        <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><SlidersHorizontal size={18} className="text-accent"/> AI operating mode</h2><span className="eyebrow">Preview</span></div>
        <fieldset className="space-y-3 p-5"><legend className="sr-only">Select simulated AI policy mode</legend>
          {modes.map(item => <label key={item.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${mode === item.id ? "border-accent bg-accent/5" : "border-stroke hover:bg-elevated"}`}>
            <input type="radio" className="mt-1 accent-teal-500" name="ai-mode" value={item.id} checked={mode === item.id} onChange={() => setMode(item.id)}/>
            <span><strong className="text-sm">{item.label}</strong><span className="mt-1 block text-xs leading-5 text-muted">{item.description}</span></span>
          </label>)}
          <div className="mt-4 rounded-xl bg-elevated p-4"><p className="eyebrow">Selected preview</p><p className="mt-2 text-sm font-semibold">{selected.label}</p><p className="mt-1 text-xs text-muted">{selected.description}</p></div>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-stroke p-4"><span><strong className="text-sm">Show audit reminder</strong><span className="mt-1 block text-xs text-muted">Local UI preference; no server changes.</span></span><input type="checkbox" className="h-4 w-4 accent-teal-500" checked={auditPreview} onChange={event => setAuditPreview(event.target.checked)}/></label>
          {auditPreview && <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck size={15} className="text-accent"/>All future action policies require versioned audit records.</p>}
        </fieldset>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><RadioTower size={18} className="text-accent"/> Integration Registry</h2><span className="eyebrow">Planned</span></div>
        <div className="divide-y divide-stroke px-5">{integrations.map(item => <div key={item.name} className="flex items-start justify-between gap-3 py-4"><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted">{item.purpose}</p></div><span className="shrink-0 rounded-full bg-elevated px-2.5 py-1 text-[11px] text-muted">Not connected</span></div>)}</div>
      </section>
    </div>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      {[{icon:LockKeyhole,title:"Maker-checker",desc:"Separate reviewer identity required for consequential actions."},{icon:Database,title:"Data provenance",desc:"Source identity, freshness and evidence lineage."},{icon:Activity,title:"Model governance",desc:"Versioned evaluation, drift checks and controlled rollout."}].map(item => <div className="panel p-5" key={item.title}><item.icon size={21} className="text-accent"/><h3 className="mt-3 text-sm font-bold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-muted">{item.desc}</p><span className="mt-4 inline-block text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-300">Planned capability</span></div>)}
    </div>
  </AppShell>;
}
