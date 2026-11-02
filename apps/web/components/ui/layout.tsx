"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FlaskConical, type LucideIcon } from "lucide-react";
import { useT } from "../language-provider";
import { StatusPill } from "./status";

export interface Crumb { label: string; href?: string }

/**
 * Page title block. Text props are rendered verbatim: pass already-translated text from the caller. AppShell already renders one
 * PageHeader (level 1) from its title/description; use level={2} for any further header inside a page.
 */
export function PageHeader({ eyebrow, title, description, actions, breadcrumbs, exercise = false, chip, level = 1, className = "" }: Readonly<{
  eyebrow?: string; title: string; description?: string; actions?: ReactNode; breadcrumbs?: readonly Crumb[]; exercise?: boolean; chip?: ReactNode; level?: 1 | 2; className?: string;
}>) {
  const t = useT();
  const Heading = level === 1 ? "h1" : "h2";
  return <header className={`mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-stroke pb-5 ${className}`}>
    <div className="min-w-0">
      {breadcrumbs && breadcrumbs.length > 0 && <nav aria-label={t("Breadcrumb")} className="mb-2">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
          {breadcrumbs.map((crumb, index) => {
            const last = index === breadcrumbs.length - 1;
            return <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
              {crumb.href && !last ? <Link href={crumb.href} className="rounded underline-offset-2 hover:text-ink hover:underline">{crumb.label}</Link> : <span aria-current={last ? "page" : undefined} className={last ? "font-semibold text-ink" : ""}>{crumb.label}</span>}
              {!last && <ChevronRight size={12} aria-hidden="true" />}
            </li>;
          })}
        </ol>
      </nav>}
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <Heading className={level === 1 ? "text-2xl font-bold tracking-tight sm:text-3xl" : "text-xl font-bold tracking-tight"}>{title}</Heading>
      {description && <p className="mt-2 max-w-3xl text-sm text-muted">{description}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {exercise && <StatusPill tone="sample" icon={FlaskConical}>{t("Exercise data")}</StatusPill>}
      {chip}
      {actions}
    </div>
  </header>;
}

/**
 * Titled section card. Text props are rendered verbatim (caller translates). With `collapsible` the heading holds a
 * button (aria-expanded/aria-controls) and the closed body is `hidden`, so it is neither visible nor focusable.
 */
export function Panel({ title, description, icon: Icon, actions, collapsible = false, defaultOpen = true, level = 2, id, className = "", bodyClassName = "", children }: Readonly<{
  title?: string; description?: string; icon?: LucideIcon; actions?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; level?: 2 | 3;
  id?: string; className?: string; bodyClassName?: string; children: ReactNode;
}>) {
  const generated = useId();
  const bodyId = `${id ?? generated}-body`;
  const [open, setOpen] = useState(defaultOpen);
  const Heading = level === 2 ? "h2" : "h3";
  const label = <>{Icon && <Icon size={16} aria-hidden="true" className="shrink-0 text-muted" />}<span>{title}</span></>;
  return <section id={id} className={`panel ${className}`}>
    {(title || actions) && <div className="panel-heading">
      <div className="min-w-0">
        {title && <Heading className="text-sm font-bold">
          {collapsible
            ? <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)} className="inline-flex min-h-9 items-center gap-2 rounded-md text-left hover:text-accent">
                {label}<ChevronDown size={14} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} /></button>
            : <span className="inline-flex items-center gap-2">{label}</span>}
        </Heading>}
        {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>}
    <div id={bodyId} hidden={collapsible && !open} className={bodyClassName}>{children}</div>
  </section>;
}
