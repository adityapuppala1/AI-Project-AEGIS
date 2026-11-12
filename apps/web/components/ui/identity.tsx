"use client";

import type { CSSProperties } from "react";
import {
  Activity, Building2, CloudLightning, CloudRain, Droplets, Flame, KeyRound, Mountain, PenLine, ScrollText, ShieldCheck, SlidersHorizontal, Sun,
  ThermometerSun, Tornado, TriangleAlert, Users, Waves, Wind, X, type LucideIcon,
} from "lucide-react";
import { useT } from "../language-provider";
import { ROLE_INFO, isRoleId, type RoleId, type RoleTone } from "../../lib/roles";
import { hazardStyle, type HazardIcon } from "../../lib/hazards";
import { codeLabel, initials } from "../../lib/labels";
import { CHAIN, type ChainStep } from "../../lib/navigation";

export const ROLE_ICON: Record<RoleTone, LucideIcon> = { maker: PenLine, checker: ShieldCheck, auditor: ScrollText, department: Building2, team: Users, admin: SlidersHorizontal };

/** A role, the same everywhere: plain label, its icon and its colour (never colour alone). Unknown roles get a neutral chip. */
export function RoleChip({ role, className = "" }: Readonly<{ role: string; className?: string }>) {
  const t = useT();
  if (!isRoleId(role)) return <span className={`role-chip ${className}`} data-role="auditor" title={role}>{t(codeLabel(role))}</span>;
  const info = ROLE_INFO[role], Icon = ROLE_ICON[info.tone];
  return <span className={`role-chip ${className}`} data-role={info.tone} title={t(info.summary)}><Icon size={13} aria-hidden="true" />{t(info.label)}</span>;
}

/** Initials in a ring of the person's role colour. Decorative: the name is always shown or announced beside it. */
export function Avatar({ name, role, className = "" }: Readonly<{ name: string | null | undefined; role?: RoleId | null; className?: string }>) {
  return <span aria-hidden="true" className={`avatar ${className}`} data-role={role ? ROLE_INFO[role].tone : undefined}>{initials(name)}</span>;
}

export type KeyState = "empty" | "turned" | "refused";
/**
 * The two-key rule drawn as two slots: the maker's key and a different person's (the checker's) key.
 * A slot is empty (dashed), turned (filled in the role colour) or refused. Text and icon carry the state, not colour alone.
 */
export function TwoKey({ maker, checker, className = "" }: Readonly<{ maker: KeyState; checker: KeyState; className?: string }>) {
  const t = useT();
  const word = (state: KeyState, turned: string) => state === "turned" ? turned : state === "refused" ? "refused" : "waiting";
  const summary = `${t("Maker")}: ${t(word(maker, "submitted"))}. ${t("Checker")}: ${t(word(checker, "approved"))}.`;
  const slot = (tone: "maker" | "checker", state: KeyState, label: string) => <span className="key-slot" data-role={tone} data-state={state}>
    {state === "refused" ? <X size={12} aria-hidden="true" /> : <KeyRound size={12} aria-hidden="true" />}{t(label)}</span>;
  return <span className={`two-key ${className}`} role="img" aria-label={summary} title={summary}>
    {slot("maker", maker, "Maker")}<span className="key-link" aria-hidden="true" />{slot("checker", checker, "Checker")}
  </span>;
}
/** Key states for a proposal status. Unknown statuses show both slots empty. */
export function keysForStatus(status: string | null | undefined): { maker: KeyState; checker: KeyState } {
  switch ((status ?? "").toLowerCase()) {
    case "submitted": case "pending_review": case "in_review": return { maker: "turned", checker: "empty" };
    case "approved": case "applied": return { maker: "turned", checker: "turned" };
    case "rejected": return { maker: "turned", checker: "refused" };
    default: return { maker: "empty", checker: "empty" };
  }
}

const HAZARD_ICON: Record<HazardIcon, LucideIcon> = {
  tornado: Tornado, waves: Waves, droplets: Droplets, "cloud-rain": CloudRain, activity: Activity, "thermometer-sun": ThermometerSun, flame: Flame,
  mountain: Mountain, "cloud-lightning": CloudLightning, wind: Wind, sun: Sun, "triangle-alert": TriangleAlert,
};
/** Hazard glyph with its label. `value` is a hazard code or label from a record; `label` overrides the shown text. */
export function HazardGlyph({ value, label, hideLabel = false, className = "" }: Readonly<{ value: string | null | undefined; label?: string; hideLabel?: boolean; className?: string }>) {
  const t = useT();
  const style = hazardStyle(value), Icon = HAZARD_ICON[style.icon];
  const text = label ?? t(style.key === "other" && value ? codeLabel(value) : style.label);
  return <span className={`hazard ${className}`} style={{ "--hz-l": style.light, "--hz-d": style.dark } as CSSProperties} title={hideLabel ? text : undefined}>
    <i aria-hidden="true"><Icon size={14} /></i>{hideLabel ? <span className="sr-only">{text}</span> : <span>{text}</span>}</span>;
}

/** Where a page sits in the six-step alert chain. Announced as "Step 3 of 6: Decide". */
export function ChainMarker({ step, className = "" }: Readonly<{ step: ChainStep; className?: string }>) {
  const t = useT();
  const at = CHAIN.indexOf(step);
  return <span className={`chain ${className}`} role="img" aria-label={`${t("Alert chain")}: ${t("step")} ${at + 1} / ${CHAIN.length}, ${t(step)}`}>
    <span className="chain-steps" aria-hidden="true">{CHAIN.map((name, index) => <i key={name} data-on={index === at || undefined} data-past={index < at || undefined} />)}</span>
    <span aria-hidden="true">{at + 1}/{CHAIN.length} · {t(step)}</span>
  </span>;
}
