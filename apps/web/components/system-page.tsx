"use client";

import Link from "next/link";
import { buttonClass } from "./ui";
import type { ReactNode } from "react";
import { Command } from "lucide-react";
import { useT } from "./language-provider";

/** Minimal branded page for errors, used when the full shell may itself be the thing that failed. */
export function SystemPage({ code, title, body, children }: Readonly<{ code: string; title: string; body: string; children?: ReactNode }>) {
  const t = useT();
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
    <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-3 self-start rounded-md" aria-label={t("IndTrana home")}>
      <span className="brand-mark flex h-9 w-9 items-center justify-center"><Command size={19} aria-hidden="true" /></span>
      <strong className="text-base font-bold tracking-[.12em]">{t("IndTrana")}</strong>
    </Link>
    <div className="desk-strip mb-6 rounded-md border border-stroke"><span className="exercise-tape">{t("EXERCISE")}<small>{t("No live warnings or dispatch")}</small></span></div>
    <p className="tnum text-sm font-semibold text-brand">{code}</p>
    <h1 className="t-display mt-1">{t(title)}</h1>
    <p className="mt-3 text-sm leading-6 text-muted">{t(body)}</p>
    <div className="mt-6 flex flex-wrap gap-2">{children}<Link href="/" className={buttonClass()}>{t("Back to Command Center")}</Link></div>
  </main>;
}
