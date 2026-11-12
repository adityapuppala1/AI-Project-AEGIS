"use client";
// The menu count for response teams and department desks (GET /api/response/alerts). Polled every 30 seconds only
// while the tab is visible and only for those two roles. It reports a rise so the shell can announce it politely and
// show one toast. No sound, no browser Notification API, no push: an alert is a number on a menu entry.
import { useEffect, useState } from "react";
import { loadAlertCount } from "./response-client";
import { alertView, type AlertView } from "./response-ui";
import { POLL_MS } from "./use-response-requests";

// Every page mounts its own shell, so the last count seen is kept here: a rise that happens while the person moves
// between pages is still noticed, and the first reading of a fresh page load is never announced as news.
let lastSeen: number | null = null;

export function useResponseAlerts(roles: readonly string[] | null | undefined): { view: AlertView | null; count: number | null; rose: number } {
  const view = alertView(roles);
  const [count, setCount] = useState<number | null>(null);
  const [rose, setRose] = useState(0);
  useEffect(() => {
    if (!view) { setCount(null); return; }
    let live = true;
    const abort = new AbortController();
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await loadAlertCount(abort.signal);
      if (!live || !result.ok || result.data === undefined) return; // keep the last number rather than show a false zero
      const next = result.data;
      if (lastSeen !== null && next > lastSeen) setRose(value => value + 1);
      lastSeen = next;
      setCount(next);
    };
    void read();
    const timer = window.setInterval(() => void read(), POLL_MS);
    const onVisible = () => void read();
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; abort.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [view]);
  return { view, count, rose };
}
