"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass, Button, IconButton } from "./ui";
import { usePathname } from "next/navigation";
import { Clock, LogIn, X } from "lucide-react";
import { useT } from "./language-provider";
import { Dialog, TipProvider } from "./ui/overlay";
import { SessionContext, cleanSession, type SessionInfo } from "../lib/use-operator-session";

const PUBLIC = new Set(["/", "/welcome", "/sign-in"]);
const WARN_MS = 2 * 60_000;
const MAX_TIMER = 2_000_000_000;

/** Where "Sign in again" goes: the sign-in page, which returns the person to the page they were on. */
export function signInAgainUrl(pathname: string): string {
  const safe = /^(\/[A-Za-z0-9-]+)+$/.test(pathname) && pathname.length <= 120 ? pathname : "";
  return "/sign-in?" + (safe ? "next=" + encodeURIComponent(safe) + "&" : "") + "expired=1";
}

/**
 * The one place that knows the session. It reads /api/auth/session once for every page, watches each request the app
 * makes for the gate's "sign-in required" answer, warns two minutes before the session ends and shows one
 * "Your session ended" dialog when it has. It only observes: every route still does its own check.
 */
export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [ended, setEnded] = useState(false);
  const [warning, setWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [stayed, setStayed] = useState(false);
  const wasSignedIn = useRef(false);
  const quiet = useRef(false);
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(response => response.json())
      .then(value => { const next = cleanSession(value); wasSignedIn.current = next.authenticated; setSession(next); })
      .catch(() => { if (!controller.signal.aborted) setSession({ authenticated: false, configured: false, roles: [] }); });
    return () => controller.abort();
  }, []);

  // Every request the app makes passes through here, so a session that ends mid-task is noticed on any page.
  useEffect(() => {
    const original = window.fetch;
    const watched: typeof window.fetch = async (...args) => {
      const response = await original(...args);
      if (response.status === 401 && (wasSignedIn.current || !PUBLIC.has(path.current))) {
        response.clone().json().then((body: unknown) => {
          if (typeof body === "object" && body !== null && (body as { code?: unknown }).code === "SIGN_IN_REQUIRED" && !quiet.current) setEnded(true);
        }).catch(() => undefined);
      }
      return response;
    };
    window.fetch = watched;
    return () => { if (window.fetch === watched) window.fetch = original; };
  }, []);

  const expiresAt = session?.authenticated ? session.expiresAt : undefined;
  useEffect(() => {
    if (!expiresAt) return;
    const left = expiresAt - Date.now();
    if (left <= 0) { setEnded(true); return; }
    if (left <= WARN_MS) setWarning(true);
    const warn = left > WARN_MS ? setTimeout(() => setWarning(true), Math.min(left - WARN_MS, MAX_TIMER)) : undefined;
    const end = setTimeout(() => setEnded(true), Math.min(left, MAX_TIMER));
    return () => { if (warn) clearTimeout(warn); clearTimeout(end); };
  }, [expiresAt]);

  const stay = () => { quiet.current = true; setStayed(true); setEnded(false); };
  const again = signInAgainUrl(pathname);
  return <SessionContext.Provider value={session}>
    <TipProvider>{children}</TipProvider>
    {(stayed || (warning && !ended && !dismissed)) && <div role="status" className="float session-notice no-print">
      <Clock size={16} aria-hidden="true" className="shrink-0 text-amber-700 dark:text-amber-300" />
      <span>{stayed ? t("Your session ended. This page can no longer load or save anything.") : t("Your session ends in about two minutes. Finish or copy what you are writing.")}</span>
      <a className={buttonClass({ size: "sm" })} href={again}>{t("Sign in again")}</a>
      {!stayed && <IconButton variant="quiet" size="sm" icon={X} label={t("Dismiss")} onClick={() => setDismissed(true)}/>}
    </div>}
    <Dialog open={ended} onOpenChange={open => { if (!open) stay(); }} title={t("Your session ended")}
      description={t("For safety IndTrana signs you out after a while. Sign in again and you will come back to this page. Anything you typed but did not save stays on this page until you leave it, so copy it first if you need it.")}
      footer={<>
        <Button variant="quiet" type="button"  onClick={stay}>{t("Stay on this page")}</Button>
        <a className={buttonClass({ variant: "primary" })} href={again}><LogIn size={16} aria-hidden="true" />{t("Sign in again")}</a>
      </>} />
  </SessionContext.Provider>;
}
