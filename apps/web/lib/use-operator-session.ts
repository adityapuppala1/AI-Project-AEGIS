"use client";
import { useEffect, useState } from "react";

export interface SessionInfo { authenticated: boolean; configured: boolean; roles: string[] }
/** Reads the BFF session summary (never a token). `null` while loading. */
export function useOperatorSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(response => response.json())
      .then((value: { authenticated?: boolean; configured?: boolean; roles?: unknown }) => setSession({
        authenticated: value.authenticated === true, configured: value.configured === true,
        roles: Array.isArray(value.roles) ? value.roles.filter((role): role is string => typeof role === "string") : [],
      }))
      .catch(() => { if (!controller.signal.aborted) setSession({ authenticated: false, configured: false, roles: [] }); });
    return () => controller.abort();
  }, []);
  return session;
}
