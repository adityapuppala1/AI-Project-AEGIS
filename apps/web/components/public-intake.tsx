"use client";

import { ErrorState, Button, Panel, PermissionState } from "./ui";
import { canOpenPage, pageRoles } from "../lib/roles";
import { useOperatorSession } from "../lib/use-operator-session";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CircleHelp, Droplets, Flame, Inbox, Loader2, Mountain, PhoneCall, RefreshCw, Send, ShieldAlert, Wind, Waves,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import {
  HAZARDS, LIMITS, PRESET_LOCATIONS, validateDraft,
  type DraftErrors, type HazardKey, type IntakeDraft, type QuarantinedReport,
} from "../lib/public-intake";
import { formatIst } from "../lib/earth-watch";

const ICONS: Record<HazardKey, LucideIcon> = { flood: Waves, waterlogging: Droplets, wildfire: Flame, landslide: Mountain, cyclone: Wind, other: CircleHelp };
const TONES: Record<HazardKey, string> = {
  flood: "text-sky-500 bg-sky-500/10", waterlogging: "text-cyan-500 bg-cyan-500/10", wildfire: "text-orange-500 bg-orange-500/10",
  landslide: "text-amber-600 bg-amber-500/10", cyclone: "text-violet-500 bg-violet-500/10", other: "text-slate-500 bg-slate-500/10",
};
const EMPTY: IntakeDraft = { title: "", description: "", hazard_type: "", lat: String(PRESET_LOCATIONS[0].lat), lon: String(PRESET_LOCATIONS[0].lon) };
type Gate = "checking" | "disabled" | "enabled" | "error";

function Counter({ value, max }: Readonly<{ value: number; max: number }>) {
  return <span className={`text-[11px] tabular-nums ${value > max ? "text-rose-600" : "text-muted"}`}>{value}/{max}</span>;
}

export function PublicIntake() {
  const t = useT();
  const [gate, setGate] = useState<Gate>("checking");
  const [draft, setDraft] = useState<IntakeDraft>(EMPTY);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string | null; duplicate: boolean } | null>(null);
  const [reports, setReports] = useState<QuarantinedReport[]>([]);
  const [total, setTotal] = useState(0);
  const [queueError, setQueueError] = useState("");
  const [loading, setLoading] = useState(false);
  const [queueRefused, setQueueRefused] = useState(false);
  const session = useOperatorSession();
  // Menus only: the server decides. A role outside the queue readers sees the standard permission state.
  const refused = queueRefused || (session !== null && session.authenticated && !canOpenPage("/public-intake", session.roles));

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/public-intake", { cache: "no-store", signal });
      if (response.status === 403) { setQueueRefused(true); return; }
      if (!response.ok) throw new Error("Quarantine queue unavailable");
      const payload = await response.json() as { classification?: string; total?: number; reports?: QuarantinedReport[] };
      if (payload.classification !== "public_unverified_intake" || !Array.isArray(payload.reports)) throw new Error("Unexpected queue classification");
      setReports(payload.reports); setTotal(payload.total ?? payload.reports.length); setQueueError("");
    } catch (reason) {
      if (!signal?.aborted) setQueueError(reason instanceof Error ? reason.message : "Quarantine queue unavailable");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    if (refused) return;
    const controller = new AbortController();
    fetch("/api/public-intake/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("status");
        const status = await response.json() as { classification?: string; enabled?: boolean; quarantine_only?: boolean; creates_cases?: boolean };
        if (status.classification !== "public_unverified_intake" || status.quarantine_only !== true || status.creates_cases !== false) throw new Error("unexpected");
        if (controller.signal.aborted) return;
        setGate(status.enabled ? "enabled" : "disabled");
        if (status.enabled) await loadQueue(controller.signal);
      })
      .catch(() => { if (!controller.signal.aborted) setGate("error"); });
    return () => controller.abort();
  }, [loadQueue, refused]);

  const update = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    setFormError("");
  };

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.values(found).some(Boolean)) { setFormError("Please fix the highlighted fields."); return; }
    setSubmitting(true); setFormError("");
    try {
      const response = await fetch("/api/public-intake", {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ title: draft.title.trim(), description: draft.description.trim(), hazard_type: draft.hazard_type, lat: Number(draft.lat), lon: Number(draft.lon) }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; id?: string; duplicate?: boolean };
      if (response.status === 201) {
        setReceipt({ id: typeof body.id === "string" ? body.id : null, duplicate: body.duplicate === true }); setDraft(EMPTY); void loadQueue();
      } else if (response.status === 503) setFormError("Public intake was switched off while you were typing.");
      else setFormError(body.error ?? "The report could not be submitted. Nothing was saved.");
    } catch { setFormError("The report could not be submitted. Check your connection; nothing was saved."); }
    finally { setSubmitting(false); }
  }

  const field = "field w-full";
  return <AppShell title="Public Intake" description="A quarantine-only form for unverified public reports. Reports are held for human review and never become cases automatically.">
    <div className="mb-5 grid gap-3 lg:grid-cols-2">
      <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs leading-6 text-rose-800 dark:text-rose-200" role="note">
        <PhoneCall className="mt-1 shrink-0" size={19}/>
        <p><strong>{t("In an emergency, call 112 now.")}</strong>{t(" This form is not monitored in real time. It does not alert anyone and no responder is dispatched.")}</p>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
        <ShieldAlert className="mt-1 shrink-0" size={19}/>
        <p><strong>{t("Quarantine only.")}</strong>{t(" No name, phone, email or link is accepted. Reports are unverified, cannot create or change a case, and are shown to reviewers as received.")}</p>
      </div>
    </div>

    {refused && <PermissionState needs={pageRoles("/public-intake") ?? []} roles={session?.roles}
      what={t("The quarantine queue holds unreviewed public reports, so it is for the incident desk and administrators.")} />}
    {!refused && gate === "checking" && <Panel as="div" bodyClassName="p-4 text-sm text-muted" role="status">{t("Checking whether public intake is enabled…")}</Panel>}
    {!refused && gate === "error" && <ErrorState message={t("Intake status is unavailable. The rest of IndTrana is unaffected.")} />}
    {!refused && gate === "disabled" && <Panel>
      <h2 className="flex items-center gap-2 t-title"><Inbox size={18} className="text-accent"/> {t("Public intake is switched off")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("The base IndTrana stack accepts no public input. To rehearse intake, restart with the optional profile. Reports go to an isolated quarantine table only.")}</p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-elevated p-4 text-xs" tabIndex={0} aria-label="Start command"><code>powershell -ExecutionPolicy Bypass -File scripts/start-windows.ps1 -NoBuild -PublicIntake</code></pre>
    </Panel>}

    {!refused && gate === "enabled" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,1fr)]">
      <Panel className="min-w-0" aria-label={t("Report what you see")} bodyClassName="p-0" icon={Send} title={t("Report what you see")}
        actions={<span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">{t("Unverified")}</span>}>
        {receipt ? <div className="p-6 text-center" role="status">
          <svg viewBox="0 0 64 64" className="mx-auto h-20 w-20" aria-hidden="true">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#34b4a6" strokeWidth="4" opacity=".35"/>
            <path className="draw-check" d="M19 33l9 9 18-20" fill="none" stroke="#34b4a6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h3 className="mt-3 text-lg font-bold">{receipt.duplicate ? t("Already received") : t("Received for human review")}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{t("It is unverified, creates no case and notifies no responder.")}{receipt.id && <>{t(" Reference")} <code className="rounded bg-elevated px-1.5 py-0.5 text-xs">{receipt.id.slice(0, 8)}</code></>}</p>
          <Button className="mt-5" type="button" onClick={() => setReceipt(null)}>{t("Send another report")}</Button>
        </div> : <form className="space-y-5 p-5" onSubmit={event => void submit(event)} noValidate>
          <fieldset>
            <legend className="mb-2 text-xs font-bold text-muted">{t("What are you reporting?")}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {HAZARDS.map(({ key, label, hint }, index) => {
                const Icon = ICONS[key], active = draft.hazard_type === key;
                return <label key={key} className={`reveal-in flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-accent ${active ? "border-accent bg-accent/5" : "border-stroke hover:bg-elevated"}`} style={{ "--i": index } as React.CSSProperties}>
                  <input type="radio" name="hazard" value={key} checked={active} onChange={() => update("hazard_type", key)} className="sr-only"/>
                  <span className={`rounded-lg p-2 ${TONES[key]}`}><Icon size={17} aria-hidden="true"/></span>
                  <span className="min-w-0"><span className="field-label">{t(label)}</span><span className="block text-[10px] leading-tight text-muted">{t(hint)}</span></span>
                </label>;
              })}
            </div>
            {errors.hazard_type && <p role="alert" className="mt-2 text-xs text-rose-600">{t(errors.hazard_type)}</p>}
          </fieldset>
          <div>
            <div className="mb-1 flex items-center justify-between"><label htmlFor="intake-title" className="text-xs font-bold text-muted">{t("Short title")}</label><Counter value={draft.title.length} max={LIMITS.title[1]}/></div>
            <input id="intake-title" className={field} value={draft.title} maxLength={LIMITS.title[1] + 20} placeholder={t("e.g. Water rising near the market bridge")} onChange={event => update("title", event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby="intake-title-error"/>
            {errors.title && <p id="intake-title-error" role="alert" className="mt-1 text-xs text-rose-600">{t(errors.title)}</p>}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><label htmlFor="intake-description" className="text-xs font-bold text-muted">{t("What is happening?")}</label><Counter value={draft.description.length} max={LIMITS.description[1]}/></div>
            <textarea id="intake-description" className={`${field} min-h-[110px]`} value={draft.description} maxLength={LIMITS.description[1] + 50} placeholder={t("Describe what you can see. Do not include names, phone numbers, emails or links.")} onChange={event => update("description", event.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby="intake-description-error"/>
            {errors.description && <p id="intake-description-error" role="alert" className="mt-1 text-xs text-rose-600">{t(errors.description)}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-muted">{t("Nearest city")}
              <select className={`${field} mt-1`} defaultValue={PRESET_LOCATIONS[0].label} onChange={event => {
                const place = PRESET_LOCATIONS.find(item => item.label === event.target.value);
                if (place) { setDraft(current => ({ ...current, lat: String(place.lat), lon: String(place.lon) })); setErrors(current => ({ ...current, lat: undefined, lon: undefined })); }
              }}>{PRESET_LOCATIONS.map(place => <option key={place.label} value={place.label}>{t(place.label)}</option>)}<option value="">{t("Custom coordinates")}</option></select></label>
            <label className="text-xs font-bold text-muted">{t("Latitude")}
              <input className={`${field} mt-1`} inputMode="decimal" value={draft.lat} onChange={event => update("lat", event.target.value)} aria-invalid={Boolean(errors.lat)}/>
              {errors.lat && <span role="alert" className="mt-1 block text-[11px] font-normal text-rose-600">{t(errors.lat)}</span>}</label>
            <label className="text-xs font-bold text-muted">{t("Longitude")}
              <input className={`${field} mt-1`} inputMode="decimal" value={draft.lon} onChange={event => update("lon", event.target.value)} aria-invalid={Boolean(errors.lon)}/>
              {errors.lon && <span role="alert" className="mt-1 block text-[11px] font-normal text-rose-600">{t(errors.lon)}</span>}</label>
          </div>
          {formError && <ErrorState message={t(formError)} />}
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} {submitting ? t("Sending…") : t("Send to quarantine")}
          </Button>
        </form>}
      </Panel>

      <Panel className="min-w-0" aria-label={t("Quarantine queue")} bodyClassName="p-0" icon={Inbox} title={t("Quarantine queue")} description={`${total} ${t("stored · read-only · not cases")}`}
        actions={<Button size="sm" type="button" onClick={() => void loadQueue()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> {t("Refresh")}</Button>}>
        {queueError && <ErrorState message={queueError} className="m-4" />}
        <div className="max-h-[560px] divide-y divide-stroke overflow-y-auto">
          {reports.map((report, index) => {
            const Icon = ICONS[report.hazard_type] ?? CircleHelp;
            return <article key={report.id} className="reveal-in flex gap-3 p-4" style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
              <span className={`mt-0.5 h-fit rounded-lg p-2 ${TONES[report.hazard_type] ?? TONES.other}`}><Icon size={16} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold">{report.title}</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted">{report.description}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span>{formatIst(report.submitted_at)}</span><span className="tabular-nums">{report.lat.toFixed(3)}, {report.lon.toFixed(3)}</span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">{t("Quarantined · not a case")}</span></p>
              </div>
            </article>;
          })}
          {!loading && reports.length === 0 && !queueError && <p className="p-8 text-center text-xs text-muted">{t("No reports are in quarantine yet.")}</p>}
        </div>
      </Panel>
    </div>}
  </AppShell>;
}
