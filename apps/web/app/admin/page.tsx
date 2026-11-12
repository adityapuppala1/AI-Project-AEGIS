"use client";
import { codeLabel } from "../../lib/labels";
import { ErrorState, Panel } from "../../components/ui";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Database, LockKeyhole, Plug, Rocket, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { useT } from "../../components/language-provider";
import { StatStrip, StatTile, StatusPill } from "../../components/ui";

export default function AdminPage() {
  const t = useT();
  const [profile, setProfile] = useState<{
    policy_version: string;
    effective_mode: string;
    oidc_required_for_proposals: boolean;
    independent_checker_required: boolean;
    live_public_warning_enabled: false;
    live_dispatch_enabled: false;
    policy_editor_enabled: false;
  } | null>(null);
  const [profileError, setProfileError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/policy", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Exercise policy profile unavailable");
        const data = await response.json();
        if (data.policy_version !== "aegis.exercise.policy.v1" ||
            data.live_public_warning_enabled !== false ||
            data.live_dispatch_enabled !== false || data.policy_editor_enabled !== false) {
          throw new Error("Unsafe policy classification");
        }
        if (!controller.signal.aborted) setProfile(data);
      })
      .catch(reason => {if (!controller.signal.aborted) setProfileError(reason instanceof Error ? reason.message : "Unavailable");});
    return () => controller.abort();
  }, []);
  return <AppShell title="Administration" description="The server policy in force, and where to set up data sources. Nothing on this screen changes authorization.">
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
      <LockKeyhole className="mt-0.5 shrink-0" size={18}/><div><strong>Read-only policy</strong><p className="mt-1 text-xs leading-5">The policy below is set on the server and cannot be edited from the browser. Signed agency roles are enforced by the API, and live warning and dispatch remain unavailable.</p></div>
    </div>
    <Panel className="mb-5" aria-label="Versioned effective exercise policy">
      <h2 className="t-title">Effective Exercise Policy · Read-only manifest</h2>
      {profileError && <ErrorState message={<>{profileError}. No configuration value is assumed.</>} className="mt-3" />}
      {!profile && !profileError && <p className="mt-3 text-sm text-muted">Loading local exercise policy…</p>}
      {profile && <><StatStrip label={t("Effective policy summary")} className="mt-4">
        <StatTile label="Policy version" value={<span className="text-base" title={profile.policy_version}>{codeLabel(profile.policy_version)}</span>} icon={ShieldCheck} tone="info"/>
        <StatTile label="Effective mode" value={<span className="text-base capitalize">{codeLabel(profile.effective_mode)}</span>} icon={SlidersHorizontal} tone="info"/>
        <StatTile label="Independent checker" value={<span className="text-base">{profile.independent_checker_required ? "Required" : "Unavailable"}</span>} icon={LockKeyhole} tone={profile.independent_checker_required ? "success" : "warning"}/>
        <StatTile label="Live warnings / dispatch" value={<span className="text-base">{profile.live_public_warning_enabled || profile.live_dispatch_enabled ? "Unexpected" : "Disabled"}</span>} icon={LockKeyhole} tone="success"/>
      </StatStrip>
      <ul className="flex flex-wrap gap-2" aria-label={t("Locked safety switches")}>
        {["Live public warning", "Live dispatch", "Policy editor"].map(name => <li key={name}><StatusPill tone="neutral" icon={LockKeyhole}>{name}: {t("Locked off")}</StatusPill></li>)}
      </ul>
      <p className="mt-2 text-xs text-muted">{t("Locked by the server-side exercise policy; the browser cannot change these switches.")}</p></>}
    </Panel>
    <Panel className="mb-5" aria-labelledby="admin-setup" titleId="admin-setup" bodyClassName="p-0" icon={Settings2} title="Set up this server">
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <Link href="/admin/connectors" className="flex items-start gap-3 rounded-lg border border-stroke p-4 transition-colors hover:border-accent hover:bg-elevated">
          <Plug size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true"/><span><strong className="text-sm">Connectors</strong><span className="mt-1 block text-xs leading-5 text-muted">Enter data-source keys and switch connectors on or off. Needs a platform administrator.</span></span>
        </Link>
        <Link href="/admin/go-live" className="flex items-start gap-3 rounded-lg border border-stroke p-4 transition-colors hover:border-accent hover:bg-elevated">
          <Rocket size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true"/><span><strong className="text-sm">Go-Live Setup</strong><span className="mt-1 block text-xs leading-5 text-muted">Every key, switch and agreement needed before real use, and what is still missing.</span></span>
        </Link>
      </div>
    </Panel>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      {[{icon:LockKeyhole,title:"Maker-checker",desc:"Separate reviewer identity required for consequential actions."},{icon:Database,title:"Data provenance",desc:"Source identity, freshness and evidence lineage."},{icon:Activity,title:"Model governance",desc:"Versioned evaluation, drift checks and controlled rollout."}].map(item => <Panel as="div" key={item.title}><item.icon size={21} className="text-accent"/><h3 className="mt-3 text-sm font-bold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-muted">{item.desc}</p><span className="mt-4 inline-block text-[11px] font-semibold text-amber-700 dark:text-amber-300">Planned capability</span></Panel>)}
    </div>
  </AppShell>;
}
