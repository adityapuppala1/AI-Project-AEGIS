"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, History, KeyRound, Loader2, Lock, Plug, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { useOperatorSession } from "../lib/use-operator-session";
import type { AuditRow, Connector, ConnectorsPayload, TestResult } from "../lib/proactive";
import { formatIst } from "../lib/earth-watch";

type Notice = { tone: "ok" | "error"; text: string };
const NOTICE_STYLE = { ok: "text-emerald-700 dark:text-emerald-300", error: "text-rose-700 dark:text-rose-300" };

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  const data = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  return { ok: response.ok, status: response.status, data };
}

function ConnectorCard({ connector, masterKey, onSaved }: Readonly<{ connector: Connector; masterKey: boolean; onSaved: (message: Notice) => void }>) {
  const t = useT();
  const readOnly = connector.id === "authority_notification";
  const fieldSettings = connector.fields.filter(field => !field.secret);
  const secretFields = connector.fields.filter(field => field.secret);
  const [enabled, setEnabled] = useState(connector.enabled);
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>(connector.settings);
  const [secrets, setSecrets] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [status, setStatus] = useState<Notice | null>(null);
  const [test, setTest] = useState<TestResult | null>(connector.last_test);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const base = `connector-${connector.id}`;

  async function save() {
    setBusy("save"); setStatus(null);
    try {
      const body = { expected_version: connector.version, enabled, settings, secrets };
      const result = await call<Connector>(`/api/proactive/connectors/${connector.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setSecrets({});
      if (result.ok) onSaved({ tone: "ok", text: `${connector.name}: saved.` });
      else if (result.status === 409 && result.data.code === "version_mismatch") setStatus({ tone: "error", text: t("This connector changed elsewhere. Reload the list, then re-apply your edit.") });
      else if (result.status === 409) setStatus({ tone: "error", text: t("The service refused this change. Authority notification can never be enabled.") });
      else if (result.data.code === "connector_key_missing") setStatus({ tone: "error", text: t("The master key is not configured, so secrets cannot be saved.") });
      else setStatus({ tone: "error", text: result.data.error ?? t("Save failed") });
    } catch { setStatus({ tone: "error", text: t("Save failed") }); }
    setBusy("");
  }
  async function runTest() {
    setBusy("test"); setStatus(null);
    try {
      const result = await call<TestResult>(`/api/proactive/connectors/${connector.id}/test`, { method: "POST" });
      if (result.ok) setTest(result.data);
      else setStatus({ tone: "error", text: result.data.error ?? t("Test failed") });
    } catch { setStatus({ tone: "error", text: t("Test failed") }); }
    setBusy("");
  }
  async function toggleAudit() {
    const next = !auditOpen;
    setAuditOpen(next);
    if (next && audit === null) {
      try {
        const result = await call<{ rows: AuditRow[] }>(`/api/proactive/connectors/${connector.id}/audit`);
        setAudit(result.ok ? result.data.rows : []);
      } catch { setAudit([]); }
    }
  }
  const secretsPending = Object.keys(secrets).length > 0;

  return <section className="panel min-w-0" aria-labelledby={`${base}-title`}>
    <div className="panel-heading">
      <div>
        <h2 id={`${base}-title`} className="flex items-center gap-2 text-base font-bold"><Plug size={18} className="text-accent" aria-hidden="true"/>{connector.name}</h2>
        <p className="mt-1 text-xs text-muted">{connector.category} · {t("Licence")}: {connector.licence || t("not stated")} · v{connector.version}</p>
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-semibold" htmlFor={`${base}-enabled`}>
        <input id={`${base}-enabled`} type="checkbox" role="switch" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={enabled} disabled={readOnly || busy !== ""}
          aria-describedby={`${base}-hosts`} onChange={event => setEnabled(event.target.checked)}/>
        {enabled ? t("Enabled") : t("Disabled")}
      </label>
    </div>
    <div className="space-y-4 p-5">
      <p id={`${base}-hosts`} className="text-xs text-muted"><span className="font-bold">{t("Allowlisted hosts")}:</span>{" "}
        {connector.hosts.length ? connector.hosts.join(", ") : t("none (no network access)")}</p>
      {readOnly && <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200" role="note">
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true"/>{t("Read-only. AEGIS never sends warnings or notifications to authorities; this connector cannot be enabled. Hand-over is a CAP file a human downloads.")}</p>}

      {fieldSettings.map(field => {
        const id = `${base}-s-${field.name}`;
        const value = settings[field.name];
        const hint = `${id}-hint`;
        return <div key={field.name}>
          <label htmlFor={id} className="mb-1 block text-xs font-bold">{field.label}{field.required ? " *" : ""}</label>
          {typeof value === "boolean" ? <input id={id} type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={value} disabled={readOnly} aria-describedby={hint}
              onChange={event => setSettings(current => ({ ...current, [field.name]: event.target.checked }))}/>
            : <input id={id} className="field" type={typeof value === "number" ? "number" : "text"} value={value === undefined ? "" : String(value)} disabled={readOnly} aria-describedby={hint} maxLength={512}
              onChange={event => setSettings(current => ({ ...current, [field.name]: typeof value === "number" ? (Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0) : event.target.value }))}/>}
          <p id={hint} className="mt-1 text-[11px] text-muted">{t("Setting")}: {field.name}</p>
        </div>;
      })}
      {Object.keys(connector.settings).filter(key => !fieldSettings.some(field => field.name === key)).length > 0 &&
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2" aria-label={t("Fixed settings")}>
          {Object.entries(connector.settings).filter(([key]) => !fieldSettings.some(field => field.name === key)).map(([key, value]) =>
            <div key={key} className="flex gap-2"><dt className="font-bold text-muted">{key}</dt><dd className="min-w-0 break-all">{String(value)}</dd></div>)}
        </dl>}

      {secretFields.map(field => {
        const id = `${base}-k-${field.name}`;
        const hint = `${id}-hint`;
        const pendingClear = secrets[field.name] === null;
        return <div key={field.name}>
          <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs font-bold"><KeyRound size={14} aria-hidden="true"/>{field.label}{field.required ? " *" : ""}</label>
          <div className="flex gap-2">
            <input id={id} className="field" type="password" autoComplete="off" spellCheck={false} maxLength={512} disabled={pendingClear || busy !== ""} aria-describedby={hint}
              placeholder={field.set ? `${t("set")} · ${t("fingerprint")} ${field.fingerprint ?? "n/a"}` : t("not set")}
              value={typeof secrets[field.name] === "string" ? secrets[field.name] as string : ""}
              onChange={event => setSecrets(current => {
                const next = { ...current };
                if (event.target.value) next[field.name] = event.target.value; else delete next[field.name];
                return next;
              })}/>
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

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && <button type="button" className="control control-primary" onClick={save} disabled={busy !== "" || (secretsPending && !masterKey)}>
          {busy === "save" ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <Save size={16} aria-hidden="true"/>}{t("Save")}</button>}
        <button type="button" className="control" onClick={runTest} disabled={busy !== ""}>
          {busy === "test" ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <Activity size={16} aria-hidden="true"/>}{t("Test connection")}</button>
        {secretsPending && !masterKey && <span className="text-xs text-rose-700 dark:text-rose-300">{t("The master key is not configured, so secrets cannot be saved.")}</span>}
      </div>
      <div aria-live="polite" role="status" className="min-h-5 text-xs">
        {status && <p className={NOTICE_STYLE[status.tone]}>{status.text}</p>}
        {test && <p className={test.ok ? NOTICE_STYLE.ok : NOTICE_STYLE.error}>
          {test.ok ? t("Test passed") : t("Test failed")} · HTTP {test.status_code ?? "n/a"} · {test.latency_ms ?? "n/a"} ms{test.message ? ` · ${test.message}` : ""}{test.at ? ` · ${formatIst(test.at)}` : ""}</p>}
      </div>

      <div>
        <button type="button" className="control" aria-expanded={auditOpen} aria-controls={`${base}-audit`} onClick={toggleAudit}>
          <History size={16} aria-hidden="true"/>{t("Audit (last 50)")}<ChevronDown size={14} aria-hidden="true" className={auditOpen ? "rotate-180" : ""}/></button>
        {auditOpen && <div id={`${base}-audit`} className="mt-3 overflow-x-auto">
          {audit === null ? <p className="text-xs text-muted" role="status">{t("Loading audit…")}</p>
            : audit.length === 0 ? <p className="text-xs text-muted">{t("No audit entries yet.")}</p>
            : <table className="w-full text-left text-xs">
              <caption className="sr-only">{connector.name} {t("Audit (last 50)")}</caption>
              <thead><tr className="text-muted"><th scope="col" className="py-1 pr-3">{t("When")}</th><th scope="col" className="pr-3">{t("Action")}</th><th scope="col" className="pr-3">{t("Result")}</th><th scope="col">{t("Actor")}</th></tr></thead>
              <tbody>{audit.map((row, index) => <tr key={row.id || index} className="border-t border-stroke">
                <td className="py-1 pr-3">{formatIst(row.at)}</td><td className="pr-3">{row.action}</td><td className="pr-3">{row.ok ? t("ok") : t("failed")}</td><td className="break-all">{row.actor}</td></tr>)}</tbody>
            </table>}
        </div>}
      </div>
    </div>
  </section>;
}

export function ConnectorAdmin() {
  const t = useT();
  const session = useOperatorSession();
  const isAdmin = session?.roles.includes("platform_admin") === true;
  const [payload, setPayload] = useState<ConnectorsPayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await call<ConnectorsPayload>("/api/proactive/connectors");
      if (!result.ok) throw new Error(result.status === 404 ? t("The proactive feature is switched off on this server.") : result.data.error ?? t("Connectors unavailable"));
      setPayload(result.data); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Connectors unavailable")); }
    setLoading(false);
  }, [t]);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  return <AppShell title="Connector Administration" description="Configure the data and decision connectors used by Hazard Watch. Secrets are write-only and AEGIS never sends warnings.">
    {session === null && <p className="panel p-6 text-sm text-muted" role="status">{t("Checking operator session…")}</p>}
    {session !== null && !isAdmin && <section className="panel p-8 text-center" aria-labelledby="connector-auth">
      <Lock size={28} className="mx-auto text-accent" aria-hidden="true"/>
      <h2 id="connector-auth" className="mt-3 text-lg font-bold">{t("platform_admin role required")}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">{session.authenticated
        ? t("Your signed-in account does not carry the platform_admin role, so connector settings are hidden.")
        : t("Sign in with a platform_admin account to view and change connector settings.")}</p>
      {!session.authenticated && session.configured && <a href="/api/auth/login" className="control control-primary mt-5">{t("Sign in securely")}</a>}
      {!session.configured && <p className="mt-3 text-xs text-muted">{t("SSO not configured")}</p>}
    </section>}
    {isAdmin && <>
      {payload && <div role={payload.master_key_configured ? "status" : "alert"}
        className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-xs leading-6 ${payload.master_key_configured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200"}`}>
        {payload.master_key_configured ? <ShieldCheck size={19} className="mt-1 shrink-0" aria-hidden="true"/> : <AlertTriangle size={19} className="mt-1 shrink-0" aria-hidden="true"/>}
        <p>{payload.master_key_configured ? t("Master key configured. Secrets are encrypted at rest and never shown again.") : t("Master key missing. Settings can be edited, but saving a secret fails closed until AEGIS_CONNECTOR_KEY is configured.")}</p>
      </div>}
      <div aria-live="polite" role="status" className="mb-3 min-h-5 text-sm">{notice && <p className={NOTICE_STYLE[notice.tone]}>{notice.text}</p>}</div>
      {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle size={18}/>{error}</div>}
      {loading && !payload && <p className="panel p-6 text-sm text-muted" role="status"><Loader2 size={16} className="mr-2 inline animate-spin"/>{t("Loading connectors…")}</p>}
      {payload && <div className="grid gap-5 xl:grid-cols-2">
        {payload.connectors.map(connector => <ConnectorCard key={`${connector.id}-${connector.version}`} connector={connector} masterKey={payload.master_key_configured}
          onSaved={message => { setNotice(message); void load(); }}/>)}
      </div>}
    </>}
  </AppShell>;
}
