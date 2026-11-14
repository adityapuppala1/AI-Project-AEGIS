"use client";

import Link from "next/link";
import { Award, ArrowRight, FileText } from "lucide-react";
import { useT } from "./language-provider";
import { Panel, buttonClass } from "./ui";
import { PATENT } from "../lib/patent";

// The credit shown inside the signed-in app (About page and the Resilient Sensor Link page). The facts come only from
// lib/patent.ts. The public landing page prints the same facts as text without this component.
const REHEARSAL = "This page illustrates, in a rehearsal simulation, how the idea named in the title of Indian Patent No. 598835 would serve IndTrana. The priority classes and switch-over rules shown are IndTrana's rehearsal choices, not the patent's claims.";

export function PatentCredit({ showLink = true, pageNote = false }: Readonly<{ showLink?: boolean; pageNote?: boolean }>) {
  const t = useT();
  return <Panel id="patented-technology" className="scroll-mt-24" title={t("Patented technology")} icon={Award} level={2}>
    <p className="max-w-3xl text-sm font-semibold leading-6">{t(PATENT.title)}</p>
    <p className="mt-1 text-sm leading-6">{t("Indian Patent No. 598835 · granted 12 August 2026 · Patentee: Bharath Bejjarapu, co-owner of IndTrana")}</p>
    <p className="mt-0.5 text-xs leading-5 text-muted">{t("Application No. 201741007139 · filed 28 February 2017")}</p>
    <p className="mt-3 max-w-3xl text-sm leading-6">{t(PATENT.howItApplies)}</p>
    {pageNote && <p className="mt-2 max-w-3xl text-sm leading-6">{t(PATENT.publishedDescription)}</p>}
    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{t(PATENT.titleOnlyNote)}</p>
    {pageNote && <p className="mt-2 max-w-3xl text-sm leading-6">{t(REHEARSAL)}</p>}
    <p className="mt-3"><a href={PATENT.certificatePath} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "sm" })}><FileText size={14} aria-hidden="true" />{t("View patent certificate (PDF)")}</a></p>
    {showLink && <p className="mt-2"><Link href="/sensor-link" className={buttonClass({ size: "sm" })}>{t("See the rehearsal simulation")}<ArrowRight size={14} aria-hidden="true" /></Link></p>}
  </Panel>;
}
