"use client";

// Staff email notices (docs/COMMUNICATION_CHANNELS.md): a person's own opt-in, a self-test, and the administrator's
// message log. The address is never typed here: the server reads it from the verified sign-in token.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { Button, DataTable, Panel, RecordRef } from "./ui";
import { useT } from "./language-provider";
import { codeLabel } from "../lib/labels";
import { formatIst } from "../lib/earth-watch";

type Preference = { opted_in: boolean; address: string | null; verified_address_available: boolean; verified_address: string | null;
  channel_enabled: boolean; recipient_hourly_cap: number };
type SendOutcome = { state: string; reason: string | null; provider_status: number | null };
type LogRow = { id: string; recipient_subject: string; recipient: string | null; template_id: string; state: string; reason: string | null;
  provider_status: number | null; actor: string; at: string };

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  const data = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  return { ok: response.ok, status: response.status, data };
}

function outcomeText(t: (s: string) => string, outcome: SendOutcome) {
  if (outcome.state === "sent") return t("Test notice sent. Check your inbox.");
  return `${t(codeLabel(outcome.state))}: ${t(codeLabel(outcome.reason))}`;
}

/** Self-test button shared by the preference panel and the Connectors page. Sends only to the caller's own address. */
export function SendTestButton({ disabled }: Readonly<{ disabled?: boolean }>) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send() {
    setBusy(true); setMessage("");
    try {
      const result = await call<SendOutcome>("/api/staff-messages/test", { method: "POST" });
      setMessage(result.ok ? outcomeText(t, result.data) : t(codeLabel(result.data.code ?? "send_failed")));
    } catch { setMessage(t("The email could not be sent")); }
    setBusy(false);
  }
  return <div className="flex flex-wrap items-center gap-3">
    <Button type="button" size="sm" onClick={send} disabled={disabled || busy}>
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true"/> : <Send size={14} aria-hidden="true"/>}{t("Send a test to my address")}</Button>
    <p className="text-xs" role="status" aria-live="polite">{message}</p>
  </div>;
}

/** "Email notices" preference for the signed-in person. Renders nothing useful until the server answers. */
export function EmailNoticesPanel({ className = "" }: Readonly<{ className?: string }>) {
  const t = useT();
  const [pref, setPref] = useState<Preference | null>(null);
  const [state, setState] = useState<"loading" | "off" | "error" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await call<Preference>("/api/staff-messages/preference");
      if (result.status === 404) { setState("off"); return; }
      if (result.status === 401 || result.status === 403) { setState("off"); return; }
      if (!result.ok) { setState("error"); return; }
      setPref(result.data); setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function change(optedIn: boolean) {
    setBusy(true); setMessage("");
    try {
      const result = await call<Preference>("/api/staff-messages/preference", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opted_in: optedIn }) });
      if (result.ok) { setPref(result.data); setMessage(optedIn ? t("Email notices turned on.") : t("Email notices turned off. Nothing more will be sent.")); }
      else setMessage(t(codeLabel(result.data.code ?? "staff_messages_unavailable")));
    } catch { setMessage(t("Email notices could not be changed. Try again.")); }
    setBusy(false);
  }

  if (state === "off") return null;  // the server has email notices switched off, or this role has none
  return <Panel id="email-notices" className={className} icon={Mail} title={t("Email notices")}
    description={t("Optional rehearsal emails to your own address, for example when a proposal is waiting for a checker. They never carry case details.")}>
    {state === "loading" && <p className="text-xs text-muted" role="status">{t("Loading…")}</p>}
    {state === "error" && <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">{t("Email notices could not be loaded. Try again later.")}</p>}
    {state === "ready" && pref && <div className="space-y-3 text-sm">
      <label className="inline-flex min-h-11 items-center gap-3 font-semibold" htmlFor="email-notices-switch">
        <input id="email-notices-switch" type="checkbox" role="switch" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={pref.opted_in}
          disabled={busy || (!pref.opted_in && !pref.verified_address_available)} aria-describedby="email-notices-help"
          onChange={event => void change(event.target.checked)}/>
        {pref.opted_in ? t("On") : t("Off")}
      </label>
      <p id="email-notices-help" className="text-xs leading-5 text-muted">
        {pref.opted_in ? `${t("Notices go to")} ${pref.address ?? ""}. ${t("The address comes from your sign-in account and cannot be typed here.")}`
          : pref.verified_address_available ? `${t("Turning this on sends notices to")} ${pref.verified_address ?? ""}, ${t("the verified address on your sign-in account.")}`
          : t("Your sign-in account has no verified email address, so email notices cannot be turned on. Ask your administrator.")}
        {" "}{t("At most")} {pref.recipient_hourly_cap} {t("emails an hour. You can turn this off at any time.")}</p>
      {!pref.channel_enabled && <p className="text-xs text-amber-800 dark:text-amber-300">{t("An administrator has not switched on the email channel yet, so nothing is sent for now.")}</p>}
      {pref.opted_in && <SendTestButton disabled={busy}/>}
      <p className="text-xs" role="status" aria-live="polite">{message}</p>
    </div>}
  </Panel>;
}

/** Platform administrator view of this agency's message log. Addresses are masked by the server. */
export function StaffEmailLog() {
  const t = useT();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await call<{ rows: LogRow[] }>("/api/staff-messages/log");
      if (result.status === 404) { setError(t("Email notices are switched off on this server")); setRows([]); return; }
      if (!result.ok) { setError(t("The message log could not be loaded")); setRows([]); return; }
      setRows(Array.isArray(result.data.rows) ? result.data.rows : []); setError("");
    } catch { setError(t("The message log could not be loaded")); setRows([]); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-bold">{t("Message log (last 100)")}</h4>
      <Button size="sm" type="button" onClick={() => void load()}>{t("Refresh")}</Button></div>
    {error && <p className="text-xs text-muted">{error}</p>}
    {rows === null ? <p className="text-xs text-muted" role="status">{t("Loading…")}</p>
      : <DataTable label={t("Email message log")} rows={rows.length} columns={5} minWidth="34rem" maxHeight="18rem" empty={t("No emails attempted yet.")}>
        <thead><tr><th scope="col">{t("When")}</th><th scope="col">{t("To")}</th><th scope="col">{t("Message")}</th><th scope="col">{t("Result")}</th><th scope="col">{t("By")}</th></tr></thead>
        {rows.length > 0 && <tbody>{rows.map(row => <tr key={row.id}>
          <td className="whitespace-nowrap text-xs">{formatIst(row.at)}</td>
          <td className="text-xs">{row.recipient ?? <RecordRef id={row.recipient_subject}/>}</td>
          <td className="text-xs">{t(codeLabel(row.template_id))}</td>
          <td className="text-xs">{t(codeLabel(row.state))}{row.reason ? ` · ${t(codeLabel(row.reason))}` : ""}{row.provider_status ? ` · HTTP ${row.provider_status}` : ""}</td>
          <td className="text-xs"><RecordRef id={row.actor}/></td>
        </tr>)}</tbody>}
      </DataTable>}
  </div>;
}
