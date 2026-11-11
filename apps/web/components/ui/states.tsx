"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Inbox, Lock, RefreshCw, ShieldAlert, type LucideIcon } from "lucide-react";
import { ROLE_INFO, knownRoles, type RoleId } from "../../lib/roles";
import { RoleChip } from "./identity";
import { useT } from "../language-provider";

/** Guided empty state. `title`, `body` and action labels must already be translated. */
export function EmptyState({ icon: Icon = Inbox, title, body, actions, className = "" }: Readonly<{
  icon?: LucideIcon; title: string; body?: ReactNode; actions?: ReactNode; className?: string;
}>) {
  return <div className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${className}`}>
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-muted"><Icon size={22} aria-hidden="true" /></span>
    <p className="text-sm font-bold">{title}</p>
    {body && <p className="max-w-md text-xs leading-5 text-muted">{body}</p>}
    {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
  </div>;
}

/** Error with an optional Retry button; announced immediately via role=alert. `message` is already translated. */
export function ErrorState({ message, title, onRetry, icon: Icon = ShieldAlert, className = "" }: Readonly<{
  message: ReactNode; title?: string; onRetry?: () => void; icon?: LucideIcon; className?: string;
}>) {
  const t = useT();
  return <div role="alert" className={`flex flex-wrap items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 ${className}`}>
    <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-rose-700 dark:text-rose-300" />
    <div className="min-w-0 flex-1">
      {title && <p className="text-sm font-bold text-rose-800 dark:text-rose-200">{title}</p>}
      <p className="text-sm text-rose-800 dark:text-rose-200">{message}</p>
    </div>
    {onRetry && <button type="button" className="control control-sm" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />{t("Retry")}</button>}
  </div>;
}

/**
 * The one permission state, for a 401 or 403 answer. It says what the page needs, which role you hold and where to
 * go instead. There is no Retry: asking again with the same role gives the same answer. "needs" lists the roles that
 * can use the page (from lib/roles.ts); "roles" is the signed-in person's roles. Never the control, only the explanation.
 */
export function PermissionState({ needs, roles, what, where, className = "" }: Readonly<{
  needs: readonly RoleId[]; roles: readonly string[] | null | undefined; what?: string; where?: { href: string; label: string }; className?: string;
}>) {
  const t = useT();
  const held = knownRoles(roles);
  return <div role="status" className={`panel flex flex-wrap items-start gap-4 p-5 ${className}`}>
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-elevated text-muted"><Lock size={18} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1 space-y-3">
      <div>
        <p className="t-title">{t("Your role cannot open this")}</p>
        {what && <p className="mt-1 text-sm text-muted">{what}</p>}
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-xs font-semibold text-muted">{t("It needs")}</dt>
        <dd className="flex flex-wrap gap-1.5">{needs.map(role => <RoleChip key={role} role={role} />)}</dd>
        <dt className="text-xs font-semibold text-muted">{t("You are signed in as")}</dt>
        <dd className="flex flex-wrap gap-1.5">{held.length > 0 ? held.map(role => <RoleChip key={role} role={role} />) : <span className="text-muted">{t("No role that AEGIS recognises")}</span>}</dd>
      </dl>
      <p className="helper">{t("Roles are given in your agency's identity provider, not in AEGIS. Ask your administrator if you need a different one.")}{needs.length === 1 ? " " + t(ROLE_INFO[needs[0]].summary) : ""}</p>
      <div className="flex flex-wrap gap-2">
        {where && <Link href={where.href} className="control control-sm">{where.label}</Link>}
        <Link href="/admin/users" className="control control-quiet control-sm">{t("See what each role can do")}</Link>
      </div>
    </div>
  </div>;
}

/** One shimmering placeholder block (decorative; hide from AT). Size it with Tailwind classes. */
export function Skeleton({ className = "h-4 w-full" }: Readonly<{ className?: string }>) {
  return <div aria-hidden="true" className={`shimmer ${className}`} />;
}

/** Wrapper that marks a loading region: role=status, aria-busy and a single screen-reader label. */
export function SkeletonRegion({ label, children, className = "" }: Readonly<{ label?: string; children: ReactNode; className?: string }>) {
  const t = useT();
  return <div role="status" aria-busy="true" className={className}><span className="sr-only">{label ?? t("Loading…")}</span><div aria-hidden="true">{children}</div></div>;
}

/** List/table placeholder rows: avatar block plus two text lines each. */
export function SkeletonRows({ rows = 5, label, className = "" }: Readonly<{ rows?: number; label?: string; className?: string }>) {
  return <SkeletonRegion label={label} className={className}>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="flex items-center gap-3 py-3">
      <Skeleton className="h-9 w-9" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-2 w-1/2" /></div></div>)}
  </SkeletonRegion>;
}

/** Card-grid placeholder matching StatStrip proportions. */
export function SkeletonCards({ count = 4, label, className = "" }: Readonly<{ count?: number; label?: string; className?: string }>) {
  return <SkeletonRegion label={label} className={className}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: count }, (_, i) => <div key={i} className="panel p-4"><Skeleton className="h-3 w-16" /><Skeleton className="mt-3 h-8 w-12" /><Skeleton className="mt-3 h-1.5 w-full" /></div>)}
    </div>
  </SkeletonRegion>;
}
