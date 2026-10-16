"use client";
import { useEffect, useState } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";

interface Session {
  authenticated: boolean;
  configured: boolean;
  subject?: string;
  roles?: string[];
}
export function OperatorAuth() {
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
    <button type="button" onClick={signOut} disabled={busy} className="control h-9 text-xs" aria-label="Sign out of operator session"><LogOut size={15}/>Sign out</button>
  </div>;
  if (!session.configured) return <span className="hidden text-xs text-amber-600 dark:text-amber-300 md:inline" title="Operator access requires a configured trusted identity provider">SSO not configured</span>;
  return <a className="control h-9 text-xs" href="/api/auth/login"><LogIn size={15}/>Operator sign in</a>;
}
