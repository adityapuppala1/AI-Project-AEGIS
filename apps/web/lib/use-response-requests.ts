"use client";
// Loads the team requests the signed-in role may read, and keeps them fresh: every 30 seconds while the tab is
// visible, when the tab becomes visible again, and whenever a screen calls refresh() after a write. No sound, no
// browser notification, no push. Old data stays on screen if a refresh fails, with the failure reported beside it.
import { useCallback, useEffect, useRef, useState } from "react";
import { listRequests } from "./response-client";
import type { ResponseRequest } from "./response-ui";

export const POLL_MS = 30_000;
export type RequestsStatus = "idle" | "loading" | "ready" | "refused" | "error";

export function useResponseRequests({ enabled, incidentId, poll = true }: { enabled: boolean; incidentId?: string; poll?: boolean }) {
  const [requests, setRequests] = useState<ResponseRequest[]>([]);
  const [status, setStatus] = useState<RequestsStatus>("idle");
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    controller.current?.abort();
    const mine = ++sequence.current, abort = new AbortController();
    controller.current = abort;
    setRefreshing(true);
    const result = await listRequests(incidentId, abort.signal);
    if (mine !== sequence.current || result.status === -1) return; // a newer refresh owns the screen
    setRefreshing(false);
    if (result.ok && result.data) { setRequests(result.data); setStatus("ready"); setMessage(""); setUpdatedAt(new Date()); }
    else if (result.status === 403) { setRequests([]); setStatus("refused"); setMessage(result.message); }
    else { setMessage(result.message); setStatus(current => current === "ready" ? "ready" : "error"); }
  }, [enabled, incidentId]);

  useEffect(() => {
    if (!enabled) { setStatus("idle"); return; }
    setStatus(current => current === "ready" ? current : "loading");
    void refresh();
    if (!poll) return () => { controller.current?.abort(); sequence.current += 1; };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); controller.current?.abort(); sequence.current += 1; };
  }, [enabled, poll, refresh]);

  /** True when the last refresh failed but earlier data is still shown. */
  const stale = status === "ready" && message !== "";
  return { requests, status, message, updatedAt, refreshing, refresh, stale };
}
