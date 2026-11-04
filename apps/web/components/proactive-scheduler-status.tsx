"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useT } from "./language-provider";
import { StatusPill, type Tone } from "./ui";
import { formatIst } from "../lib/earth-watch";
import type { SchedulerStatus, TickOutcome } from "../lib/proactive";

const OUTCOME_LABEL: Record<TickOutcome, string> = {
  completed: "Tick completed", skipped_paused: "Skipped: paused", skipped_locked: "Skipped: another worker ran it", failed: "Tick failed",
};
const OUTCOME_TONE: Record<TickOutcome, Tone> = { completed: "success", skipped_paused: "warning", skipped_locked: "neutral", failed: "danger" };

/** Small read-only strip: scheduler on/off, last tick and next tick. It has no controls. */
export function ProactiveSchedulerStatus({ refreshToken = null }: Readonly<{ refreshToken?: unknown }>) {
  const t = useT();
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/proactive/scheduler", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<SchedulerStatus> : Promise.reject(new Error("scheduler")))
      .then(data => { setStatus(data); setFailed(false); })
      .catch(() => { if (!controller.signal.aborted) { setStatus(null); setFailed(true); } });
    return () => controller.abort();
  }, [refreshToken]); // re-read after each manual refresh

  if (failed) return null; // signed out, wrong role or service unavailable: the watch itself is unaffected
  if (!status) return null;
  const last = status.last_tick;
  return <div className="basis-full flex flex-wrap items-center gap-2 text-xs" role="status" aria-label={t("Scheduler status")}>
    <CalendarClock size={14} className="text-accent" aria-hidden="true"/>
    <span className="font-bold">{t("Scheduler")}:</span>
    <StatusPill tone={status.running ? "info" : "neutral"}>{status.running ? t("on") : t("off")}</StatusPill>
    {last ? <>
      <span className="text-muted">{t("Last tick")} {formatIst(last.started_at)}</span>
      <StatusPill tone={OUTCOME_TONE[last.outcome]}>{t(OUTCOME_LABEL[last.outcome])}</StatusPill>
      <span className="text-muted">{last.runs_started} {t("draft runs prepared")} · {last.flags_recorded} {t("evidence flags")}</span>
    </> : <span className="text-muted">{t("No ticks recorded yet")}</span>}
    {status.running && status.next_tick_at && <span className="text-muted">· {t("Next tick")} {formatIst(status.next_tick_at)}</span>}
    <span className="basis-full text-[11px] text-muted">{t("The scheduler only prepares draft runs and stops before the hand-off. A person reviews every draft; nothing is submitted or sent.")}</span>
  </div>;
}
