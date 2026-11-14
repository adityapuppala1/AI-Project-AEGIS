"use client";
// The What's new page: the current version first (its date, one-line summary and grouped changes), earlier versions
// collapsed below. The text is lib/release-notes.ts; the version is lib/version.ts (apps/web/package.json). Opening the page
// records that this version has been seen, which clears the "New" marker in the account menu (flag only, lib/tour-storage.ts).
import { useEffect } from "react";
import { PackageCheck, ShieldCheck, Sparkles, TrendingUp, Wrench, type LucideIcon } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { Panel, StatusPill } from "./ui";
import { RELEASES, RELEASE_GROUPS, type Release, type ReleaseGroup } from "../lib/release-notes";
import { markWhatsNewSeen } from "../lib/tour-storage";
import { APP_VERSION } from "../lib/version";

const GROUP_ICON: Record<ReleaseGroup, LucideIcon> = { New: Sparkles, Improved: TrendingUp, Fixed: Wrench, Security: ShieldCheck };
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const when = (date: string) => DATE.format(new Date(date + "T00:00:00Z"));

function Groups({ release }: Readonly<{ release: Release }>) {
  const t = useT();
  return <div className="space-y-5">
    {RELEASE_GROUPS.map(group => {
      const items = release.items.filter(item => item.group === group);
      if (items.length === 0) return null;
      const Icon = GROUP_ICON[group];
      return <section key={group} aria-label={t(group)}>
        <h3 className="t-title flex items-center gap-2"><Icon size={15} aria-hidden="true" className="text-muted" />{t(group)}</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 marker:text-muted">{items.map(item => <li key={item.text}>{t(item.text)}</li>)}</ul>
      </section>;
    })}
  </div>;
}

export function WhatsNew() {
  const t = useT();
  useEffect(() => { markWhatsNewSeen(APP_VERSION); }, []);
  const current = RELEASES.find(release => release.version === APP_VERSION) ?? RELEASES[0];
  const earlier = RELEASES.filter(release => release !== current);
  return <AppShell title="What's new" description="What changed in each version of IndTrana, newest first.">
    <div className="space-y-5">
      <Panel data-tour="whatsnew-current" aria-label={`${t("Version")} ${current.version}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PackageCheck size={20} aria-hidden="true" className="text-muted" />
          <h2 className="t-display">{t("Version")} {current.version}</h2>
          <StatusPill tone="info">{t("Current version")}</StatusPill>
          {current.date && <time className="text-sm text-muted" dateTime={current.date}>{when(current.date)}</time>}
        </div>
        <p className="mt-3 max-w-3xl text-base leading-7">{t(current.summary)}</p>
        <div className="mt-6"><Groups release={current} /></div>
      </Panel>
      {earlier.length > 0 && <Panel data-tour="whatsnew-earlier" title={t("Earlier versions")} description={t("Version 0.3.0 is the first tagged release. Earlier versions are summaries of earlier work, with no release date. Open one to read it.")} bodyClassName="p-0">
        <div className="divide-y divide-stroke">
          {earlier.map(release => <details key={release.version} className="px-4 py-1 sm:px-5">
            <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-semibold">{t("Version")} {release.version}</span>
              {release.tagged && release.date ? <time className="text-muted" dateTime={release.date}>{when(release.date)}</time> : <span className="text-muted">{t("Summary of earlier work (no tagged release)")} · {t(release.period ?? "")}</span>}
              <span className="w-full text-muted sm:w-auto sm:flex-1 sm:truncate" title={t(release.summary)}>{t(release.summary)}</span>
            </summary>
            <div className="pb-4 pt-2"><Groups release={release} /></div>
          </details>)}
        </div>
      </Panel>}
      <p className="helper">{t("These notes describe this exercise build. Nothing in them means real warnings, dispatch or forecast accuracy.")}</p>
    </div>
  </AppShell>;
}
