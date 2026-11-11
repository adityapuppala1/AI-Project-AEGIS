"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock, FlaskConical, Info, ShieldAlert, type LucideIcon } from "lucide-react";
import { useT } from "../language-provider";
import { TONE_CLASS, TONE_ICON_NAME, formatAbsolute, isStaleAge, relativeAge, type Tone, type ToneIconName } from "./helpers";
import { useNow } from "./hooks";

const ICONS: Record<ToneIconName, LucideIcon> = { circle: Circle, info: Info, check: CheckCircle2, alert: AlertTriangle, "shield-alert": ShieldAlert, flask: FlaskConical };
export const toneIcon = (tone: Tone): LucideIcon => ICONS[TONE_ICON_NAME[tone]];

/** Status chip: tone colour plus an icon and text. `children` must already be translated by the caller. */
export function StatusPill({ tone = "neutral", icon, children, className = "" }: Readonly<{ tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }>) {
  const Icon = icon ?? toneIcon(tone);
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${TONE_CLASS[tone]} ${className}`}>
    <Icon size={12} aria-hidden="true" /><span className="first-cap">{children}</span></span>;
}

/**
 * Observed/ingested timestamps as relative ages. Past `staleAfterHours` (or when the time is unknown) a Stale label
 * is shown with a warning icon. The title holds absolute UTC times. Never presents unknown time as fresh.
 */
export function DataFreshness({ observedAt, ingestedAt, staleAfterHours = 48, stale, now, className = "" }: Readonly<{
  observedAt: string | null | undefined; ingestedAt?: string | null; staleAfterHours?: number; stale?: boolean; now?: number; className?: string;
}>) {
  const t = useT();
  const clock = useNow(now);
  const age = (iso: string | null | undefined) => {
    if (clock === null) return "…";
    const parts = relativeAge(iso, clock);
    if (!parts) return t("time unknown");
    return parts.unit === "now" ? t("just now") : `${parts.n} ${t(parts.unit)} ${t("ago")}`;
  };
  const isStale = stale === true || (clock !== null && isStaleAge(observedAt, clock, staleAfterHours));
  const title = [
    `${t("Observed")}: ${formatAbsolute(observedAt) || t("time unknown")}`,
    ingestedAt !== undefined ? `${t("Ingested")}: ${formatAbsolute(ingestedAt) || t("time unknown")}` : "",
  ].filter(Boolean).join("\n");
  return <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted ${className}`} title={title}>
    <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" />{t("Observed")} {age(observedAt)}</span>
    {ingestedAt !== undefined && <span>{t("Ingested")} {age(ingestedAt)}</span>}
    {isStale && <StatusPill tone="warning">{t("Stale")}</StatusPill>}
  </span>;
}
