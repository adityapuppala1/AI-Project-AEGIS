"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Ban, Check, CircleHelp, Copy } from "lucide-react";
import { useT } from "../language-provider";
import { type StepStatus } from "./helpers";

export interface Step { id: string; label: string; description?: string; status: StepStatus }

/**
 * Horizontal connected stepper (ordered list). Status is conveyed by icon and a screen-reader word, not colour alone;
 * the current step gets aria-current="step" and a pulse (motion-safe). Labels are already translated.
 */
export function Stepper({ steps, label, className = "" }: Readonly<{ steps: readonly Step[]; label: string; className?: string }>) {
  const t = useT();
  return <ol aria-label={label} className={`flex w-full items-start ${className}`}>
    {steps.map((step, index) => {
      const done = step.status === "done"; const current = step.status === "current"; const blocked = step.status === "blocked";
      const circle = done ? "border-emerald-600 bg-emerald-600 text-white" : blocked ? "border-rose-600 bg-rose-600 text-white" : current ? "step-pulse border-accent bg-accent/10 text-accent" : "border-stroke bg-surface text-muted";
      return <li key={step.id} aria-current={current ? "step" : undefined} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
        {index > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${steps[index - 1].status === "done" ? "bg-emerald-600" : "bg-stroke"}`} />}
        <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${circle}`}>
          {done ? <Check size={16} aria-hidden="true" /> : blocked ? <Ban size={14} aria-hidden="true" /> : index + 1}</span>
        <span className="mt-2 text-xs font-semibold">{step.label}<span className="sr-only"> — {t(step.status)}</span></span>
        {step.description && <span className="mt-0.5 text-[11px] text-muted">{step.description}</span>}
      </li>;
    })}
  </ol>;
}

/** Definition list of label/value rows. Labels and values are already translated by the caller. */
export function KeyValueList({ items, className = "" }: Readonly<{ items: readonly { label: string; value: ReactNode }[]; className?: string }>) {
  return <dl className={`grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 text-sm ${className}`}>
    {items.map(item => <div key={item.label} className="contents"><dt className="text-xs font-semibold text-muted">{item.label}</dt><dd className="min-w-0 break-words">{item.value}</dd></div>)}
  </dl>;
}

/** Copies `value` to the clipboard and confirms through an aria-live region ("Copied" or "Copy failed"). */
export function CopyButton({ value, label, className = "" }: Readonly<{ value: string; label?: string; className?: string }>) {
  const t = useT();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setState("copied"); } catch { setState("failed"); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  };
  return <span className={`inline-flex items-center gap-2 ${className}`}>
    <button type="button" className="control control-sm" onClick={copy}>
      {state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{label ?? t("Copy")}</button>
    <span aria-live="polite" className="text-xs text-muted">{state === "copied" ? t("Copied") : state === "failed" ? t("Copy failed") : ""}</span>
  </span>;
}

/**
 * Small help button opening a popover (Radix: Escape or an outside click closes it and focus returns to the button).
 * "label" is the accessible name of the button (already translated); children are the help text.
 */
export function InlineHelp({ label, children, className = "" }: Readonly<{ label: string; children: ReactNode; className?: string }>) {
  return <Popover.Root>
    <Popover.Trigger aria-label={label} className={"inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-elevated hover:text-ink " + className}><CircleHelp size={16} aria-hidden="true" /></Popover.Trigger>
    <Popover.Portal><Popover.Content role="note" align="start" sideOffset={6} collisionPadding={8} className="float w-72 max-w-[80vw] p-3 text-xs leading-5">{children}</Popover.Content></Popover.Portal>
  </Popover.Root>;
}
