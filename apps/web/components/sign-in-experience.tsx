"use client";

// IndTrana operator sign-in. This page never collects a password: the button starts the OpenID Connect flow
// (/api/auth/login), and the operator authenticates on the organisation's identity provider. The picture is the same
// Earth as the landing page, resting on India. It is decoration only: loaded after first paint, drawn still for
// reduced-motion users and replaced by a still picture when WebGL is unavailable.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@fontsource-variable/anek-latin/wdth.css";
import { ArrowLeft, ArrowRight, Command, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, TimerReset, TriangleAlert } from "lucide-react";
import { useBrand } from "./brand-provider";
import { BrandMark, BrandName } from "./brand-mark";
import stillView from "./globe/assets/india-globe-still.webp";
import { indiaDaylight, istClock } from "./globe/sun";
import type { SignInPhase } from "./sign-in-scene";
import "./sign-in.css";

type Session = { authenticated: boolean; configured: boolean; subject?: string; roles?: string[] };

const NEXT = [
  { title: "You leave for your agency’s sign-in", text: "The button opens your organisation’s identity provider. IndTrana has no password box of its own." },
  { title: "Password and second factor, there", text: "You prove who you are on your agency’s page, with whatever second factor it requires." },
  { title: "You return with a signed role", text: "The provider sends you back with a signed statement of your role and agency. IndTrana checks the signature before it lets you in." },
];
const FACTS = [
  { icon: KeyRound, title: "Your password never reaches IndTrana", text: "It is typed only on your organisation’s identity provider." },
  { icon: Fingerprint, title: "Verified hand-back", text: "Provider signature, one-time state and nonce, and a PKCE proof are all checked." },
  { icon: ShieldCheck, title: "Role and agency come from the signed token", text: "Nothing typed in the browser can grant a role." },
  { icon: TimerReset, title: "Short, sealed session", text: "An encrypted, HTTP-only cookie that expires within 15 minutes." },
] as const;
const ROLES = [
  { name: "Maker", does: "Works a case, drafts a proposal and submits it for checking." },
  { name: "Checker", does: "Approves or rejects another person’s proposal. Never their own." },
  { name: "Auditor", does: "Reads the audit trail of who decided what, and why." },
  { name: "Admin", does: "Opens the administration pages and configures the platform." },
];

export function SignInExperience({ failed, expired = false, next = null }: Readonly<{ failed: boolean; expired?: boolean; next?: string | null }>) {
  const loginHref = next ? `/api/auth/login?next=${encodeURIComponent(next)}` : "/api/auth/login";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const brand = useBrand(), b = brand.text;
  const [session, setSession] = useState<Session | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState<SignInPhase | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  // The 3D code and its imagery are fetched after the page has painted, so the sign-in button is never kept waiting.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gone = false, stop: (() => void) | null = null;
    import("./sign-in-scene").then(module => {
      if (gone) return;
      stop = module.startSignInScene(canvas, window.matchMedia("(prefers-reduced-motion: reduce)").matches, { onPhase: setPhase, onReady: () => { if (!gone) setLive(true); } });
      if (!stop) setWebgl(false);
    }).catch(() => { if (!gone) setWebgl(false); });
    return () => { gone = true; stop?.(); };
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 20000);
    return () => window.clearInterval(timer);
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
      <div className="si-visual" data-live={live || undefined}>
        <div className="si-art" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, self-hosted build asset */}
          <img className="si-still" src={stillView.src} width={stillView.width} height={stillView.height} alt="" decoding="async" />
          {webgl && <canvas ref={canvasRef} />}
        </div>
        <div className="si-top">
          <Link href="/" className="si-mark" aria-label={brand.text("IndTrana, back to the overview")}><span className="overflow-hidden"><BrandMark box={24} /></span><BrandName /></Link>
          <Link href="/" className="si-back"><ArrowLeft size={16} aria-hidden="true" />What is {brand.name}?</Link>
        </div>
        <div className="si-caption" aria-hidden="true">
          <p className="si-claim">You sign in at your own organisation. {brand.name} only receives the result.</p>
          <p className="si-fix">India from orbit{now && <>, {istClock(now)} IST, {indiaDaylight(now)} over India</>}. Illustration, not live imagery. The outline is schematic, not an authoritative boundary.</p>
        </div>
      </div>

      <div className="si-panel">
        <section className="si-head" aria-labelledby="sign-in-title">
          <p className="si-tag"><i aria-hidden="true" />Exercise only. Synthetic data.</p>
          <h1 id="sign-in-title">Operator sign-in</h1>
          <p className="si-lede">Sign in with your agency account. There is nothing to type on this page: your agency&rsquo;s own sign-in does that part.</p>

          {expired && !failed && <p role="status" className="si-alert"><TriangleAlert size={20} aria-hidden="true" /><span>Your session ended, so you were signed out. Sign in again to continue{next ? " where you left off" : ""}. Sessions last 15 minutes.</span></p>}
          {failed && <p role="alert" className="si-alert"><TriangleAlert size={20} aria-hidden="true" /><span>That sign-in could not be verified, so nobody was signed in. Please try again. If it keeps happening, tell your agency administrator.</span></p>}

          <div className="si-state" aria-live="polite">
            {status === "checking" && <p className="si-box si-wait">Checking the secure sign-in service…<span aria-hidden="true" /></p>}
            {status === "ready" && <>
              <a href={loginHref} className="si-go" onClick={() => setLeaving(true)} aria-busy={leaving}>
                <span>{leaving ? "Opening your agency’s sign-in…" : "Continue to sign in"}</span>
                <i aria-hidden="true">{leaving ? <span className="si-spin" /> : <ArrowRight size={22} />}</i>
              </a>
              <p className="si-hint"><LockKeyhole size={16} aria-hidden="true" />The secure sign-in service is ready. You will leave this page.</p>
            </>}
            {status === "in" && <>
              <p className="si-box si-ok"><ShieldCheck size={20} aria-hidden="true" /><span>You are already signed in{session?.roles?.length ? " as " + session.roles.map(role => role.replaceAll("_", " ")).join(", ") : ""}.</span></p>
              <Link href="/approvals" className="si-go"><span>Continue to the workbench</span><i aria-hidden="true"><ArrowRight size={22} /></i></Link>
            </>}
            {status === "off" && <div className="si-box si-warn si-setup">
              <TriangleAlert size={20} aria-hidden="true" />
              <div>
                <p><b>Operator sign-in is not set up on this server yet.</b> Nobody can sign in until an administrator finishes three things:</p>
                <ol>
                  <li>Create the private sign-in settings and connect an identity provider.</li>
                  <li>Restart {brand.name} with sign-in switched on.</li>
                  <li>On a rehearsal laptop, create the local demo accounts.</li>
                </ol>
                <p>The exact steps are in the install guide, <code>docs/INSTALL.md</code>, in the project folder.</p>
                <Link href="/" className="si-quiet">Read what {brand.name} is</Link>
              </div>
            </div>}
          </div>
        </section>

        <section className="si-next" aria-labelledby="sign-in-next">
          <h2 id="sign-in-next">What happens next</h2>
          <ol>
            {NEXT.map((step, index) => <li key={step.title} data-on={phase === index || undefined}><b aria-hidden="true">{index + 1}</b><span><strong>{step.title}</strong><small>{b(step.text)}</small></span></li>)}
          </ol>
        </section>

        <details className="si-roles">
          <summary>Which demo role does what</summary>
          <dl>
            {ROLES.map(role => <div key={role.name}><dt>{role.name}</dt><dd>{role.does}</dd></div>)}
          </dl>
          <p>Demo accounts exist only on a rehearsal laptop. Their passwords are generated on that machine and are never shown on this page.</p>
        </details>

        <section className="si-more" aria-labelledby="sign-in-safe">
          <h2 id="sign-in-safe">How this sign-in is protected</h2>
          <ul className="si-facts">
            {FACTS.map(fact => <li key={fact.title}><span><fact.icon size={17} aria-hidden="true" /></span><span><b>{b(fact.title)}</b><small>{b(fact.text)}</small></span></li>)}
          </ul>
          <p className="si-foot">Trouble signing in? Contact your agency administrator.</p>
        </section>
      </div>
    </main>
  );
}
