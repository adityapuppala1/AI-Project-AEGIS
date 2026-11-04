"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Ban, CheckCircle2, ChevronDown, CircleDashed, CircleHelp, Cloud, Eraser, ExternalLink, Eye, EyeOff, FileOutput, FlaskConical, Flame, Gavel, History, KeyRound,
  Globe2, Loader2, Lock, Mountain, Plug, Power, PowerOff, Satellite, Save, ShieldCheck, Sparkles, Undo2, Waves, X, XCircle, type LucideIcon,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { ProactivePauseControl } from "./proactive-pause";
import { useT } from "./language-provider";
import { useOperatorSession } from "../lib/use-operator-session";
import { ageParts, connectorStatus, isReady, missingRequired } from "../lib/proactive";
import type { AuditRow, Connector, ConnectorStatus, ConnectorsPayload, TestResult } from "../lib/proactive";
import { buildSampleAudit, buildSampleConnectors } from "../lib/proactive-sample";
import { formatIst } from "../lib/earth-watch";

type Notice = { tone: "ok" | "error"; text: string };
type Settings = Record<string, string | number | boolean>;

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  const data = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  return { ok: response.ok, status: response.status, data };
}

interface Meta { icon: LucideIcon; can: string; cannot: string; where: string; url?: string; urlLabel?: string }
const META: Record<string, Meta> = {
  open_meteo: { icon: Cloud, can: "Fetch free weather and flood forecasts for a fixed Hyderabad grid.", cannot: "Reach other hosts or areas.", where: "No key needed. Optional settings only.", url: "https://open-meteo.com/", urlLabel: "Open-Meteo" },
  nasa_firms: { icon: Flame, can: "Read recent satellite fire detections for India.", cannot: "Confirm a fire on the ground.", where: "A free map key from the NASA FIRMS API page.", url: "https://firms.modaps.eosdis.nasa.gov/api/", urlLabel: "NASA FIRMS API" },
  nasa_lhasa: { icon: Mountain, can: "Read NASA landslide susceptibility status.", cannot: "Predict that a landslide will happen.", where: "No key needed.", url: "https://gpm.nasa.gov/landslides/", urlLabel: "NASA LHASA" },
  copernicus_cdse: { icon: Satellite, can: "Request an access token for Sentinel-1 flood-extent reference.", cannot: "Download imagery or show flood extent here.", where: "Create a free Copernicus Data Space account, then an OAuth client.", url: "https://dataspace.copernicus.eu/", urlLabel: "Copernicus Data Space" },
  imd_warnings: { icon: Gavel, can: "Read official IMD warnings once the terms are confirmed.", cannot: "Run before the terms are accepted.", where: "No key. Confirm the IMD terms of use before ticking the box.", url: "https://mausam.imd.gov.in/", urlLabel: "IMD" },
  gdacs: { icon: Globe2, can: "Read public GDACS disaster event alerts inside the India bounding box.", cannot: "Replace official warnings or reach other hosts.", where: "No key needed. Confirm the GDACS terms of use first.", url: "https://www.gdacs.org/", urlLabel: "GDACS" },
  google_flood_forecasting: { icon: Waves, can: "Read Google flood gauge forecasts near the Hyderabad grid.", cannot: "Run before a platform admin saves an approved API key.", where: "An API key from the Google Flood Forecasting waitlist (approval pending).", url: "https://developers.google.com/flood-forecasting", urlLabel: "Google Flood Forecasting" },
  typesafe_jev: { icon: Sparkles, can: "Judge among fixed playbook options using cited evidence.", cannot: "Write proposals, approve or send anything.", where: "An API key from your TypeSafe account (paid)." },
  cap_handover: { icon: FileOutput, can: "Export an Exercise CAP file that a person downloads.", cannot: "Transmit the file anywhere.", where: "Nothing to enter." },
  authority_notification: { icon: Ban, can: "Show that hand-over is a human step.", cannot: "Ever be enabled. AEGIS sends no notifications.", where: "Nothing to enter." },
};
const FALLBACK_META: Meta = { icon: Plug, can: "Provide data to Hazard Watch.", cannot: "Send warnings or notifications.", where: "See the admin runbook." };

const STATUS_STYLE: Record<ConnectorStatus, { icon: LucideIcon; chip: string }> = {
  not_configured: { icon: CircleDashed, chip: "bg-slate-500/10 text-slate-700 ring-slate-500/30 dark:text-slate-300" },
  untested: { icon: CircleHelp, chip: "bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-300" },
  passed: { icon: CheckCircle2, chip: "bg-emerald-500/10 text-emerald-800 ring-emerald-500/30 dark:text-emerald-300" },
  failed: { icon: XCircle, chip: "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300" },
  disabled: { icon: PowerOff, chip: "bg-slate-500/10 text-slate-700 ring-slate-500/30 dark:text-slate-300" },
  blocked_terms: { icon: Ban, chip: "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300" },
};

function StatusPill({ connector }: Readonly<{ connector: Connector }>) {
  const t = useT();
  const status = connectorStatus(connector); const { icon: Icon, chip } = STATUS_STYLE[status];
  const label = status === "not_configured" ? t("Not configured") : status === "untested" ? t("Configured, untested") : status === "passed" ? t("Test passed")
    : status === "failed" ? t("Test failed") : status === "disabled" ? t("Disabled") : t("Blocked by terms");
  const latency = (status === "passed" || status === "failed") && connector.last_test?.latency_ms != null ? ` · ${connector.last_test.latency_ms} ms` : "";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${chip}`}><Icon size={13} aria-hidden="true"/>{label}{latency}</span>;
}

function SampleBadge() {
  const t = useT();
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-500/40 dark:text-amber-200"><FlaskConical size={12} aria-hidden="true"/>{t("SAMPLE — not real connectors")}</span>;
}

function AuditTimeline({ rows, name, now }: Readonly<{ rows: AuditRow[]; name: string; now: number }>) {
  const t = useT();
  const label = (action: string) => action === "test" ? t("Test") : action === "enable" ? t("Enabled") : action === "disable" ? t("Disabled") : action === "save" ? t("Saved") : action === "clear" ? t("Cleared") : action.replace(/_/g, " ");
  const icon = (action: string): LucideIcon => action === "test" ? Activity : action === "enable" ? Power : action === "disable" ? PowerOff : action === "save" ? Save : action === "clear" ? Eraser : History;
  return <ol className="space-y-3 border-l border-stroke pl-4" aria-label={`${name} ${t("Audit (last 50)")}`}>{rows.map((row, index) => {
    const Icon = icon(row.action); const age = ageParts(row.at, now);
    return <li key={row.id || index} className="relative text-xs">
      <span className={`absolute -left-[1.65rem] flex h-5 w-5 items-center justify-center rounded-full border bg-surface ${row.ok ? "border-stroke text-muted" : "border-rose-500 text-rose-700 dark:text-rose-300"}`} aria-hidden="true"><Icon size={11}/></span>
      <p><strong>{label(row.action)}</strong> · {row.ok ? t("ok") : t("failed")} <span className="text-muted">· {row.actor}</span></p>
      <p className="text-muted" title={formatIst(row.at)}>{age ? (age.unit === "now" ? t("just now") : `${age.n} ${t(age.unit)} ${t("ago")}`) : t("time unknown")}</p>
    </li>;
  })}</ol>;
}

function ConnectorCard({ connector, masterKey, preview, now, onToast, onSaved }: Readonly<{ connector: Connector; masterKey: boolean; preview: boolean; now: number; onToast: (notice: Notice) => void; onSaved: () => void }>) {
  const t = useT();
  const meta = META[connector.id] ?? FALLBACK_META;
  const Icon = meta.icon;
  const readOnly = connector.id === "authority_notification";
  const requiredPlain = connector.fields.filter(field => !field.secret && field.required);
  const optionalPlain = connector.fields.filter(field => !field.secret && !field.required);
  const secretFields = connector.fields.filter(field => field.secret);
  const [enabled, setEnabled] = useState(connector.enabled);
  const [settings, setSettings] = useState<Settings>(connector.settings);
  const [secrets, setSecrets] = useState<Record<string, string | null>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [test, setTest] = useState<TestResult | null>(connector.last_test);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const base = `connector-${connector.id}`;

  const dirty = enabled !== connector.enabled || Object.keys(secrets).length > 0
    || Object.keys({ ...settings, ...connector.settings }).some(key => settings[key] !== connector.settings[key]);
  const secretsPending = Object.keys(secrets).length > 0;
  const discard = () => { setEnabled(connector.enabled); setSettings(connector.settings); setSecrets({}); setShown({}); };

  async function save() {
    if (preview) return;
    setBusy("save");
    try {
      const body = { expected_version: connector.version, enabled, settings, secrets };
      const result = await call<Connector>(`/api/proactive/connectors/${connector.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setSecrets({}); setShown({});
      if (result.ok) { onToast({ tone: "ok", text: `${connector.name}: ${t("Saved")}` }); onSaved(); }
      else if (result.status === 409 && result.data.code === "version_mismatch") onToast({ tone: "error", text: t("This connector changed elsewhere. Reload the list, then re-apply your edit.") });
      else if (result.status === 409) onToast({ tone: "error", text: t("The service refused this change. Authority notification can never be enabled.") });
      else if (result.data.code === "connector_key_missing") onToast({ tone: "error", text: t("The master key is not configured, so secrets cannot be saved.") });
      else onToast({ tone: "error", text: result.data.error ?? t("Save failed") });
    } catch { onToast({ tone: "error", text: t("Save failed") }); }
    setBusy("");
  }
  async function runTest() {
    setBusy("test");
    try {
      if (preview) {
        // Simulated locally: no request is made in the sample preview.
        await new Promise(resolve => setTimeout(resolve, 900));
        const simulated: TestResult = { ok: connector.last_test?.ok ?? true, status_code: connector.last_test?.status_code ?? 200, latency_ms: connector.last_test?.latency_ms ?? 120, message: "Sample result", at: new Date().toISOString() };
        setTest(simulated);
        onToast({ tone: simulated.ok ? "ok" : "error", text: `${connector.name}: ${simulated.ok ? t("Test passed") : t("Test failed")} (${t("sample")})` });
      } else {
        const result = await call<TestResult>(`/api/proactive/connectors/${connector.id}/test`, { method: "POST" });
        if (result.ok) {
          setTest(result.data);
          onToast({ tone: result.data.ok ? "ok" : "error", text: `${connector.name}: ${result.data.ok ? t("Test passed") : t("Test failed")} · HTTP ${result.data.status_code ?? "n/a"} · ${result.data.latency_ms ?? "n/a"} ms` });
        } else onToast({ tone: "error", text: result.data.error ?? t("Test failed") });
      }
    } catch { onToast({ tone: "error", text: t("Test failed") }); }
    setBusy("");
  }
  async function toggleAudit() {
    const next = !auditOpen;
    setAuditOpen(next);
    if (next && audit === null) {
      if (preview) { setAudit(buildSampleAudit(now).filter(row => row.connector_id === connector.id)); return; }
      try {
        const result = await call<{ rows: AuditRow[] }>(`/api/proactive/connectors/${connector.id}/audit`);
        setAudit(result.ok ? result.data.rows : []);
      } catch { setAudit([]); }
    }
  }

  const required = <span className="ml-1 rounded bg-elevated px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted"><span aria-hidden="true">{t("Required")}</span><span className="sr-only">({t("required")})</span></span>;
  const plainField = (field: Connector["fields"][number]) => {
    const id = `${base}-s-${field.name}`; const value = settings[field.name]; const hint = `${id}-hint`;
    return <div key={field.name}>
      <label htmlFor={id} className="mb-1 flex items-center text-xs font-bold">{field.label}{field.required && required}</label>
      {typeof value === "boolean" ? <input id={id} type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={value} disabled={readOnly} aria-describedby={hint}
          onChange={event => setSettings(current => ({ ...current, [field.name]: event.target.checked }))}/>
        : <input id={id} className="field" type={typeof value === "number" ? "number" : "text"} value={value === undefined ? "" : String(value)} disabled={readOnly} aria-describedby={hint} maxLength={512}
          onChange={event => setSettings(current => ({ ...current, [field.name]: typeof value === "number" ? (Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0) : event.target.value }))}/>}
      <p id={hint} className="mt-1 text-[11px] text-muted">{t("Setting")}: {field.name}</p>
    </div>;
  };
  const fixed = Object.entries(connector.settings).filter(([key]) => !connector.fields.some(field => !field.secret && field.name === key));
  const hasAdvanced = optionalPlain.length > 0 || fixed.length > 0 || connector.hosts.length > 0 || connector.licence !== "";

  return <section id={base} className="panel min-w-0 scroll-mt-24" aria-labelledby={`${base}-title`}>
    <div className="panel-heading !items-start">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={20} aria-hidden="true"/></span>
        <div className="min-w-0">
          <h2 id={`${base}-title`} className="text-base font-bold">{connector.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-elevated px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-stroke">{connector.category || t("other")}</span>
            <StatusPill connector={connector}/>
            {preview && <SampleBadge/>}
          </div>
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-semibold" htmlFor={`${base}-enabled`}>
        <input id={`${base}-enabled`} type="checkbox" role="switch" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={enabled} disabled={readOnly || busy !== ""}
          aria-describedby={`${base}-can`} onChange={event => setEnabled(event.target.checked)}/>
        {enabled ? t("Enabled") : t("Disabled")}
      </label>
    </div>
    <div className="space-y-4 p-5">
      <p id={`${base}-can`} className="text-xs leading-5"><strong>{t("Can")}:</strong> {t(meta.can)} <strong className="ml-1">{t("Cannot")}:</strong> {t(meta.cannot)}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"><KeyRound size={13} aria-hidden="true"/>{t(meta.where)}
        {meta.url && <a href={meta.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-2">{meta.urlLabel}<ExternalLink size={12} aria-hidden="true"/><span className="sr-only">({t("opens in a new tab")})</span></a>}</p>
      {readOnly && <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200" role="note">
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true"/>{t("Read-only. AEGIS never sends warnings or notifications to authorities; this connector cannot be enabled. Hand-over is a CAP file a human downloads.")}</p>}

      {requiredPlain.map(plainField)}

      {secretFields.map(field => {
        const id = `${base}-k-${field.name}`; const hint = `${id}-hint`;
        const pendingClear = secrets[field.name] === null; const typed = typeof secrets[field.name] === "string";
        return <div key={field.name}>
          <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs font-bold"><KeyRound size={14} aria-hidden="true"/>{field.label}{field.required && required}</label>
          <div className="flex gap-2">
            <input id={id} className="field" type={typed && shown[field.name] ? "text" : "password"} autoComplete="off" spellCheck={false} maxLength={512} disabled={pendingClear || busy !== ""} aria-describedby={hint}
              placeholder={field.set ? `${t("set")} · ${t("fingerprint")} ${field.fingerprint ?? "n/a"}` : t("not set")}
              value={typed ? secrets[field.name] as string : ""}
              onChange={event => setSecrets(current => {
                const next = { ...current };
                if (event.target.value) next[field.name] = event.target.value; else { delete next[field.name]; setShown(s => ({ ...s, [field.name]: false })); }
                return next;
              })}/>
            {typed && <button type="button" className="control !px-2.5" aria-pressed={!!shown[field.name]} aria-label={shown[field.name] ? t("Hide what you typed") : t("Show what you typed")}
              onClick={() => setShown(s => ({ ...s, [field.name]: !s[field.name] }))}>{shown[field.name] ? <EyeOff size={16} aria-hidden="true"/> : <Eye size={16} aria-hidden="true"/>}</button>}
            <button type="button" className="control" disabled={!field.set || busy !== ""} aria-pressed={pendingClear}
              onClick={() => setSecrets(current => {
                const next = { ...current };
                if (next[field.name] === null) delete next[field.name]; else next[field.name] = null;
                return next;
              })}>{pendingClear ? t("Undo clear") : t("Clear")}</button>
          </div>
          <p id={hint} className="mt-1 text-[11px] text-muted">{pendingClear ? t("Will be cleared when you save.") : t("Write-only. The stored value is never shown; leave blank to keep it.")}</p>
        </div>;
      })}
      {secretsPending && !masterKey && <p className="text-xs text-rose-700 dark:text-rose-300">{t("The master key is not configured, so secrets cannot be saved.")}</p>}

      {hasAdvanced && <div>
        <button type="button" className="control !min-h-9 text-xs" aria-expanded={advanced} aria-controls={`${base}-advanced`} onClick={() => setAdvanced(v => !v)}>
          {t("Advanced settings")}<ChevronDown size={14} aria-hidden="true" className={advanced ? "rotate-180" : ""}/></button>
        {advanced && <div id={`${base}-advanced`} className="mt-3 space-y-4 rounded-lg border border-stroke p-3">
          {optionalPlain.map(plainField)}
          {fixed.length > 0 && <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2" aria-label={t("Fixed settings")}>
            {fixed.map(([key, value]) => <div key={key} className="flex gap-2"><dt className="font-bold text-muted">{key}</dt><dd className="min-w-0 break-all">{String(value)}</dd></div>)}</dl>}
          <p className="text-xs text-muted"><span className="font-bold">{t("Allowlisted hosts")}:</span> {connector.hosts.length ? connector.hosts.join(", ") : t("none (no network access)")}</p>
          <p className="text-xs text-muted">{t("Licence")}: {connector.licence || t("not stated")} · v{connector.version}</p>
        </div>}
      </div>}

      {test && <p className={`text-xs ${test.ok ? "text-emerald-800 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
        {test.ok ? t("Test passed") : t("Test failed")} · HTTP {test.status_code ?? "n/a"} · {test.latency_ms ?? "n/a"} ms{test.message ? ` · ${test.message}` : ""}{test.at ? ` · ${formatIst(test.at)}` : ""}</p>}

      <div>
        <button type="button" className="control !min-h-9 text-xs" aria-expanded={auditOpen} aria-controls={`${base}-audit`} onClick={toggleAudit}>
          <History size={14} aria-hidden="true"/>{t("Audit (last 50)")}<ChevronDown size={14} aria-hidden="true" className={auditOpen ? "rotate-180" : ""}/></button>
        {auditOpen && <div id={`${base}-audit`} className="mt-3 max-h-72 overflow-y-auto pr-1" tabIndex={0} aria-label={`${connector.name} ${t("Audit (last 50)")}`}>
          {audit === null ? <p className="text-xs text-muted" role="status">{t("Loading audit…")}</p>
            : audit.length === 0 ? <p className="text-xs text-muted">{t("No audit entries yet.")}</p>
            : <AuditTimeline rows={audit} name={connector.name} now={now}/>}
        </div>}
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-stroke bg-surface px-5 py-3">
        {!readOnly && <button type="button" className="control control-primary" onClick={save} disabled={preview || !dirty || busy !== "" || (secretsPending && !masterKey)}>
          {busy === "save" ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <Save size={16} aria-hidden="true"/>}{t("Save")}</button>}
        <button type="button" className="control" onClick={runTest} disabled={busy !== ""}>
          {busy === "test" ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <Activity size={16} aria-hidden="true"/>}{t("Test connection")}</button>
        {dirty && <>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300"><span className="status-dot bg-amber-500" aria-hidden="true"/>{t("Unsaved changes")}</span>
          <button type="button" className="control !min-h-9 text-xs" onClick={discard} disabled={busy !== ""}><Undo2 size={14} aria-hidden="true"/>{t("Discard changes")}</button>
        </>}
        {preview && <span className="text-[11px] text-muted">{t("Saving is switched off in the sample preview.")}</span>}
      </div>
    </div>
  </section>;
}

function Ring({ ready, total }: Readonly<{ ready: number; total: number }>) {
  const t = useT();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setDrawn(true)); return () => cancelAnimationFrame(frame); }, []);
  const circumference = 2 * Math.PI * 30;
  const offset = drawn && total > 0 ? circumference * (1 - ready / total) : circumference;
  return <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`${ready} ${t("of")} ${total} ${t("connectors ready")}`}>
    <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="none" stroke="rgb(var(--elevated))" strokeWidth="7"/>
      <circle cx="36" cy="36" r="30" fill="none" stroke="rgb(var(--accent))" strokeWidth="7" strokeLinecap="round" className="ring-fill" strokeDasharray={circumference} strokeDashoffset={offset}/>
    </svg>
    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums" aria-hidden="true">{ready}/{total}</span>
  </div>;
}

function SetupHeader({ payload, preview }: Readonly<{ payload: ConnectorsPayload; preview: boolean }>) {
  const t = useT();
  const counted = payload.connectors.filter(connector => connector.id !== "authority_notification");
  const ready = counted.filter(isReady).length;
  const actions = useMemo(() => {
    const list: { key: string; text: string; href?: string }[] = [];
    if (!payload.master_key_configured) list.push({ key: "master", text: t("Set the master key (AEGIS_CONNECTOR_KEY) so secrets can be saved") });
    for (const connector of counted) {
      const status = connectorStatus(connector); const href = `#connector-${connector.id}`;
      if (status === "blocked_terms") list.push({ key: connector.id, href, text: `${t("Confirm the terms, then tick the box for")} ${connector.name}` });
      else if (status === "not_configured") list.push({ key: connector.id, href, text: `${missingRequired(connector).some(field => field.secret) ? t("Add the key for") : t("Finish setup for")} ${connector.name}` });
      else if (status === "disabled") list.push({ key: connector.id, href, text: `${t("Enable")} ${connector.name}` });
      else if (status === "untested") list.push({ key: connector.id, href, text: `${t("Test")} ${connector.name}` });
      else if (status === "failed") list.push({ key: connector.id, href, text: `${t("Fix and re-test")} ${connector.name}` });
    }
    return list;
  }, [payload, counted, t]);
  const keyOk = payload.master_key_configured;
  return <section className="panel mb-5 p-5" aria-labelledby="setup-progress">
    <div className="flex flex-wrap items-center gap-5">
      <Ring ready={ready} total={counted.length}/>
      <div className="min-w-0 flex-1 basis-56">
        <h2 id="setup-progress" className="text-base font-bold">{ready} {t("of")} {counted.length} {t("connectors ready")}</h2>
        <p className="mt-1 text-xs text-muted">{t("Ready means enabled with a passing test. Authority notification can never be enabled and is not counted.")}</p>
        <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${keyOk ? "bg-emerald-500/10 text-emerald-800 ring-emerald-500/30 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300"}`}>
          {keyOk ? <ShieldCheck size={13} aria-hidden="true"/> : <AlertTriangle size={13} aria-hidden="true"/>}{keyOk ? t("Master key configured") : t("Master key missing")}</p>
      </div>
      {preview && <SampleBadge/>}
    </div>
    <div className="mt-5 border-t border-stroke pt-4">
      <h3 className="text-sm font-bold">{t("Next actions")}</h3>
      {actions.length === 0 ? <p className="mt-2 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300"><CheckCircle2 size={14} aria-hidden="true"/>{t("Everything that can be ready is ready.")}</p>
        : <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">{actions.slice(0, 6).map((action, index) => <li key={action.key} className="reveal-in text-xs" style={{ "--i": index } as React.CSSProperties}>
          {action.href ? <a href={action.href} className="flex items-center gap-2 rounded-lg border border-stroke px-3 py-2 hover:bg-elevated"><CircleDashed size={14} className="shrink-0 text-muted" aria-hidden="true"/>{action.text}</a>
            : <span className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2"><AlertTriangle size={14} className="shrink-0" aria-hidden="true"/>{action.text}</span>}</li>)}
          {actions.length > 6 && <li className="px-3 py-2 text-xs text-muted">{t("and more below")}</li>}</ol>}
    </div>
  </section>;
}

function Toast({ notice, onClose }: Readonly<{ notice: Notice | null; onClose: () => void }>) {
  const t = useT();
  useEffect(() => { if (!notice) return; const timer = setTimeout(onClose, 8000); return () => clearTimeout(timer); }, [notice, onClose]);
  return <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end">
    {notice && <div className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface p-3 text-xs shadow-panel ${notice.tone === "ok" ? "border-emerald-500/50" : "border-rose-500/50"}`}>
      {notice.tone === "ok" ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true"/> : <XCircle size={18} className="shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true"/>}
      <p className="min-w-0 flex-1 leading-5">{notice.text}</p>
      <button type="button" className="shrink-0 rounded p-1 hover:bg-elevated" onClick={onClose} aria-label={t("Dismiss")}><X size={14} aria-hidden="true"/></button>
    </div>}
  </div>;
}

export function ConnectorAdmin() {
  const t = useT();
  const session = useOperatorSession();
  const isAdmin = session?.roles.includes("platform_admin") === true;
  const [preview, setPreview] = useState(false);
  const [payload, setPayload] = useState<ConnectorsPayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const clearNotice = useCallback(() => setNotice(null), []);
  const nowRef = useRef(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await call<ConnectorsPayload>("/api/proactive/connectors");
      if (!result.ok) throw new Error(result.status === 404 ? t("The proactive feature is switched off on this server.") : result.data.error ?? t("Connectors unavailable"));
      setPayload(result.data); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Connectors unavailable")); }
    setLoading(false);
  }, [t]);
  useEffect(() => { if (isAdmin && !preview) void load(); }, [isAdmin, preview, load]);

  const samplePayload = useMemo(() => preview ? buildSampleConnectors(Date.now()) : null, [preview]);
  const view = preview ? samplePayload : payload;
  const showBody = preview || isAdmin;

  return <AppShell title="Connector Administration" description="Configure the data and decision connectors used by Hazard Watch. Secrets are write-only and AEGIS never sends warnings.">
    <div className="panel mb-5 flex flex-wrap items-center gap-3 p-3">
      <button type="button" role="switch" aria-checked={preview} aria-describedby="preview-help" onClick={() => { setPreview(value => !value); setNotice(null); nowRef.current = Date.now(); }}
        className="inline-flex min-h-10 items-center gap-3 rounded-lg px-1 text-sm font-semibold">
        <span className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${preview ? "border-amber-600 bg-amber-500" : "border-stroke bg-elevated"}`} aria-hidden="true">
          <span className={`absolute top-0.5 rounded-full bg-white shadow transition-all ${preview ? "left-5" : "left-0.5"}`} style={{ height: 18, width: 18 }}/></span>
        <FlaskConical size={16} aria-hidden="true"/>{t("Preview as admin (sample)")}</button>
      <p id="preview-help" className="min-w-0 flex-1 basis-60 text-xs text-muted">{t("Shows eight sample connectors in different states so the layout can be judged without a session. Makes no API calls and cannot save.")}</p>
      {preview && <SampleBadge/>}
    </div>

    {!preview && session === null && <p className="panel p-6 text-sm text-muted" role="status">{t("Checking operator session…")}</p>}
    {!preview && session !== null && !isAdmin && <section className="panel p-8 text-center" aria-labelledby="connector-auth">
      <Lock size={28} className="mx-auto text-accent" aria-hidden="true"/>
      <h2 id="connector-auth" className="mt-3 text-lg font-bold">{t("platform_admin role required")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">{session.authenticated
        ? t("Your signed-in account does not carry the platform_admin role, so connector settings are hidden.")
        : t("Sign in with a platform_admin account to view and change connector settings.")}</p>
      {!session.authenticated && session.configured && <a href="/api/auth/login" className="control control-primary mt-5">{t("Sign in securely")}</a>}
      {!session.configured && <p className="mt-3 text-xs text-muted">{t("SSO not configured")}</p>}
    </section>}

    {showBody && <>
      {!preview && error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle size={18}/>{error}</div>}
      {!preview && loading && !payload && <div role="status" aria-busy="true"><span className="sr-only">{t("Loading connectors…")}</span>
        <div aria-hidden="true" className="space-y-5"><div className="panel flex items-center gap-5 p-5"><div className="shimmer h-20 w-20 !rounded-full"/><div className="flex-1 space-y-3"><div className="shimmer h-4 w-1/2"/><div className="shimmer h-3 w-3/4"/></div></div>
          <div className="grid gap-5 xl:grid-cols-2">{[0, 1].map(i => <div key={i} className="panel p-5"><div className="shimmer h-5 w-1/3"/><div className="shimmer mt-4 h-10 w-full"/><div className="shimmer mt-3 h-10 w-full"/></div>)}</div></div></div>}
      {!preview && isAdmin && <ProactivePauseControl/>}
      {view && <>
        <SetupHeader payload={view} preview={preview}/>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {view.connectors.map(connector => <ConnectorCard key={`${preview ? "sample" : "live"}-${connector.id}-${connector.version}`} connector={connector} masterKey={view.master_key_configured} preview={preview} now={nowRef.current}
            onToast={setNotice} onSaved={() => void load()}/>)}
        </div>
      </>}
    </>}
    <Toast notice={notice} onClose={clearNotice}/>
  </AppShell>;
}
