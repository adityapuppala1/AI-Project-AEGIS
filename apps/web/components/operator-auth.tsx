"use client";
import { useEffect, useState } from "react";
import { useT } from "./language-provider";
import { clearExerciseDraftRecovery } from "../lib/exercise-draft-buffer";
import { StatusPill } from "./ui";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";

interface Session {
  authenticated: boolean;
  configured: boolean;
  subject?: string;
  roles?: string[];
}
export function OperatorAuth() {
  const t = useT();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((value) => { if (active) setSession(value); })
      .catch(() => { if (active) setSession({ authenticated: false, configured: false }); });
    return () => { active = false; };
  }, []);
  async function signOut() {
    setBusy(true);
    clearExerciseDraftRecovery();
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not sign out");
      window.location.assign("/");
    } catch { setBusy(false); }
  }
  if (!session) return <span className="text-xs text-muted" aria-live="polite">Checking operator session...</span>;
  if (session.authenticated) return <div className="flex items-center gap-2">
    <span className="hidden max-w-[160px] truncate text-xs text-muted xl:inline" title={session.subject}>
      <ShieldCheck size={14} className="mr-1 inline text-accent"/>{session.subject}
    </span>
    {(session.roles ?? []).slice(0, 3).map(role => <span key={role} className="hidden xl:inline"><StatusPill tone="info">{role.replaceAll("_", " ")}</StatusPill></span>)}
    <button type="button" onClick={signOut} disabled={busy} className="control h-9 text-xs" aria-label="Sign out of operator session"><LogOut size={15}/><span className="hidden sm:inline">Sign out</span></button>
  </div>;
  if (!session.configured) return <span className="hidden text-xs text-amber-700 dark:text-amber-300 md:inline" title={t("Operator access requires a configured trusted identity provider")}>{t("SSO not configured")}</span>;
  return <a className="control h-9 text-xs" href="/api/auth/login"><LogIn size={15}/>Operator sign in</a>;
}
