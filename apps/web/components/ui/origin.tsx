"use client";

import { FlaskConical, Globe2, Radio, type LucideIcon } from "lucide-react";
import { useT } from "../language-provider";
import { ORIGIN_TONE, TONE_CLASS, formatAbsolute, originLabel, type Origin } from "./helpers";

const ICON: Record<Origin, LucideIcon> = { live: Radio, synthetic: FlaskConical, public_reference: Globe2 };
const MEANING: Record<Origin, string> = {
  live: "Real data fetched from the named source now or from a short cache. Reference only, not an IndTrana assessment.",
  synthetic: "Seeded exercise data. Not a real incident, sensor or person.",
  public_reference: "Public reference, not an IndTrana assessment.",
};

/**
 * Where a piece of data comes from: "Live · <source>" (with the as-of time), "Synthetic" (seeded exercise data) or
 * "Public reference". Icon plus text, so colour is never the only signal.
 */
export function DataOrigin({ kind, source, asOf, className = "" }: Readonly<{ kind: Origin; source?: string | null; asOf?: string | null; className?: string }>) {
  const t = useT();
  const Icon = ICON[kind];
  const label = kind === "live" && source ? `${t("Live")} · ${source.trim().slice(0, 40)}` : t(originLabel(kind, null));
  const when = kind === "live" && asOf ? formatAbsolute(asOf) : "";
  return <span data-origin={kind} title={`${t(MEANING[kind])}${when ? `\n${t("As of")} ${when}` : ""}`}
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${TONE_CLASS[ORIGIN_TONE[kind]]} ${className}`}>
    <Icon size={12} aria-hidden="true"/><span>{label}</span>
    {when && <span className="font-semibold opacity-80">· {t("as of")} {when}</span>}
  </span>;
}

/** One-line legend for page help: the three origin badges and what they mean. */
export function DataOriginLegend({ className = "" }: Readonly<{ className?: string }>) {
  const t = useT();
  return <p className={`flex flex-wrap items-center gap-2 text-[11px] text-muted ${className}`}>
    <span className="font-bold">{t("Data origin")}:</span>
    <DataOrigin kind="live" source="Bhuvan"/><span>{t("real, fetched now")}</span>
    <DataOrigin kind="synthetic"/><span>{t("seeded exercise data")}</span>
    <DataOrigin kind="public_reference"/><span>{t("public feed, not an assessment")}</span>
  </p>;
}
