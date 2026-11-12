"use client";
import { useState } from "react";
import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Info, KeyRound, LogIn, LogOut } from "lucide-react";
import { useT } from "./language-provider";
import { clearExerciseDraftRecovery } from "../lib/exercise-draft-buffer";
import { useOperatorSession, type SessionInfo } from "../lib/use-operator-session";
import { ROLE_INFO, knownRoles, primaryRole } from "../lib/roles";
import { codeLabel, timeLeft } from "../lib/labels";
import { responseTeamLabel } from "../lib/response-teams";
import { Avatar, RoleChip } from "./ui/identity";
import { RecordRef } from "./ui/record";
import { useNow } from "./ui/hooks";

/** The name shown for a signed-in person. Never the raw account id. */
export function personName(session: SessionInfo): string {
  return session.displayName || session.username || "Signed-in operator";
}

/** "1 h 12 min" from the session end time; empty until the clock is known. */
export function useSessionTimeLeft(expiresAt: number | undefined): string {
  const t = useT();
  const now = useNow(undefined, 30_000);
  if (!expiresAt || now === null) return "";
  const left = timeLeft(expiresAt - now);
  if (!left) return t("ended");
  if (left.hours === 0 && left.minutes === 0) return t("under a minute");
  return (left.hours > 0 ? `${left.hours} ${t("hr")} ` : "") + `${left.minutes} ${t("min")}`;
}

/** Account menu: who is signed in, in which role, for which agency, for how long, and Sign out. Visible at every width. */
export function OperatorAuth() {
  const t = useT();
  const session = useOperatorSession();
  const [busy, setBusy] = useState(false);
  const left = useSessionTimeLeft(session?.expiresAt);
  async function signOut() {
    setBusy(true);
    clearExerciseDraftRecovery();
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not sign out");
      const body: { logoutUrl?: string } = await response.json().catch(() => ({}));
      // The local session is already cleared above regardless; also end the provider's own SSO
      // session when available, or a same-browser sign-in right after would skip the login prompt.
      window.location.assign(body.logoutUrl || "/");
    } catch { setBusy(false); }
  }
  if (!session) return <span className="avatar shimmer" role="status" aria-label={t("Checking operator session...")} />;
  if (session.authenticated) {
    const name = personName(session), role = primaryRole(session.roles), roles = knownRoles(session.roles);
    const roleLabel = role ? t(ROLE_INFO[role].label) : t("No role");
    return <Menu.Root>
      <Menu.Trigger className="account-trigger" aria-label={`${t("Account")}: ${t(name)}, ${roleLabel}`} data-account-menu="">
        <Avatar name={name} role={role} />
        <span className="hidden min-w-0 text-left leading-tight md:block">
          <span className="block max-w-[9.5rem] truncate text-[13px] font-semibold">{t(name)}</span>
          <span className="block text-[11.5px] font-semibold" data-role={role ? ROLE_INFO[role].tone : "auditor"} style={{ color: "rgb(var(--role))" }}>{roleLabel}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className="hidden text-muted md:block" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} collisionPadding={8} className="float menu no-print">
          <div className="flex items-center gap-3 px-2.5 pb-2 pt-2">
            <Avatar name={name} role={role} className="!h-10 !w-10 !text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{t(name)}</p>
              {session.username && session.username !== name && <p className="truncate text-xs text-muted">{session.username}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5">{roles.length > 0 ? roles.map(item => <RoleChip key={item} role={item} />) : <span className="text-xs text-muted">{t("No role that AEGIS recognises")}</span>}</div>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 border-t border-stroke px-2.5 py-2.5 text-xs">
            {session.agencyId && <><dt className="text-muted">{t("Agency")}</dt><dd><RecordRef id={session.agencyId} /></dd></>}
            {session.departmentId && <><dt className="text-muted">{t("Department")}</dt><dd className="font-semibold" title={session.departmentId}>{t(codeLabel(session.departmentId))}</dd></>}
            {session.teamId && <><dt className="text-muted">{t("Response team")}</dt><dd className="font-semibold" title={session.teamId}>{responseTeamLabel(session.teamId) ?? t("Unknown team")}</dd></>}
            {session.subject && <><dt className="text-muted">{t("Account id")}</dt><dd><RecordRef id={session.subject} /></dd></>}
            {left && <><dt className="text-muted">{t("Session ends in")}</dt><dd className="tnum font-semibold">{left}</dd></>}
          </dl>
          <div className="menu-sep" role="separator" />
          <Menu.Item asChild><Link href="/admin/users" className="menu-item"><KeyRound size={16} aria-hidden="true" className="text-muted" />{t("Users and access")}</Link></Menu.Item>
          <Menu.Item asChild><Link href="/about" className="menu-item"><Info size={16} aria-hidden="true" className="text-muted" />{t("About AEGIS")}</Link></Menu.Item>
          <div className="menu-sep" role="separator" />
          <Menu.Item className="menu-item" data-danger="" disabled={busy} onSelect={event => { event.preventDefault(); void signOut(); }} aria-label={t("Sign out of operator session")}>
            <LogOut size={16} aria-hidden="true" />{busy ? t("Signing out…") : t("Sign out")}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>;
  }
  if (!session.configured) return <span className="hidden text-xs text-amber-700 dark:text-amber-300 md:inline" title={t("Operator access requires a configured trusted identity provider")}>{t("SSO not configured")}</span>;
  // Icon-only below sm so the top bar fits a phone; the link keeps its full accessible name.
  return <a className="control control-icon sm:w-auto sm:px-3" href="/sign-in" aria-label="Operator sign in" title="Operator sign in"><LogIn size={16} aria-hidden="true"/><span className="hidden sm:inline">{t("Operator sign in")}</span></a>;
}
