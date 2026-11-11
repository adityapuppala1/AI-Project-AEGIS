"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { ErrorState, Panel } from "./ui";

export type IncidentIssue = "unreachable" | "unparseable" | "unexpected";

/** Honest failure view for the incident detail route. No stale or invented evidence is shown. */
export function IncidentUnavailable({ issue }: Readonly<{ issue: IncidentIssue }>) {
  const t = useT();
  const message = issue === "unreachable"
    ? t("The incident service could not be reached. No stale or invented evidence is shown. Check the local API and PostgreSQL containers.")
    : issue === "unparseable"
      ? t("Incident data could not be parsed. Please retry from the registry.")
      : t("Refusing to display an unexpected incident classification.");
  return <AppShell title="Incident Intelligence" description="Exercise source and chronology investigation" breadcrumbs={[{ label: t("Observe") }, { label: t("Incident Registry"), href: "/incidents" }, { label: t("Incident") }]}>
    <Panel title={t("Incident workspace temporarily unavailable")} className="p-0">
      <div className="space-y-4 p-5">
        <ErrorState message={message}/>
        <Link className="control" href="/incidents"><ArrowLeft size={16} aria-hidden="true"/> {t("Return to incident registry")}</Link>
      </div>
    </Panel>
  </AppShell>;
}
