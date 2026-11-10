"use client";

// AEGIS operator sign-in. This page never collects a password: the button starts the OpenID Connect flow
// (/api/auth/login), and the operator authenticates on the organisation's identity provider. The 3D picture is
// decoration only; it is drawn still for reduced-motion users and replaced by a plain shape when WebGL is unavailable.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@fontsource-variable/anek-latin/wdth.css";
import { ArrowLeft, ArrowRight, Command, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, TimerReset, TriangleAlert } from "lucide-react";
import { startSignInScene, type SignInPhase } from "./sign-in-scene";
import "./sign-in.css";

type Session = { authenticated: boolean; configured: boolean; subject?: string; roles?: string[] };

const PATH = ["Leave for your identity provider", "Password and second factor there", "Return with a signed role"];
const FACTS = [
  { icon: KeyRound, title: "Your password never reaches AEGIS", text: "You type it only on your organisation's identity provider, which is also where multi-factor sign-in is set up." },
  { icon: Fingerprint, title: "Verified hand-back", text: "AEGIS checks the provider's signature, the one-time state and nonce, and a PKCE proof before it trusts the sign-in." },
  { icon: ShieldCheck, title: "Role and agency come from the signed token", text: "Nothing typed in the browser can grant a role. Maker and checker must be different people." },
  { icon: TimerReset, title: "Short, sealed session", text: "An encrypted, HTTP-only cookie that expires within 15 minutes and is cleared on sign-out." },
] as const;

export function SignInExperience({ failed }: Readonly<{ failed: boolean }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [phase, setPhase] = useState<SignInPhase | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stop = startSignInScene(canvas, window.matchMedia("(prefers-reduced-motion: reduce)").matches, setPhase);
    if (!stop) { setWebgl(false); return; }
    return stop;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(response => response.json())
      .then((value: Session) => { if (!controller.signal.aborted) setSession({ authenticated: value.authenticated === true, configured: value.configured === true, subject: typeof value.subject === "string" ? value.subject : undefined, roles: Array.isArray(value.roles) ? value.roles.filter((role): role is string => typeof role === "string") : [] }); })
      .catch(() => { if (!controller.signal.aborted) setSession({ authenticated: false, configured: false }); });
    return () => controller.abort();
  }, []);

  // Coming back with the browser's Back button must not leave the button stuck on "Opening".
  useEffect(() => {
    const reset = () => setLeaving(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const status = !session ? "checking" : session.authenticated ? "in" : session.configured ? "ready" : "off";

  return (
    <main className="si">
      <div className="si-visual">
        {webgl ? <canvas ref={canvasRef} aria-hidden="true" /> : <div className="si-fallback" aria-hidden="true" />}
        <div className="si-top">
          <Link href="/" className="si-mark" aria-label="AEGIS, back to the overview"><span><Command size={18} aria-hidden="true" /></span>AEGIS</Link>
          <Link href="/" className="si-back"><ArrowLeft size={16} aria-hidden="true" />What is AEGIS?</Link>
        </div>
        <p className="si-claim" aria-hidden="true">You sign in at your own organisation. AEGIS only receives the result.</p>
      </div>

      <section className="si-card si-head" aria-labelledby="sign-in-title">
        <p className="si-tag"><i aria-hidden="true" />Exercise only. Synthetic data.</p>
        <h1 id="sign-in-title">Operator sign-in</h1>
        <p className="si-lede">Sign in with your agency account. You will be taken to your organisation&rsquo;s identity provider and brought back here.</p>

        {failed && <p role="alert" className="si-alert"><TriangleAlert size={20} aria-hidden="true" /><span>That sign-in could not be verified, so nobody was signed in. Please try again.</span></p>}

        <div className="si-state" aria-live="polite">
          {status === "checking" && <p className="si-box si-wait">Checking the secure sign-in service…<span aria-hidden="true" /></p>}
          {status === "ready" && <>
            <a href="/api/auth/login" className="si-go" onClick={() => setLeaving(true)} aria-busy={leaving}>
              {leaving ? "Opening your identity provider…" : "Continue with agency sign-in"}
              {leaving ? <span className="si-spin" aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
            </a>
            <p className="si-hint"><LockKeyhole size={16} aria-hidden="true" />Secure sign-in service is ready.</p>
          </>}
          {status === "in" && <>
            <p className="si-box si-ok"><ShieldCheck size={20} aria-hidden="true" /><span>You are already signed in{session?.roles?.length ? " as " + session.roles.map(role => role.replaceAll("_", " ")).join(", ") : ""}.</span></p>
            <Link href="/approvals" className="si-go">Continue to the workbench<ArrowRight size={20} aria-hidden="true" /></Link>
          </>}
          {status === "off" && <>
            <p className="si-box si-warn"><TriangleAlert size={20} aria-hidden="true" /><span>Operator sign-in is not set up on this server yet. An administrator must connect an identity provider first.</span></p>
            <Link href="/" className="si-go si-quiet">Read what AEGIS is</Link>
          </>}
        </div>
      </section>

      <ol className="si-path" aria-label="What happens when you continue">
        {PATH.map((step, index) => <li key={step} data-on={phase === index || undefined}><b>{index + 1}</b><span>{step}</span></li>)}
      </ol>

      <section className="si-card si-more" aria-labelledby="sign-in-safe">
        <h2 id="sign-in-safe">How this sign-in is protected</h2>
        <ul className="si-facts">
          {FACTS.map(fact => <li key={fact.title}><span><fact.icon size={17} aria-hidden="true" /></span><span><b>{fact.title}</b><small>{fact.text}</small></span></li>)}
        </ul>
        <div className="si-foot">
          <span>Trouble signing in? Contact your agency administrator.</span>
        </div>
      </section>
    </main>
  );
}
