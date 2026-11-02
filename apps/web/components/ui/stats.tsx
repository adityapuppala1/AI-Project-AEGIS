"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useT } from "../language-provider";
import { TONE_BAR_CLASS, clamp01, type Tone } from "./helpers";
import { useCountUp } from "./hooks";

function CountUpNumber({ value }: Readonly<{ value: number }>) {
  return <span className="tabular-nums">{useCountUp(value)}</span>;
}

/**
 * Summary tile. A numeric `value` counts up (instantly under reduced motion); a string/node is shown as is.
 * `meter` (0..1) draws a bar exposed as role=meter. `label` and `hint` must already be translated.
 * With `href` the whole tile is a link. `index` staggers the reveal-in entrance.
 */
export function StatTile({ label, value, icon: Icon, tone = "info", meter, href, hint, index = 0, className = "" }: Readonly<{
  label: string; value: ReactNode; icon?: LucideIcon; tone?: Tone; meter?: number; href?: string; hint?: ReactNode; index?: number; className?: string;
}>) {
  const t = useT();
  const percent = meter === undefined ? null : Math.round(clamp01(meter) * 100);
  const body = <>
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted">{Icon && <Icon size={14} aria-hidden="true" />}{label}</div>
    <div className="mt-2 text-2xl font-bold leading-none">{typeof value === "number" ? <CountUpNumber value={value} /> : value}</div>
    {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    {percent !== null && <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%`} className="mt-3 h-1.5 rounded-full bg-elevated">
      <div className={`bar-grow h-1.5 rounded-full ${TONE_BAR_CLASS[tone]}`} style={{ width: `${percent}%` }} /></div>}
  </>;
  const classes = `panel metric-card reveal-in block p-4 ${className}`;
  const style = { "--i": index } as React.CSSProperties;
  return href
    ? <Link href={href} className={`${classes} hover:border-accent/40`} style={style} aria-label={typeof value === "number" || typeof value === "string" ? `${label}: ${value}. ${t("Open")}` : undefined}>{body}</Link>
    : <div className={classes} style={style}>{body}</div>;
}

/** Responsive grid of StatTiles inside a labelled section. `label` must already be translated. */
export function StatStrip({ label, children, className = "" }: Readonly<{ label: string; children: ReactNode; className?: string }>) {
  return <section aria-label={label} className={`mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 ${className}`}>{children}</section>;
}
