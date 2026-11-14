"use client";

import Link from "next/link";
import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Ban, ChevronDown, ChevronRight, CircleHelp, Eye, FlaskConical, MousePointerClick, type LucideIcon } from "lucide-react";
import { useT } from "../language-provider";
import { StatusPill } from "./status";
import { ChainMarker } from "./identity";
import type { ChainStep } from "../../lib/navigation";
import { PAGE_HELP_HEADINGS, type PageHelp as PageHelpText } from "../../lib/page-help";

export interface Crumb { label: string; href?: string }

/**
 * Page title block. Text props are rendered verbatim: pass already-translated text from the caller. AppShell already renders one
 * PageHeader (level 1) from its title/description; use level={2} for any further header inside a page.
 * `eyebrow` is the menu group the page belongs to; `chain` marks its step in the six-step alert chain.
 */
export function PageHeader({ eyebrow, chain, title, description, actions, breadcrumbs, exercise = false, chip, level = 1, className = "" }: Readonly<{
  eyebrow?: string; chain?: ChainStep; title: string; description?: string; actions?: ReactNode; breadcrumbs?: readonly Crumb[]; exercise?: boolean; chip?: ReactNode; level?: 1 | 2; className?: string;
}>) {
  const t = useT();
  const Heading = level === 1 ? "h1" : "h2";
  return <header data-tour={level === 1 ? "page-header" : undefined} className={`mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${level === 1 ? "pb-1" : "border-b border-stroke pb-4"} ${className}`}>
    <div className="min-w-0">
      {breadcrumbs && breadcrumbs.length > 0 && <nav aria-label={t("Breadcrumb")} className="mb-2 no-print">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
          {breadcrumbs.map((crumb, index) => {
            const last = index === breadcrumbs.length - 1;
            return <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
              {crumb.href && !last ? <Link href={crumb.href} className="rounded underline-offset-2 hover:text-ink hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">{crumb.label}</Link> : <span aria-current={last ? "page" : undefined} className={last ? "font-semibold text-ink" : ""}>{crumb.label}</span>}
              {!last && <ChevronRight size={12} aria-hidden="true" />}
            </li>;
          })}
        </ol>
      </nav>}
      {(eyebrow || chain) && <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {eyebrow && !(breadcrumbs && breadcrumbs.length > 0) && <span className="eyebrow">{eyebrow}</span>}
        {chain && <ChainMarker step={chain} />}
      </div>}
      <Heading className={level === 1 ? "t-display" : "text-lg font-semibold tracking-tight"}>{title}</Heading>
      {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{description}</p>}
    </div>
    {(exercise || chip || actions) && <div className="page-actions flex flex-wrap items-center gap-2">
      {exercise && <StatusPill tone="sample" icon={FlaskConical}>{t("Exercise data")}</StatusPill>}
      {chip}
      {actions}
    </div>}
  </header>;
}

/**
 * "How this page works": one collapsed block with the same three parts on every page (what it shows, what you can do
 * here, what it will never do). AppShell renders it from lib/page-help.ts; text is translated here.
 */
export function PageHelp({ help, defaultOpen = false, action }: Readonly<{ help: PageHelpText; defaultOpen?: boolean; /** Sits at the end of the toggle row (the "Take the tour" button). Already translated by the caller. */ action?: ReactNode }>) {
  const t = useT();
  const parts: { key: keyof PageHelpText; icon: LucideIcon }[] = [{ key: "shows", icon: Eye }, { key: "can", icon: MousePointerClick }, { key: "never", icon: Ban }];
  return <Collapsible.Root defaultOpen={defaultOpen} className="page-help" data-tour="page-help">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <Collapsible.Trigger className="page-help-toggle"><CircleHelp size={15} aria-hidden="true" />{t("How this page works")}<ChevronDown size={14} aria-hidden="true" className="transition-transform" /></Collapsible.Trigger>
      {action}
    </div>
    <Collapsible.Content>
      <dl className="page-help-body">{parts.map(({ key, icon: Icon }) => <div key={key}>
        <dt><Icon size={14} aria-hidden="true" className="text-muted" />{t(PAGE_HELP_HEADINGS[key])}</dt>
        <dd>{t(help[key])}</dd>
      </div>)}</dl>
    </Collapsible.Content>
  </Collapsible.Root>;
}

/**
 * Titled section card with a padded body. Text props are rendered verbatim (caller translates).
 * Pass `bodyClassName="p-0"` when the body is a table or a full-bleed list. With `collapsible` the heading holds a
 * button (aria-expanded/aria-controls) and the closed body is hidden, so it is neither visible nor focusable.
 */
export function Panel({ title, titleId, description, icon: Icon, actions, collapsible = false, defaultOpen = true, level = 2, id, className = "", bodyClassName, as: Tag = "section", children, ...rest }: Readonly<{
  title?: ReactNode; titleId?: string; description?: string; icon?: LucideIcon; actions?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; level?: 2 | 3;
  id?: string; className?: string; bodyClassName?: string; as?: "section" | "div" | "aside" | "article"; children: ReactNode;
}> & Omit<HTMLAttributes<HTMLElement>, "title" | "children" | "className" | "id">) {
  const generated = useId();
  const bodyId = `${id ?? generated}-body`;
  const [open, setOpen] = useState(defaultOpen);
  const Heading = level === 2 ? "h2" : "h3";
  const label = <>{Icon && <Icon size={16} aria-hidden="true" className="shrink-0 text-muted" />}<span>{title}</span></>;
  return <Tag id={id} className={`panel ${className}`} {...rest}>
    {(title || actions) && <div className={`panel-heading ${collapsible && !open ? "border-b-0" : ""}`}>
      <div className="min-w-0">
        {title && <Heading id={titleId} className="t-title">
          {collapsible
            ? <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)} className="inline-flex min-h-8 items-center gap-2 rounded-md text-left hover:text-accent">
                {label}<ChevronDown size={14} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} /></button>
            : <span className="inline-flex items-center gap-2">{label}</span>}
        </Heading>}
        {description && <p className="helper mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>}
    <div id={bodyId} hidden={collapsible && !open} className={bodyClassName ?? "panel-body"}>{children}</div>
  </Tag>;
}

/** The row of filters and actions above a list or table. One per view; primary action last. */
export function Toolbar({ label, children, className = "" }: Readonly<{ label: string; children: ReactNode; className?: string }>) {
  return <div role="toolbar" aria-label={label} className={`mb-4 flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

/** A compact one-line row for a section that has nothing to show, so empty sections do not each take a full card. */
export function QuietRow({ icon: Icon, title, note, tone = "muted" }: Readonly<{ icon?: LucideIcon; title: string; note: string; tone?: "muted" | "warning" }>) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
    {Icon && <Icon size={15} aria-hidden="true" className="shrink-0 text-muted" />}
    <span className="font-semibold">{title}</span>
    <span className={tone === "warning" ? "text-amber-800 dark:text-amber-300" : "text-muted"}>{note}</span>
  </div>;
}
