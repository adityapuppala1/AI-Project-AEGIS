"use client";

// AEGIS operator sign-in. This page never collects a password: the button starts the OpenID Connect flow
// (/api/auth/login), and the operator authenticates on the organisation's identity provider. The 3D backdrop is
// decoration only; it is skipped for reduced-motion users and when WebGL is unavailable.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { ArrowLeft, Command, Fingerprint, KeyRound, LockKeyhole, LogIn, Satellite, ShieldCheck, TimerReset, TriangleAlert } from "lucide-react";

type Session = { authenticated: boolean; configured: boolean; subject?: string; roles?: string[] };

const RAD = Math.PI / 180;
function onSphere(lon: number, lat: number, radius: number) {
  const phi = (90 - lat) * RAD, theta = (lon + 180) * RAD;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

function startScene(canvas: HTMLCanvasElement, still: boolean): () => void {
  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" }); } catch { return () => {}; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x050816);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 0, 9.5);
  const world = new THREE.Group(); scene.add(world);
  const disposables: Array<{ dispose: () => void }> = [];
  const keep = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item; };

  // Stars
  const starPositions: number[] = [];
  for (let i = 0; i < 900; i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(40 + Math.random() * 60); starPositions.push(v.x, v.y, v.z); }
  const starGeometry = keep(new THREE.BufferGeometry()); starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 }))));

  // Point-cloud globe, with the Indian subcontinent picked out in amber
  const R = 3, positions: number[] = [], colors: number[] = [], COUNT = 3200;
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2, ring = Math.sqrt(1 - y * y), angle = i * 2.399963;
    const lat = Math.asin(y) / RAD, lon = ((angle / RAD) % 360) - 180, p = onSphere(lon, lat, R);
    positions.push(p.x, p.y, p.z);
    const india = lat > 8 && lat < 35 && lon > 68.5 && lon < 97 && lat < 37 - Math.abs(lon - 79) * 1.25 + (lat > 22 ? 12 : 0);
    if (india) colors.push(1, 0.72, 0.28); else colors.push(0.2 + ring * 0.05, 0.62, 0.95);
  }
  const globeGeometry = keep(new THREE.BufferGeometry());
  globeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  globeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const globe = new THREE.Group(); world.add(globe);
  globe.add(new THREE.Points(globeGeometry, keep(new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.95 }))));
  globe.add(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.985, 48, 32)), keep(new THREE.MeshBasicMaterial({ color: 0x06102a }))));
  globe.add(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 1.1, 48, 32)), keep(new THREE.MeshBasicMaterial({ color: 0x2c8dff, transparent: true, opacity: 0.06, side: THREE.BackSide }))));

  // Alert pulses rising from central India
  const origin = onSphere(79, 21.5, R * 1.004), pulses = [0, 1, 2].map(() => {
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.2, 0.225, 48)), keep(new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
    ring.position.copy(origin); ring.lookAt(origin.clone().multiplyScalar(2)); globe.add(ring); return ring;
  });
  const facing = Math.atan2(-origin.x, origin.z);

  // Three satellites on tilted orbits
  const orbits = [{ radius: 4.1, tilt: 0.5, speed: 0.5, colour: 0x38e1ff }, { radius: 4.7, tilt: -0.9, speed: 0.34, colour: 0x4be3a0 }, { radius: 5.3, tilt: 1.25, speed: 0.24, colour: 0x9b7bff }].map((orbit, index) => {
    const group = new THREE.Group(); group.rotation.set(orbit.tilt, index * 1.1, orbit.tilt * 0.4); world.add(group);
    const path: InstanceType<typeof THREE.Vector3>[] = [];
    for (let a = 0; a <= 96; a++) path.push(new THREE.Vector3(Math.cos(a / 96 * Math.PI * 2) * orbit.radius, 0, Math.sin(a / 96 * Math.PI * 2) * orbit.radius));
    group.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(path)), keep(new THREE.LineBasicMaterial({ color: orbit.colour, transparent: true, opacity: 0.28 }))));
    const craft = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 12)), keep(new THREE.MeshBasicMaterial({ color: orbit.colour }))); group.add(craft);
    return { ...orbit, craft, phase: index * 2.1 };
  });

  const pointer = { x: 0, y: 0 };
  const onPointer = (event: PointerEvent) => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
  const resize = () => {
    const width = window.innerWidth, height = window.innerHeight;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    // Wide screens: globe sits left of the sign-in card. Narrow screens: centred behind it.
    world.position.set(width / height > 1.25 ? -2.6 : 0, width / height > 1.25 ? 0 : 1.2, 0);
  };
  window.addEventListener("resize", resize); window.addEventListener("pointermove", onPointer); resize();

  let frame = 0, last = 0, time = 0, alive = true;
  const draw = (now: number) => {
    if (!alive) return;
    if (!still) frame = requestAnimationFrame(draw);
    if (document.hidden) return;
    const delta = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time += delta;
    globe.rotation.y = facing + Math.sin(time * 0.11) * 0.55 + pointer.x * 0.25;
    world.rotation.x = 0.18 + pointer.y * 0.12;
    pulses.forEach((ring, index) => { const u = (time * 0.32 + index / 3) % 1; ring.scale.setScalar(0.6 + u * 5.5); ring.material.opacity = (1 - u) * 0.85; });
    orbits.forEach(orbit => { const a = time * orbit.speed + orbit.phase; orbit.craft.position.set(Math.cos(a) * orbit.radius, 0, Math.sin(a) * orbit.radius); });
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(draw);

  return () => {
    alive = false; cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize); window.removeEventListener("pointermove", onPointer);
    disposables.forEach(item => item.dispose());
    renderer.dispose();
  };
}

const FACTS = [
  { icon: KeyRound, title: "Your password never reaches AEGIS", text: "You type it only on your organisation's identity provider, which is also where multi-factor sign-in is set up." },
  { icon: Fingerprint, title: "Verified hand-back", text: "AEGIS checks the provider's signature, the one-time state and nonce, and a PKCE proof before it trusts the sign-in." },
  { icon: ShieldCheck, title: "Role and agency come from the signed token", text: "Nothing typed in the browser can grant a role. Maker and checker must be different people." },
  { icon: TimerReset, title: "Short, sealed session", text: "An encrypted, HTTP-only cookie that expires within 15 minutes and is cleared on sign-out." },
] as const;

export function SignInExperience({ failed }: Readonly<{ failed: boolean }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = startScene(canvas, still);
    const timer = window.setTimeout(() => setShown(true), 60);
    return () => { window.clearTimeout(timer); stop(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(response => response.json())
      .then((value: Session) => { if (!controller.signal.aborted) setSession({ authenticated: value.authenticated === true, configured: value.configured === true, subject: typeof value.subject === "string" ? value.subject : undefined, roles: Array.isArray(value.roles) ? value.roles.filter((role): role is string => typeof role === "string") : [] }); })
      .catch(() => { if (!controller.signal.aborted) setSession({ authenticated: false, configured: false }); });
    return () => controller.abort();
  }, []);

  const rise = (delay: string) => `transition-all duration-700 ease-out ${delay} ${shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`;
  const status = !session ? "checking" : session.authenticated ? "in" : session.configured ? "ready" : "off";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-[#e8eeff]">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(5,8,22,0)_0%,rgba(5,8,22,.55)_55%,rgba(5,8,22,.92)_100%)]" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a1026]/70 px-4 py-2 text-sm text-[#cfd8f5] backdrop-blur transition hover:border-[#38e1ff] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#38e1ff]">
          <ArrowLeft size={16} aria-hidden="true" />Back to Command Center
        </Link>
        <span className="rounded-full border border-[#ffb547]/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[#ffb547]">Exercise only · synthetic data</span>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-76px)] w-full max-w-6xl items-center justify-center px-5 pb-10 lg:justify-end">
        <section aria-labelledby="sign-in-title" className={`w-full max-w-[460px] rounded-3xl border border-white/12 bg-[#0a1026]/80 p-7 shadow-[0_30px_120px_rgba(0,0,0,.6)] backdrop-blur-xl sm:p-9 ${rise("delay-0")}`}>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#38e1ff] to-[#6d8bff] text-[#02101a] shadow-[0_0_30px_rgba(56,225,255,.45)]"><Command size={26} aria-hidden="true" /></span>
            <div>
              <p className="text-xl font-black tracking-[.16em]">AEGIS</p>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#93a0c8]">Emergency intelligence</p>
            </div>
          </div>

          <h1 id="sign-in-title" className={`mt-7 text-[28px] font-bold leading-tight ${rise("delay-100")}`}>Operator sign-in</h1>
          <p className={`mt-2 text-sm leading-6 text-[#c9d3f5] ${rise("delay-150")}`}>Sign in with your agency account. You will be taken to your organisation&rsquo;s identity provider and brought back here.</p>

          {failed && <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-[#ff5d6c]/60 bg-[#ff5d6c]/10 p-3 text-sm text-[#ffd9dd]"><TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>That sign-in could not be verified, so nobody was signed in. Please try again.</span></p>}

          <div className={`mt-6 ${rise("delay-200")}`} aria-live="polite">
            {status === "checking" && <p className="rounded-xl border border-white/10 p-4 text-sm text-[#93a0c8]">Checking the secure sign-in service…</p>}
            {status === "ready" && <>
              <a href="/api/auth/login" onClick={() => setLeaving(true)} aria-busy={leaving}
                className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#38e1ff] to-[#6d8bff] px-5 py-4 text-base font-bold text-[#02101a] shadow-[0_10px_40px_rgba(56,225,255,.35)] transition hover:shadow-[0_14px_55px_rgba(56,225,255,.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                {leaving ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#02101a]/30 border-t-[#02101a]" aria-hidden="true" /> : <LogIn size={20} aria-hidden="true" />}
                {leaving ? "Opening your identity provider…" : "Continue with agency sign-in"}
              </a>
              <p className="mt-3 flex items-center gap-2 text-xs text-[#93a0c8]"><LockKeyhole size={14} aria-hidden="true" />Secure sign-in service is ready.</p>
            </>}
            {status === "in" && <>
              <p className="rounded-xl border border-[#4be3a0]/50 bg-[#4be3a0]/10 p-4 text-sm text-[#d6ffe9]"><ShieldCheck size={16} className="mr-1 inline" aria-hidden="true" />You are already signed in{session?.roles?.length ? " as " + session.roles.map(role => role.replaceAll("_", " ")).join(", ") : ""}.</p>
              <Link href="/approvals" className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#38e1ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#38e1ff]/15">Continue to the workbench</Link>
            </>}
            {status === "off" && <>
              <p className="rounded-xl border border-[#ffb547]/50 bg-[#ffb547]/10 p-4 text-sm text-[#ffe7bf]"><TriangleAlert size={16} className="mr-1 inline" aria-hidden="true" />Operator sign-in is not set up on this server yet. An administrator must connect an identity provider first.</p>
              <Link href="/admin/go-live" className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-[#38e1ff]">See what needs to be configured</Link>
            </>}
          </div>

          <ol className={`mt-6 grid grid-cols-3 gap-2 text-center text-[11px] text-[#93a0c8] ${rise("delay-300")}`}>
            {["Leave for your identity provider", "Password and second factor there", "Return with a signed role"].map((step, index) => <li key={step} className="rounded-xl border border-white/10 px-2 py-3"><span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#38e1ff]/60 text-[11px] font-bold text-[#38e1ff]">{index + 1}</span>{step}</li>)}
          </ol>

          <ul className={`mt-6 space-y-3 ${rise("delay-500")}`}>
            {FACTS.map(fact => <li key={fact.title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[#38e1ff]"><fact.icon size={16} aria-hidden="true" /></span>
              <span><span className="block text-sm font-semibold">{fact.title}</span><span className="block text-xs leading-5 text-[#93a0c8]">{fact.text}</span></span>
            </li>)}
          </ul>

          <div className={`mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs ${rise("delay-700")}`}>
            <Link href="/alert-journey" className="inline-flex items-center gap-2 text-[#38e1ff] underline-offset-4 hover:underline"><Satellite size={14} aria-hidden="true" />Explore the Alert Journey (no sign-in needed)</Link>
            <span className="text-[#93a0c8]">Trouble signing in? Contact your agency administrator.</span>
          </div>
        </section>
      </div>
    </main>
  );
}
