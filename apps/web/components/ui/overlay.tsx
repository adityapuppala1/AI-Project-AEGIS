"use client";

import type { ReactElement, ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useT } from "../language-provider";

/** Mount once near the root so tooltips share one delay. */
export function TipProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={400}>{children}</TooltipPrimitive.Provider>;
}

/**
 * Tooltip for an icon-only control or a shortened value. The trigger must be focusable and must already have its own
 * accessible name: the tooltip is a visual aid, never the only label. `text` is already translated.
 */
export function Tip({ text, side = "top", children, disabled = false }: Readonly<{ text: ReactNode; side?: "top" | "right" | "bottom" | "left"; children: ReactElement; disabled?: boolean }>) {
  if (disabled || !text) return children;
  return <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal><TooltipPrimitive.Content side={side} sideOffset={8} collisionPadding={8} className="float tip no-print">{text}</TooltipPrimitive.Content></TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>;
}

/**
 * Modal dialog (focus trapped, Escape closes, focus returns). `title` and `description` are already translated.
 * Put the actions in `footer`, the safest one first.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, dismissible = true }: Readonly<{
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode; dismissible?: boolean;
}>) {
  const t = useT();
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay no-print" />
      <DialogPrimitive.Content className="float dialog no-print"
        onInteractOutside={event => { if (!dismissible) event.preventDefault(); }} onEscapeKeyDown={event => { if (!dismissible) event.preventDefault(); }}>
        <div className="flex items-start justify-between gap-3">
          <DialogPrimitive.Title className="t-title text-base">{title}</DialogPrimitive.Title>
          {dismissible && <DialogPrimitive.Close className="control control-quiet control-sm control-icon -mr-2 -mt-1" aria-label={t("Close")}><X size={16} aria-hidden="true" /></DialogPrimitive.Close>}
        </div>
        {description
          ? <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted">{description}</DialogPrimitive.Description>
          : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        {children && <div className="mt-3">{children}</div>}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
