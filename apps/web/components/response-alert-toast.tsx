"use client";
// One toast when the menu count for team requests rises. It must sit inside the page's ToastProvider (AppShell mounts
// it). No sound, no browser Notification API, no push: the toast is the shell's one polite live region.
import { useEffect, useRef } from "react";
import { useT } from "./language-provider";
import { useToast } from "./ui";
import type { AlertView } from "../lib/response-ui";

export function ResponseAlertToast({ view, rose }: Readonly<{ view: AlertView | null; rose: number }>) {
  const t = useT();
  const { notify } = useToast();
  const seen = useRef(rose);
  useEffect(() => {
    if (rose === seen.current) return;
    seen.current = rose;
    if (view) notify(view === "team" ? t("New request for your team") : t("Something needs your desk"), "warning");
  }, [rose, view, notify, t]);
  return null;
}
