"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, BrainCircuit, Database, Keyboard, LifeBuoy, LockKeyhole, RadioTower, Search, ShieldCheck } from "lucide-react";
import { AppShell } from "../../components/app-shell";

type Guide = {
  title: string;
  category: "Getting started" | "Security" | "Data" | "AI transparency";
  description: string;
  answer: string;
  href?: string;
};
const guides: Guide[] = [
  { title: "What does the Model Evaluation Lab measure?", category: "AI transparency", description: "Synthetic holdout testing is not forecasting accuracy",
    answer: "The lab tests a reproducible logistic baseline on artificially generated scenarios. Entire scenario groups are held out to help demonstrate leakage prevention and the evaluation pipeline. ROC AUC, Brier score and confusion counts apply only to this synthetic dataset; they do not establish real flood predictive skill or calibrated warning probabilities.", href: "/model-lab" },
  { title: "How do I start AEGIS on Windows?", category: "Getting started", description: "Run the Docker Compose development environment",
    answer: "Open PowerShell in the AI-Project-AEGIS folder, run docker compose up --build -d, and visit http://localhost:3000. Use docker compose ps and docker compose logs if containers do not start." },
  { title: "Why is my Approval Workbench locked?", category: "Security", description: "Understanding secure operator sign-in",
    answer: "Approval actions require a trusted OIDC provider and signed agency/role claims. No demo operator account or unrestricted login bypass is provided. A separate verified checker must review submitted proposals.", href: "/approvals" },
  { title: "What does synthetic exercise mean?", category: "Data", description: "Understanding source labels and their limitations",
    answer: "The current events, sensor readings and exercise cases are synthetic fixtures. They do not reflect actual active disasters and must not be used to order operational responses." },
  { title: "Why are the map tiles blank?", category: "Getting started", description: "Troubleshooting MapLibre and internet access",
    answer: "This demo requests public OSM map tiles and requires WebGL support plus a network connection. Incident records should remain available in the registry even if map tiles cannot load.", href: "/incidents" },
  { title: "Can AI automatically dispatch responders?", category: "AI transparency", description: "Understanding human oversight",
    answer: "No. AEGIS cannot issue real public alerts or dispatch responders from its exercise interface. In a future authorized deployment, consequential decisions must remain gated behind accountable human approval." },
  { title: "Is the rain-risk chart an actual forecast?", category: "AI transparency", description: "Distinguish AI outputs from illustrative telemetry",
    answer: "No. The exercise chart displays a fixed synthetic telemetry fixture and the sample hazard index is not a calibrated probability. Future trained predictions will require independent datasets, uncertainty, holdout validation, drift checks and model versioning." },
  { title: "How do I search all incidents?", category: "Getting started", description: "Find cases with filters and pagination",
    answer: "Press Ctrl+K (Command+K on macOS) for global navigation, or open Incident Registry. Use keyword search, status filters, sortable columns and page size controls. Current universal search only covers navigation and synthetic exercise incidents, not private agency data.", href: "/incidents" },
  { title: "How is approval history audited?", category: "Security", description: "Maker-checker controls and audit records",
    answer: "Exercise proposal transitions are written within PostgreSQL transactions and include actor identities, review rationale and audit events. Production-grade immutable retention, IdP lifecycle and full audit reporting are still on the roadmap." },
  { title: "How is exercise data replay validated?", category: "Data", description: "Versioned contracts, duplicates and quarantine",
    answer: "The bundled DataFusion replay accepts only signed-off synthetic event fixtures from the local Docker CLI. It validates contract version, source identity, measurement units and timestamps; accepted samples are idempotent by event ID, while invalid or conflicting events are quarantined as metadata. No live ingestion route is available.", href: "/ingestion" },
  { title: "What does source freshness mean?", category: "Data", description: "Distinguish delayed, stale, absent and clock-anomalous readings",
    answer: "The Source Freshness screen compares the age of the latest synthetic observation to each source's configured update interval. Within window, delayed, stale, no data and clock anomaly describe timestamp validity only—not sensor accuracy, provider reliability or flood probability.", href: "/sources" },
  { title: "Why does the data feed show unavailable?", category: "Data", description: "Read freshness and degraded-service states",
    answer: "The Next.js dashboard relies on FastAPI and PostGIS. Check docker compose ps, then docker compose logs --tail=80 api db. The UI indicates stale data rather than silently treating old observations as current." },
  { title: "How do I switch theme or reduce motion?", category: "Getting started", description: "Appearance and accessibility preferences",
    answer: "Use the theme control in the top-right application header. The interface respects your initial system theme and the operating system's reduced-motion preference." },
  { title: "How will official weather APIs be integrated?", category: "Data", description: "Planned authorized integration architecture",
    answer: "A versioned source adapter will validate API permissions, provenance, timestamp freshness, units and signatures. No government integration is configured in the current exercise build." },
  { title: "What is retrieval-augmented AI?", category: "AI transparency", description: "Grounded recommendations and verified procedures",
    answer: "A future assistant will retrieve approved SOPs, cite original sources and separate observed facts from generated suggestions. It must never autonomously approve an action, and no production RAG assistant is connected yet." },
];
const categories = ["All topics", "Getting started", "Security", "Data", "AI transparency"] as const;

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All topics");
  const visible = useMemo(() => guides.filter(item =>
    (category === "All topics" || item.category === category) &&
    (!query.trim() || [item.title, item.description, item.answer, item.category].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
  ), [category,query]);

  return <AppShell title="Help & Learning" description="Contextual guidance, self-service troubleshooting, accessibility and transparent AI limitations.">
    <div className="signal-surface relative mb-6 overflow-hidden rounded-2xl border border-stroke bg-surface p-6 sm:p-8">
      <div className="relative z-10 max-w-2xl">
        <p className="eyebrow flex items-center gap-2"><LifeBuoy size={16} className="text-accent"/> Knowledge Center</p>
        <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">Answers for every stage of the response exercise</h2>
        <p className="mt-3 text-sm leading-6 text-muted">Explore concise, verified product guidance. AI-generated help is not connected yet; this library contains curated application documentation.</p>
        <div className="relative mt-5"><Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-3 text-muted"/>
          <input type="search" className="field !h-11 !pl-11" aria-label="Search self-help articles" value={query}
            onChange={event => setQuery(event.target.value)} placeholder="Search login, incident search, AI, alerts..." maxLength={150}/>
        </div>
      </div>
    </div>
    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Quick links">
      {[
        { label: "Incident Registry", detail: "Search and filter records", icon: Database, href: "/incidents" },
        { label: "Source Freshness", detail: "Inspect synthetic data timeliness", icon: RadioTower, href: "/sources" },
        { label: "Response Playbooks", detail: "Approved-response preparation", icon: BookOpenCheck, href: "/playbooks" },
        { label: "Operator Approvals", detail: "Maker-checker guidance", icon: LockKeyhole, href: "/approvals" },
        { label: "AI Transparency", detail: "What models can and cannot do", icon: BrainCircuit, href: "#help-articles" },
      ].map(item => <Link key={item.label} href={item.href} className="panel group block p-4 transition-colors hover:border-accent/40 hover:bg-elevated/70">
        <item.icon size={22} className="text-accent"/><h3 className="mt-3 flex items-center gap-2 text-sm font-bold">{item.label}<ArrowRight size={14} className="opacity-50 transition-transform group-hover:translate-x-1"/></h3>
        <p className="mt-1 text-xs text-muted">{item.detail}</p>
      </Link>)}
    </section>
    <section className="panel overflow-hidden" id="help-articles">
      <div className="panel-heading"><div><h2 className="text-base font-bold">Support articles & FAQs</h2><p className="mt-1 text-xs text-muted">Browse curated answers; no chatbot hallucinations</p></div>
        <span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">{visible.length} articles</span></div>
      <div className="flex flex-wrap gap-2 border-b border-stroke p-4" aria-label="Help article categories">
        {categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)}
          aria-pressed={category===item}
          className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${category===item ? "border-accent bg-accent/10 text-accent":"border-stroke text-muted hover:bg-elevated"}`}>
          {item}
        </button>)}
      </div>
      <div className="divide-y divide-stroke px-4 sm:px-5" aria-live="polite">
        {visible.map(item => <details key={item.title} className="group py-4">
          <summary className="cursor-pointer list-none rounded-md pr-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-accent">{item.category}</span>
            <span className="block text-sm font-bold">{item.title}</span><span className="mt-1 block text-xs text-muted">{item.description}</span>
            <span className="mt-2 block text-xs text-muted group-open:hidden">Expand answer +</span>
          </summary>
          <p className="mt-3 max-w-3xl rounded-xl bg-elevated/60 p-4 text-sm leading-7 text-ink">{item.answer}</p>
          {item.href && <Link className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent" href={item.href}>Open related module <ArrowRight size={14}/></Link>}
        </details>)}
        {visible.length === 0 && <p className="p-8 text-center text-sm text-muted">No help articles match. Try another query or select All topics.</p>}
      </div>
    </section>
    <div className="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-6 text-muted">
      <ShieldCheck className="mt-1 shrink-0 text-amber-500" size={18}/>
      <span>Emergency procedures must be approved by the responsible agency. These help articles describe a synthetic hackathon application and are not public emergency instructions.</span>
      <span className="ml-auto flex items-center gap-2"><Keyboard size={16}/> Ctrl/⌘ + K for global search</span>
    </div>
  </AppShell>;
}
