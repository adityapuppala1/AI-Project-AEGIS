"use client";

import { RecordRef, Button } from "./ui";
import { useCallback, useEffect, useState } from "react";
import { Loader2, OctagonPause, Play } from "lucide-react";
import { useT } from "./language-provider";
import { ErrorState, KeyValueList, Panel, StatusPill } from "./ui";
import { formatIst } from "../lib/earth-watch";
import type { PauseState } from "../lib/proactive";

/**
 * platform_admin kill switch for proactive automation. Engaging it blocks run start, run advance and watch refresh
 * (409 proactive_paused); reads, cancellation and existing drafts stay available. Every change needs a reason and
 * is audited server-side with the signed-in subject.
 */
export function ProactivePauseControl() {
  const t = useT();
  const [state, setState] = useState<PauseState | null>(null);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const response = await fetch("/api/proactive/pause", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("unavailable");
      setState(await response.json() as PauseState);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function change(paused: boolean) {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/proactive/pause", { method: "PUT", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused, reason }) });
      const data = await response.json().catch(() => ({})) as PauseState & { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("The kill switch could not be changed."));
      setState(data); setReason("");
      setMessage(paused ? t("Proactive automation paused.") : t("Proactive automation resumed."));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("The kill switch could not be changed.")); }
    setSaving(false);
  }

  const valid = reason.trim().length >= 10 && reason.length <= 500;
  return <Panel title={t("Proactive kill switch")} icon={OctagonPause} className="mb-5"
    description={t("Pausing stops new runs, run steps and evidence refresh for every agency. Reads, cancellation and existing drafts are unaffected.")}
    actions={state && <StatusPill tone={state.paused ? "danger" : "success"}>{state.paused ? t("Paused") : t("Running")}</StatusPill>}>
    <div className="space-y-4 p-4">
      {failed && <ErrorState message={t("The kill switch state could not be read. Writes fail closed until it is readable.")} onRetry={() => void load()}/>}
      {state && <KeyValueList items={[
        { label: t("Last changed"), value: state.updated_at ? formatIst(state.updated_at) : "—" },
        { label: t("Changed by"), value: state.updated_by ? <RecordRef id={state.updated_by} /> : "—" },
        { label: t("Reason"), value: state.reason ?? "—" },
      ]}/>}
      {state && <div className="space-y-2">
        <label htmlFor="pause-reason" className="text-xs font-semibold">{t("Reason for this change (10-500 characters, audited)")}</label>
        <textarea id="pause-reason" className="field min-h-20 w-full" maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/>
        <div className="flex flex-wrap gap-2">
          {state.paused
            ? <Button variant="primary" type="button" disabled={!valid || saving} onClick={() => void change(false)}>
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}{t("Resume proactive automation")}</Button>
            : <Button type="button" disabled={!valid || saving} onClick={() => void change(true)}>
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <OctagonPause size={16} aria-hidden="true"/>}{t("Pause proactive automation")}</Button>}
        </div>
      </div>}
      <p className="text-xs" role="status" aria-live="polite">{message}</p>
      {state?.audit && state.audit.length > 0 && <details className="text-xs">
        <summary className="cursor-pointer font-semibold">{t("Kill switch history")}</summary>
        <ul className="mt-2 space-y-1">
          {state.audit.map((row, index) => <li key={`${row.at}-${index}`} className="border-t border-stroke pt-1">
            {row.at ? formatIst(row.at) : "—"} · {row.paused ? t("Paused") : t("Running")} · <RecordRef id={row.actor} /> · {row.reason}</li>)}
        </ul>
      </details>}
    </div>
  </Panel>;
}
