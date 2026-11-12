"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";

export type ButtonVariant = "secondary" | "primary" | "quiet" | "danger";
export type ButtonSize = "md" | "sm";

const VARIANT: Record<ButtonVariant, string> = { secondary: "", primary: "control-primary", quiet: "control-quiet", danger: "control-danger" };
/** Class string for a button-like element (a link styled as a button, for example). */
export function buttonClass({ variant = "secondary", size = "md", iconOnly = false, className = "" }: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; className?: string } = {}): string {
  return ["control", VARIANT[variant], size === "sm" ? "control-sm" : "", iconOnly ? "control-icon" : "", className].filter(Boolean).join(" ");
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; loading?: boolean; className?: string };

/**
 * The one button. Variants: secondary (default), primary (one per view), quiet, danger. Sizes: md, sm.
 * `loading` shows a spinner, sets aria-busy and blocks further clicks. Text is already translated by the caller.
 */
export function Button({ variant, size, icon: Icon, loading = false, className, children, disabled, type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  const iconSize = size === "sm" ? 14 : 16;
  return <button type={type} className={buttonClass({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading || undefined} {...rest}>
    {loading ? <LoaderCircle size={iconSize} aria-hidden="true" className="spin" /> : Icon ? <Icon size={iconSize} aria-hidden="true" /> : null}{children}</button>;
}

/** Square icon-only button. `label` is the accessible name and the hover title (already translated). */
export function IconButton({ label, icon: Icon, variant, size, loading = false, className, disabled, type = "button", ...rest }: Common & { label: string; icon: LucideIcon } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const iconSize = size === "sm" ? 15 : 18;
  return <button type={type} aria-label={label} title={label} className={buttonClass({ variant, size, iconOnly: true, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
    {loading ? <LoaderCircle size={iconSize} aria-hidden="true" className="spin" /> : <Icon size={iconSize} aria-hidden="true" />}</button>;
}

/** A link that looks like a button. In-app paths use the router; anything else is a plain anchor. */
export function ButtonLink({ href, variant, size, icon: Icon, className, children, external = false }: Common & { href: string; children: ReactNode; external?: boolean }) {
  const body = <>{Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" />}{children}</>;
  const classes = buttonClass({ variant, size, className });
  return external || !href.startsWith("/") || href.startsWith("/api/")
    ? <a href={href} className={classes}>{body}</a>
    : <Link href={href} className={classes}>{body}</Link>;
}
