"use client";

// Go-Live Setup: one read-only inventory of every external API, key, secret, switch and agreement IndTrana needs,
// where each is configured and what this page can detect. It never shows, accepts or stores a secret value.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleDashed, ExternalLink, KeyRound, LockKeyhole, PlugZap, ShieldAlert, ToggleLeft, XCircle } from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { SortableTable, Panel, buttonClass } from "../../../components/ui";
import { documentParts, documentPhrase, documentText, documentTitle } from "../../../lib/labels";

type Kind = "secret" | "setting" | "switch" | "key" | "agreement" | "none";
type Check = "session" | "earth" | "intake";
type Item = { name: string; kind: Kind; needed: string; where: string; how: string; check?: Check; link?: { href: string; label: string } };
type Section = { id: string; title: string; summary: string; items: Item[] };

const SECTIONS: Section[] = [
  { id: "identity", title: "1 · Sign-in and roles (OIDC)", summary: "Without these, nobody can sign in and every protected workflow stays locked. Roles and agency come from signed token claims.", items: [
    { name: "OIDC_ISSUER · OIDC_AUDIENCE · OIDC_JWKS_URL", kind: "setting", needed: "Required to go live", where: "Host .env file (read by Compose for API and web)", how: "From your identity provider (for example Keycloak or Entra ID). Tokens must carry the signed IndTrana agency UUID and roles.", check: "session" },
    { name: "OIDC_CLIENT_ID", kind: "setting", needed: "Required for browser sign-in", where: "Host .env file", how: "Register IndTrana as a web application with redirect URL APP_ORIGIN/api/auth/callback." },
    { name: "OIDC_CLIENT_SECRET", kind: "secret", needed: "Only if your provider requires a confidential client", where: "Host .env file (never in the repository)", how: "Issued by the identity provider when the client is registered." },
    { name: "BFF_SESSION_KEY_BASE64", kind: "secret", needed: "Required for browser sign-in", where: "Host .env file (never in the repository)", how: "32 random bytes, base64. Generate locally; the PowerShell one-liner is in .env.example." },
    { name: "APP_ORIGIN", kind: "setting", needed: "Required (public URL of this site)", where: "Host .env file", how: "For example https://aegis.example.gov. Must match the redirect URL registered with the provider." },
    { name: "Operator accounts with roles and MFA", kind: "agreement", needed: "Required", where: "Your identity provider", how: "Create a separate real account for each person, with one of the five roles (Maker, Checker, Auditor, Department desk, Administrator). The exact role ids are listed under Users and access. Maker and checker must be different people." },
  ]},
  { id: "platform", title: "2 · Platform secrets", summary: "Set on the host before first start. They cannot be read or changed from the browser, by design.", items: [
    { name: "POSTGRES_PASSWORD", kind: "secret", needed: "Required (replace the local-only default)", where: "Host .env file", how: "Choose a strong unique password before any non-local deployment. Never reuse the local-only default." },
    { name: "AEGIS_CONNECTOR_KEY", kind: "secret", needed: "Required to store connector keys", where: "Host .env file", how: "Run scripts/new-connector-key.ps1. It encrypts connector secrets at rest; losing it means re-entering every key." },
    { name: "TLS certificate and reverse proxy", kind: "agreement", needed: "Required outside a laptop", where: "Your hosting environment", how: "Serve the site over HTTPS only. Not part of this repository." },
  ]},
  { id: "switches", title: "3 · Feature switches (all default OFF)", summary: "Chosen when IndTrana is started. Each stays off unless its switch is given.", items: [
    { name: "-StatisticalForecast (AEGIS_TIMESFM, AEGIS_TIMESFM_CACHE)", kind: "switch", needed: "Optional: statistical river forecast in Live Earth", where: "scripts/start-windows.ps1 -StatisticalForecast", how: "Download the TimesFM 2.5 weights once on the host and point AEGIS_TIMESFM_CACHE at the cache folder. Display-only; adds about 1.6 GB. Use 2.5 only: the 3.0 weights are not licensed for production." },
    { name: "-PublicEarth (AEGIS_PUBLIC_EARTH_FEEDS)", kind: "switch", needed: "Needed for Earth Watch and Alert Journey live mode", where: "scripts/start-windows.ps1 -PublicEarth", how: "Display-only public reference data. Never stored or used by cases, approvals or alerts.", check: "earth", link: { href: "/alert-journey?mode=live", label: "Open Alert Journey live mode" } },
    { name: "-PublicIntake (AEGIS_PUBLIC_INTAKE)", kind: "switch", needed: "Optional", where: "scripts/start-windows.ps1 -PublicIntake", how: "Quarantine-only public reports. Needs owner and security-review approval before real use.", check: "intake" },
    { name: "-Proactive (AEGIS_PROACTIVE)", kind: "switch", needed: "Optional: hazard watch connectors", where: "scripts/start-windows.ps1 -Proactive", how: "Requires AEGIS_CONNECTOR_KEY. Exercise only; the watch itself has no send path." },
    { name: "-StaffEmail (AEGIS_STAFF_EMAIL)", kind: "switch", needed: "Optional: email notices to opted-in staff", where: "scripts/start-windows.ps1 -Proactive -StaffEmail", how: "Needs -Proactive, because the email key is kept in the connector vault. Without it, email notices do not exist on the server. With it, nothing is sent until an administrator also switches on Email on the Connectors page." },
    { name: "-ProactiveScheduler + AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID (+ _INTERVAL)", kind: "switch", needed: "Optional: scheduled watch loop", where: "scripts/start-windows.ps1 -ProactiveScheduler and host .env", how: "Agency UUID the scheduler acts for; interval in seconds (default 1800). It prepares and routes, then stops for a human." },
    { name: "-LocalCopilot (AEGIS_LOCAL_COPILOT_MODEL)", kind: "switch", needed: "Optional: local language model", where: "scripts/start-windows.ps1 -LocalCopilot", how: "Uses a model on this machine (default tinyllama:1.1b via Ollama). No cloud key." },
  ]},
  { id: "connectors", title: "4 · Data-source connectors (keys entered in the app)", summary: "A signed-in platform administrator enters these on the Connectors page. Keys are encrypted with AEGIS_CONNECTOR_KEY, never shown again and every change is audited.", items: [
    { name: "Open-Meteo", kind: "none", needed: "No key", where: "Connectors page", how: "Free for non-commercial use (CC BY 4.0). A commercial deployment needs a paid Open-Meteo plan." },
    { name: "NASA FIRMS · map key", kind: "key", needed: "Free key", where: "Connectors page", how: "Request a MAP_KEY at firms.modaps.eosdis.nasa.gov (email registration)." },
    { name: "Copernicus CDSE · client id and secret", kind: "key", needed: "Free account", where: "Connectors page", how: "Create an OAuth client at dataspace.copernicus.eu for Sentinel-1 flood extent." },
    { name: "TypeSafe Jev · API key", kind: "key", needed: "Paid, optional", where: "Connectors page", how: "Only if the decision-judgment service is used. Set a monthly token budget." },
    { name: "IMD warnings · terms accepted", kind: "agreement", needed: "Blocked until written terms exist", where: "Connectors page (after agreement)", how: "India Meteorological Department data needs a written supply agreement; the connector refuses to run until terms are accepted." },
    { name: "NASA LHASA · CAP handover", kind: "none", needed: "No key", where: "Connectors page", how: "Landslide reference and file export of approved CAP drafts." },
  ]},
  { id: "journey", title: "5 · Alert Journey live mode (no keys)", summary: "Fetched by this server on the viewer's behalf after they opt in, and only when -PublicEarth is on. All are keyless; each has attribution and non-commercial terms recorded in research/real-data/LICENCES.md.", items: [
    { name: "Open-Meteo: forecast, ensemble, flood, ERA5 history, climate, marine, geocoding", kind: "none", needed: "No key · non-commercial · relayed by this server", where: "Nothing to configure", how: "Commercial use needs a paid plan and an API key." },
    { name: "NASA GIBS imagery · NASA EONET events · USGS earthquakes", kind: "none", needed: "No key · credit required", where: "Nothing to configure", how: "Credits are shown on the page." },
    { name: "Sentinel-2 cloudless (EOX) · OpenStreetMap tiles · AWS terrain tiles", kind: "none", needed: "No key · attribution · non-commercial for Sentinel-2", where: "Nothing to configure", how: "For heavy or commercial use, host your own tiles or buy a tile plan." },
    { name: "CelesTrak satellite orbits", kind: "none", needed: "No key · relayed and cached by this server", where: "Nothing to configure", how: "The server asks at most once per group every 3 hours, as CelesTrak requires. If CelesTrak refuses the server, the relay falls back to SatNOGS DB (CC BY-SA 4.0, terms to confirm)." },
    { name: "Overpass (OpenStreetMap buildings and masts)", kind: "none", needed: "No key · shared public service", where: "Nothing to configure", how: "Often busy. For production, run your own Overpass instance or import an OSM extract." },
  ]},
  { id: "gaps", title: "6 · Not available yet: owner action needed", summary: "These are not wired in. Each needs an account, a payment or a written agreement first.", items: [
    { name: "Real mobile-tower locations (OpenCelliD or operator data)", kind: "key", needed: "Free key or operator agreement", where: "Not implemented", how: "OpenStreetMap maps few masts. Register at opencellid.org or obtain operator site data; a connector must then be added." },
    { name: "Google Maps / Google Earth imagery", kind: "key", needed: "Paid key (billing account)", where: "Not implemented", how: "Excluded by the project's no-paid-infrastructure rule. OpenStreetMap and Sentinel-2 are used instead." },
    { name: "Google Flood Forecasting API", kind: "key", needed: "Waitlist key pending", where: "Not available until a key is issued", how: "Apply through Google's flood-forecasting partner form; steps are in docs." },
    { name: "India-WRIS / CWC river gauges · GDACS", kind: "agreement", needed: "Written terms", where: "Not enabled", how: "Automated access is not cleared. A ready-to-send GDACS inquiry draft is in docs/GDACS_INQUIRY_DRAFT.md." },
  ]},
  { id: "govt", title: "7 · Government deployment requirements (not met by configuration)", summary: "For use by an Indian government body these are needed in addition to the settings above. None is done yet; each needs an accountable owner. Clause details must be confirmed against the official texts (see docs/GOVT_DEPLOYMENT_READINESS.md).", items: [
    { name: "Security audit and clearance certificate", kind: "agreement", needed: "Required before production hosting (GIGW 3.0)", where: "Not started: NIC, STQC or a CERT-In empanelled auditor", how: "Commission a web-application security audit of this exact build and fix every finding. Repeat after major changes." },
    { name: "GIGW 3.0 and accessibility (WCAG 2.1 AA) conformance", kind: "agreement", needed: "Required for government websites", where: "Not started: STQC website quality certification", how: "Full accessibility audit with assistive technology. The 3D Alert Journey needs an equivalent non-visual path." },
    { name: "CERT-In Directions (April 2022)", kind: "agreement", needed: "Required of the operating organisation", where: "Not started: hosting and operations team", how: "Report listed cyber incidents to CERT-In within 6 hours, keep ICT logs in India for 180 days, synchronise clocks to NIC/NPL time servers, name a point of contact." },
    { name: "Hosting in India on NIC or a MeitY-empanelled cloud", kind: "agreement", needed: "Expected for government workloads (confirm with MeitY/NIC)", where: "Not started: your hosting environment", how: "Includes TLS, backups, monitoring, patching and a tested restore. This repository is a single-node exercise stack." },
    { name: "Personal data duties (DPDP Act 2023 and Rules 2025)", kind: "agreement", needed: "Applies once real operator or citizen data is held", where: "Not started: your data protection lead", how: "Notice, purpose limitation, retention, breach notification to the Data Protection Board. IndTrana today holds synthetic data only." },
    { name: "Third-party calls from the viewer's browser", kind: "agreement", needed: "Partly done", where: "Not finished: older map pages", how: "Alert Journey now sends every request through this server (a cached, allow-listed relay), so outside services never see a viewer's address. The older Earth Watch page and the Command Center map still load NASA and OpenStreetMap tiles directly. For official use, relay those too or mirror the data in India; the server's own address is still visible to the sources." },
  ]},
  { id: "never", title: "8 · Cannot be enabled by any key", summary: "Sending real public alerts is outside IndTrana by design.", items: [
    { name: "Live public warning, SMS, cell broadcast or dispatch", kind: "agreement", needed: "Government channel only", where: "Not in IndTrana: NDMA / state SDMA → SACHET (C-DOT) → each operator's cell-broadcast centre", how: "IndTrana prepares a private CAP draft that a different human approves, then an authorised officer hands it over. A formal agency partnership is required; no configuration here turns on sending." },
  ]},
  { id: "channels", title: "9 · Staff message channels (email to opted-in staff; SMS and WhatsApp locked)", summary: "How IndTrana reaches its own operators, department desks and response teams. In-app alerts are always on. Since the owner's decision of 12 November 2026, email can send fixed rehearsal notices to IndTrana staff who turned them on, when both the -StaffEmail server switch and the Email switch on the Connectors page are on. SMS and WhatsApp credentials can be checked, but no text or WhatsApp message leaves IndTrana. Details are in docs/COMMUNICATION_CHANNELS.md.", items: [
    { name: "In-app alerts", kind: "none", needed: "In use · nothing to set", where: "Nothing to configure", how: "Requests, tasks and approvals appear on the page and as a number on the menu, only for people who are signed in." },
    { name: "Email · SendGrid API key and sender address", kind: "key", needed: "Paid account · optional", where: "Connectors page", how: "Create an API key with the Mail Send permission and verify the sender address or domain in SendGrid. Staff turn notices on for themselves under Email notices on the Help page; the address comes from their verified sign-in account." },
    { name: "SMS · Twilio Account SID, auth token and sender", kind: "key", needed: "Paid account · optional", where: "Connectors page", how: "From the Twilio console. Texts to Indian numbers also need the sender and every message template registered on an operator's DLT portal." },
    { name: "WhatsApp · Meta access token and phone number ID", kind: "key", needed: "Paid per conversation · optional", where: "Connectors page", how: "From a Meta WhatsApp Business account: a permanent system-user token, a registered phone number and Meta-approved message templates." },
    { name: "Email sending (staff notices only)", kind: "switch", needed: "Optional · owner decision of 12 November 2026", where: "Connectors page (Email switch) and scripts/start-windows.ps1 -StaffEmail", how: "Fixed English templates, one recipient per email, hourly and daily limits, every attempt logged. Switching Email off on the Connectors page stops sending at the next attempt." },
    { name: "SMS and WhatsApp sending", kind: "agreement", needed: "Owner decision and security review", where: "Not implemented", how: "Still locked. Needs the owner to lift the no-dispatch rule for that channel, a reviewed sending service, recipient consent and fixed message templates." },
  ]},
];

const SOURCE_DOCUMENTS = ["docs/PROACTIVE_IMPLEMENTATION_CONTRACT.md", "docs/OIDC_IDENTITY_AND_AUTHORIZATION.md", "research/real-data/LICENCES.md"] as const;

const KIND_LABEL: Record<Kind, string> = { secret: "Secret", setting: "Setting", switch: "Switch", key: "API key", agreement: "Agreement", none: "No key" };
const KIND_ICON = { secret: LockKeyhole, setting: PlugZap, switch: ToggleLeft, key: KeyRound, agreement: ShieldAlert, none: CheckCircle2 } as const;
type Probe = "checking" | "on" | "off" | "unknown";

function useProbes() {
  const [probes, setProbes] = useState<Record<Check, Probe>>({ session: "checking", earth: "checking", intake: "checking" });
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const set = (key: Check, value: Probe) => { if (!controller.signal.aborted) setProbes(current => ({ ...current, [key]: value })); };
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }).then(r => r.json())
      .then((value: { configured?: boolean; authenticated?: boolean }) => { set("session", value.configured === true ? "on" : "off"); if (!controller.signal.aborted) setSignedIn(value.authenticated === true); })
      .catch(() => set("session", "unknown"));
    fetch("/api/earth-watch/status", { cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error("unavailable")))
      .then((value: { enabled?: boolean }) => set("earth", value.enabled === true ? "on" : "off")).catch(() => set("earth", "unknown"));
    fetch("/api/public-intake/status", { cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error("unavailable")))
      .then((value: { enabled?: boolean }) => set("intake", value.enabled === true ? "on" : "off")).catch(() => set("intake", "unknown"));
    return () => controller.abort();
  }, []);
  return { probes, signedIn };
}

/** Prose with each document shown by its plain title; the file path follows as small secondary text so an
 *  administrator can still find the file. */
function WithDocuments({ text }: { text: string }) {
  return <>{documentParts(text).map((part, index) => "path" in part
    ? <span key={index}>{part.title} <span className="text-xs text-muted">(file <code className="text-[11px]">{part.path}</code>)</span></span>
    : <span key={index}>{part.text}</span>)}</>;
}

function ProbePill({ state }: { state: Probe | undefined }) {
  if (!state) return <span className="inline-flex items-center gap-1 text-xs text-muted"><CircleDashed size={14}/>Set on the host · not readable here</span>;
  if (state === "checking") return <span className="text-xs text-muted" role="status">Checking…</span>;
  if (state === "on") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={14}/>Detected: configured</span>;
  if (state === "off") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300"><XCircle size={14}/>Detected: not configured</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-rose-700 dark:text-rose-300"><XCircle size={14}/>Could not check (API unavailable)</span>;
}

export default function GoLivePage() {
  const { probes, signedIn } = useProbes();
  return <AppShell title="Go-Live Setup" description="Every external API, key, secret, switch and agreement IndTrana needs, where each is configured and what is still missing. Read-only: no secret is shown or entered on this page.">
    <Panel className="mb-4" title="How configuration works in IndTrana" icon={LockKeyhole}>
        <p className="text-sm leading-6">Secrets live in two places only: the host <code>.env</code> file (set by whoever runs the server) and the encrypted connector vault (entered by a signed-in platform administrator on the Connectors page). This page is a checklist; it cannot read or change either.</p>
    </Panel>
    <Panel className="mb-4" title="Start here">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>On the server, copy <code>.env.example</code> to <code>.env</code> and fill sections 1 and 2 below. Restart with <code>scripts/start-windows.ps1</code> and the switches you want (section 3).</li>
        <li>{signedIn ? "You are signed in." : "Sign in with an Administrator account (top-right of this page). If the sign-in button says “SSO not configured”, finish section 1 first."}</li>
        <li>Open the Connectors page and enter the API keys from section 4. Use each connector&rsquo;s Test button.</li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className={buttonClass({ variant: "primary" })} href="/admin/connectors"><KeyRound size={16}/>Open Connectors (enter API keys)</Link>
        <Link className={buttonClass()} href="/admin"><PlugZap size={16}/>Administration (policy preview)</Link>
        <Link className={buttonClass()} href="/alert-journey"><ExternalLink size={16}/>Alert Journey</Link>
      </div>
    </Panel>
    {SECTIONS.map(section => <Panel key={section.id} id={"gl-" + section.id} className="mb-4" title={section.title} description={documentText(section.summary)} bodyClassName="p-0">
        <SortableTable label={section.title} minWidth="62rem" rows={section.items} rowKey={item => item.name} columns={[
          { key: "item", label: "Item", className: "min-w-[200px] font-semibold", sortValue: item => item.name, cell: item => <>{/^[A-Z_·s-]+$/.test(item.name) || item.name.startsWith("-") ? <code className="break-words text-[11px]">{item.name}</code> : <span className="break-words">{item.name}</span>}{item.link && <div className="mt-1"><Link className="text-accent underline" href={item.link.href}>{item.link.label}</Link></div>}</> },
          { key: "type", label: "Type", className: "whitespace-nowrap", sortValue: item => KIND_LABEL[item.kind], cell: item => { const Icon = KIND_ICON[item.kind]; return <span className="inline-flex items-center gap-1"><Icon size={14}/>{KIND_LABEL[item.kind]}</span>; } },
          { key: "needed", label: "Needed", className: "min-w-[140px]", sortValue: item => item.needed, cell: item => item.needed },
          { key: "where", label: "Where to set it", className: "min-w-[160px]", sortValue: item => item.where, cell: item => item.where },
          { key: "how", label: "How to get it", className: "min-w-[240px] whitespace-normal", cell: item => <WithDocuments text={item.how}/> },
          { key: "status", label: "Status", className: "min-w-[150px]", cell: item => <>{item.kind === "none" ? <span className="text-xs text-muted">Nothing to set</span> : item.where.startsWith("Not ") ? <span className="text-xs text-muted">Not available</span> : item.where.startsWith("Connectors page") ? <Link className="text-xs text-accent underline" href="/admin/connectors">Check on Connectors</Link> : <ProbePill state={item.check ? probes[item.check] : undefined}/>}</> },
        ]}/>
    </Panel>)}
    <div className="mb-8 text-xs text-muted">
      <p>Sources for this checklist: <code>.env.example</code>, the Compose files, {documentPhrase(SOURCE_DOCUMENTS[0])}, {documentPhrase(SOURCE_DOCUMENTS[1])} and {documentPhrase(SOURCE_DOCUMENTS[2])}. Licence terms change; re-check before a real deployment.</p>
      <details className="mt-1"><summary className="cursor-pointer">Technical details: file names</summary>
        <ul className="mt-1 list-disc pl-5">{SOURCE_DOCUMENTS.map(path => <li key={path}>{documentTitle(path)}: <code>{path}</code></li>)}</ul>
      </details>
    </div>
  </AppShell>;
}
