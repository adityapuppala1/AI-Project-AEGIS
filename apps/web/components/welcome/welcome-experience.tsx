"use client";

// Public landing page: what IndTrana is, why it exists and how an alert travels. Explanation only. Nothing here
// reads operational data. The 3D stage is an illustration of India seen from orbit: it is loaded after first paint,
// replaced by a still picture without WebGL, and drawn without movement for reduced motion.
// Signed-out visitors can only go on to /sign-in, so every call to action leads there until a session exists.
import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import "@fontsource-variable/anek-latin/wdth.css";
import { ArrowDown, Ban, Bot, Building2, Check, Command, FileCheck2, Landmark, LogIn, Minus, Play, RadioTower, Satellite, Smartphone, UserCheck, Users, UsersRound } from "lucide-react";
import { useBrand } from "../brand-provider";
import { BrandMark, BrandName } from "../brand-mark";
import stillView from "../globe/assets/india-globe-still.webp";
import { indiaDaylight, istClock } from "../globe/sun";
import type { HazardId, WelcomeScene } from "./welcome-scene";
import "./welcome.css";

const HAZARDS: Array<{ id: HazardId; label: string; sense: string; predict: string; mark: string; where: string; drawn: string }> = [
  { id: "cyclone", label: "Cyclone", mark: "A storm turning over the Bay of Bengal", where: "Bay of Bengal and the Odisha coast", drawn: "A storm, turning the way they do north of the equator", sense: "Weather satellites and coastal gauges follow a storm forming over the Bay of Bengal, days before landfall.", predict: "Several possible storm tracks are compared. The districts most likely to flood are marked, with the evidence behind each one listed." },
  { id: "flood", label: "River flood", mark: "Water rising along the Brahmaputra", where: "Brahmaputra valley, Assam", drawn: "The Brahmaputra, with the Ganga and Godavari for context", sense: "Rainfall estimates and river gauges show water rising upstream, long before it reaches the towns below.", predict: "The river level is compared with past years to say how unusual it is, and which low-lying areas would flood first." },
  { id: "earthquake", label: "Earthquake", mark: "Shaking spreading from an epicentre", where: "Himalayan arc, Uttarakhand", drawn: "The Himalayan seismic belt, drawn schematically", sense: "Seismic networks report a strong earthquake within minutes of it happening.", predict: "Earthquakes cannot be predicted, and IndTrana says so. It estimates who was shaken and what may follow, such as landslides." },
  { id: "heatwave", label: "Heatwave", mark: "Heat building over the plains", where: "North-west and central plains", drawn: "Heat building over the land", sense: "Temperature and humidity forecasts show several dangerous days ahead.", predict: "Forecast heat is compared with local records to flag the districts where the health risk is highest." },
];

const SATELLITE_KEY: [string, string] = ["ink", "INSAT-3DR and INSAT-3DS, India’s weather satellites. Heights are not to scale."];
type Step = { title: string; rail: string; text: (hazard: (typeof HAZARDS)[number]) => string; ai: string; people: string; key: Array<[string, string]> };
const STEPS: Step[] = [
  { title: "Sense the hazard", rail: "Sense", text: hazard => hazard.sense, ai: "Reads many sources at once and flags the ones that are late or disagree.", people: "Decide which sources the agency trusts.", key: [["sea", "Readings arriving from satellites and gauges"], ["hazard", "The hazard being watched"], SATELLITE_KEY] },
  { title: "Estimate the risk", rail: "Predict", text: hazard => hazard.predict, ai: "Gives a range, cites every source, and says “not enough evidence” when that is the truth.", people: "Read the evidence and question it.", key: [["ink", "Possible paths, not one certain line"], ["risk", "Area most at risk, inside a wider likely range"]] },
  { title: "Two people decide", rail: "Decide", text: () => "One officer drafts the alert. A different officer checks it and approves or sends it back with a reason. No single person can approve alone, and software cannot approve at all.", ai: "Points the checker to the evidence that matters most.", people: "Draft, check, approve. Their names and reasons are recorded.", key: [["sea", "The maker, who drafts"], ["ink", "The checker, a different officer"], ["green", "Approved by both"]] },
  { title: "Hand over to the authority", rail: "Hand over", text: () => "The approved draft goes to the alerting authority in the standard alert format (Common Alerting Protocol). IndTrana stops here. It has no way to send a public warning.", ai: "Fills a fixed template. It does not write free text into an alert.", people: "The authority decides whether, where and when to warn.", key: [["green", "The approved draft"], ["ink", "The one gate out of IndTrana"]] },
  { title: "Reach people", rail: "Reach", text: () => "The authority’s own system passes the warning to telecom operators, who broadcast it to phones in the affected area. Response teams receive their tasks from their departments.", ai: "Suggests where teams could wait, as a recommendation only.", people: "Departments task their teams. Operators deliver the broadcast.", key: [["saffron", "The authority’s own channel. IndTrana is not on these lines."]] },
  { title: "Learn from what happened", rail: "Learn", text: () => "After the event, what was estimated is compared with what happened. Any change to a threshold goes through the same two-person approval before it is used.", ai: "Reports how its estimates compared, without calling it accuracy.", people: "Approve or reject each proposed change.", key: [["sea", "What happened, returning to the desk"]] },
];

// `share` is the same figure as a fraction of its whole, used only to draw the bar beside it.
const FIGURES = [
  { value: "58.6%", share: 0.586, text: "of India’s land is prone to earthquakes of moderate to very high intensity" },
  { value: "12%", share: 0.12, text: "of the land, over 40 million hectares, is prone to floods and river erosion" },
  { value: "5,700 km", share: 5700 / 7516, text: "of the 7,516 km coastline is prone to cyclones and tsunamis" },
  { value: "68%", share: 0.68, text: "of cultivable land is vulnerable to drought" },
];

const PEOPLE = [
  { icon: Landmark, who: "Government and agencies", today: ["Information arrives from many systems and in many formats", "Hard to show later who decided what, and on which evidence"], with: ["One desk shows the sources, how fresh they are and what they imply", "Every decision keeps its evidence, its two approvers and their reasons"] },
  { icon: UsersRound, who: "Response teams", today: ["Tasks reach teams late or through phone calls", "Shift changes lose context"], with: ["Departments see approved tasks in one inbox", "A handover note is prepared for the next shift, with every line traceable"] },
  { icon: Users, who: "Citizens", today: ["Warnings can be late, vague or contradictory", "False alarms reduce trust in the next warning"], with: ["A warning is drafted earlier and checked by two officers before it goes to the authority", "Citizens still hear from the official channel only, never from IndTrana"] },
];

const CHAIN = [
  { icon: Satellite, title: "Sensors", text: "Satellites, gauges and public feeds", outside: false, detail: "Each reading arrives with its time. Sources that are late, missing or in disagreement are flagged, so nobody leans on stale data." },
  { icon: Command, title: "IndTrana desk", text: "Evidence gathered and risk estimated", outside: false, detail: "The desk lines up the evidence and gives a range for the risk, with every source cited. When the evidence is thin it says so instead of guessing." },
  { icon: UserCheck, title: "Maker and checker", text: "Two officers approve a draft alert", outside: false, detail: "One officer drafts the alert. A different officer approves it or sends it back with a reason. Their names and reasons are recorded." },
  { icon: Building2, title: "Alerting authority", text: "NDMA or the state authority issues the warning", outside: true, detail: "The authority receives the approved draft in the Common Alerting Protocol. It alone decides whether, where and when to warn." },
  { icon: RadioTower, title: "Telecom operators", text: "Cell broadcast and SMS to the affected area", outside: true, detail: "Operators broadcast the authority’s warning to phones in the affected area. IndTrana has no connection to them." },
  { icon: Smartphone, title: "People", text: "Phones, sirens, local officials", outside: true, detail: "People hear from the official channel and from local officials. They never receive a message from IndTrana." },
] as const;
const GATE_AFTER = 2;

type Session = { authenticated: boolean; configured: boolean };
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Where on the screen a step counts as "being read".
function readingLine() {
  const wide = window.matchMedia("(min-width: 64rem)").matches;
  if (wide) return { wide, line: window.innerHeight * 0.55 };
  const stageBottom = document.querySelector(".wl-stage")?.getBoundingClientRect().bottom ?? window.innerHeight * 0.5;
  return { wide, line: stageBottom + (window.innerHeight - stageBottom) * 0.4 };
}

/** A figure that counts up once when it scrolls into view. Screen readers and reduced-motion users get the final value. */
function Figure({ value, share, text }: Readonly<{ value: string; share: number; text: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(value), [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current, match = /^([\d,.]+)(.*)$/.exec(value);
    if (!node || !match || calm()) { setSeen(true); return; }
    const target = Number(match[1].replaceAll(",", "")), decimals = (match[1].split(".")[1] ?? "").length, tail = match[2];
    const format = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + tail;
    setShown(format(0));
    let frame = 0;
    const watcher = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      watcher.disconnect(); setSeen(true);
      const start = performance.now(), run = (now: number) => {
        const t = Math.min(1, (now - start) / 1400), eased = 1 - Math.pow(1 - t, 3);
        setShown(t < 1 ? format(target * eased) : value);
        if (t < 1) frame = requestAnimationFrame(run);
      };
      frame = requestAnimationFrame(run);
    }, { threshold: 0.6 });
    watcher.observe(node);
    return () => { watcher.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  return (
    <div ref={ref} data-seen={seen || undefined}>
      <dt><span aria-hidden="true">{shown.split(" ")[0]}{shown.includes(" ") && <small> {shown.split(" ").slice(1).join(" ")}</small>}</span><span className="wl-sr">{value}</span></dt>
      <dd>{text}<span className="wl-share" aria-hidden="true"><span style={{ transform: `scaleX(${seen ? share : 0})` }} /></span></dd>
    </div>
  );
}

export function WelcomeExperience() {
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), sceneRef = useRef<WelcomeScene | null>(null), stepsRef = useRef<HTMLDivElement>(null);
  const [hazardId, setHazardId] = useState<HazardId>("cyclone");
  const brand = useBrand(), b = brand.text;
  const [active, setActive] = useState(0);
  const [webgl, setWebgl] = useState(true);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const viewRef = useRef<HTMLSpanElement>(null), hazardRef = useRef<HazardId>("cyclone");
  const [session, setSession] = useState<Session | null>(null);
  const [node, setNode] = useState(0);
  const [playing, setPlaying] = useState(false);
  const hazard = HAZARDS.find(item => item.id === hazardId) ?? HAZARDS[0];
  const signedIn = session?.authenticated === true;

  useEffect(() => {
    const canvas = canvasRef.current, steps = stepsRef.current, root = rootRef.current;
    if (!canvas || !steps || !root) return;
    // The 3D code (three.js and the imagery) is fetched after the page has painted. Until it is ready, and whenever
    // WebGL is missing, the still picture of the same view stands in.
    let queued = 0, gone = false;
    const showView = (lon: number, lat: number) => { if (viewRef.current) viewRef.current.textContent = `${lat.toFixed(1)}°N ${lon.toFixed(1)}°E`; };
    import("./welcome-scene").then(module => {
      if (gone) return;
      const scene = module.startWelcomeScene(canvas, calm(), { onReady: () => { if (!gone) setLive(true); }, onView: showView });
      if (!scene) { setWebgl(false); return; }
      sceneRef.current = scene; scene.setHazard(hazardRef.current); measure();
    }).catch(() => { if (!gone) setWebgl(false); });
    const measure = () => {
      queued = 0;
      const blocks = Array.from(steps.querySelectorAll<HTMLElement>("[data-stage]")), { line, wide } = readingLine();
      // Wide screens: a step is current while its middle is near the middle of the window. Narrow screens: the 3D
      // stage is pinned on top, so a step becomes current as its heading enters the space below the stage.
      const centres = blocks.map(block => { const box = block.getBoundingClientRect(); return wide ? box.top + box.height / 2 : box.top; }), middle = line;
      let stage = 0;
      if (centres.length && middle >= centres[centres.length - 1]) stage = centres.length - 1;
      else for (let i = 0; i < centres.length - 1; i++) if (middle >= centres[i] && middle < centres[i + 1]) stage = i + (middle - centres[i]) / (centres[i + 1] - centres[i]);
      const settled = wide ? stage : Math.floor(stage + 0.02);
      sceneRef.current?.setStage(settled); setActive(Math.round(settled));
      const span = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty("--wl-page", String(span > 0 ? Math.min(1, window.scrollY / span) : 0));
      root.style.setProperty("--wl-story", String(Math.min(1, settled / (blocks.length - 1))));
    };
    const onScroll = () => { if (!queued) queued = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll); measure();

    // Sections lower down settle into place once, the first time they are scrolled to.
    const reveals = Array.from(root.querySelectorAll<HTMLElement>(".wl-reveal"));
    let watcher: IntersectionObserver | null = null;
    if (calm()) reveals.forEach(item => { item.dataset.in = "1"; });
    else {
      watcher = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { (entry.target as HTMLElement).dataset.in = "1"; watcher?.unobserve(entry.target); } }, { rootMargin: "0px 0px -12% 0px" });
      for (const item of reveals) { if (item.getBoundingClientRect().top < window.innerHeight) item.dataset.in = "1"; else watcher.observe(item); }
      root.dataset.motion = "on";
    }
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(queued); watcher?.disconnect(); gone = true; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, []);

  useEffect(() => { hazardRef.current = hazardId; sceneRef.current?.setHazard(hazardId); }, [hazardId]);

  // The clock beside the globe. Set after mount so the server and the browser never disagree about the time.
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }).then(response => response.json())
      .then((value: Partial<Session>) => setSession({ authenticated: value.authenticated === true, configured: value.configured === true }))
      .catch(() => { if (!controller.signal.aborted) setSession({ authenticated: false, configured: false }); });
    return () => controller.abort();
  }, []);

  // "Follow the alert": steps through the chain once, pausing on each link.
  useEffect(() => {
    if (!playing) return;
    if (node >= CHAIN.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setNode(current => current + 1), node === GATE_AFTER ? 2600 : 1900);
    return () => window.clearTimeout(timer);
  }, [playing, node]);

  const goTo = useCallback((stage: number) => {
    const block = stepsRef.current?.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
    if (!block) return;
    const box = block.getBoundingClientRect(), { line, wide } = readingLine();
    const top = window.scrollY + (wide ? box.top + box.height / 2 - line : box.top - line + 28);
    window.scrollTo({ top: Math.max(0, top), behavior: calm() ? "auto" : "smooth" });
  }, []);

  const pickNode = (index: number) => { setPlaying(false); setNode(Math.min(CHAIN.length - 1, Math.max(0, index))); };
  const onChainKey = (event: KeyboardEvent<HTMLOListElement>) => {
    const move = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    const next = Math.min(CHAIN.length - 1, Math.max(0, node + move)); pickNode(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  // Picking a hazard flies the globe to the region where it is shown, even when it is already the selected one.
  const pickHazard = (id: HazardId) => { setHazardId(id); sceneRef.current?.setHazard(id, true); };
  const hazardPicker = (label: string) => (
    <div className="wl-hazards" role="group" aria-label={label}>
      <span>{label}</span>
      {HAZARDS.map(item => <button key={item.id} type="button" data-hazard={item.id} aria-pressed={item.id === hazardId} onClick={() => pickHazard(item.id)}>{item.label}</button>)}
    </div>
  );
  const legend: Array<[string, string]> = active === 0 ? [["saffron", "India, outlined"], ["hazard", hazard.drawn], SATELLITE_KEY] : STEPS[active - 1].key;
  const daylight = now ? indiaDaylight(now) : null;
  const current = CHAIN[node];

  return (
    <div className="wl" ref={rootRef} data-hazard={hazardId}>
      <header className="wl-top">
        <div className="wl-wrap">
          <Link href={signedIn ? "/welcome" : "/"} className="wl-mark" aria-label={brand.text("IndTrana, about this project")}><span className="overflow-hidden"><BrandMark box={24} /></span><BrandName /></Link>
          <nav aria-label="Main">
            <a href="#wl-how" className="wl-hide-s">How it works</a>
            <a href="#wl-ai" className="wl-hide-s">Safeguards</a>
            <a href="#wl-status" className="wl-hide-s">Project status</a>
            <Link href={signedIn ? "/approvals" : "/sign-in"} className="wl-in">{signedIn ? "Open workbench" : "Sign in"}</Link>
          </nav>
        </div>
        <div className="wl-progress" aria-hidden="true"><span /></div>
      </header>

      <main>
        <div className="wl-story" id="wl-how">
          <div className="wl-stage">
            <div className="wl-stage-art" aria-hidden="true" data-live={live || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, self-hosted build asset */}
              <img className="wl-still" src={stillView.src} width={stillView.width} height={stillView.height} alt="" decoding="async" />
              {webgl && <canvas ref={canvasRef} />}
              <div className="wl-hud">
                <p className="wl-fix">
                  <b>{hazard.where}</b>
                  <span>Looking at <span ref={viewRef}>20.0°N 80.5°E</span></span>
                  {now && <span className="wl-clock">{istClock(now)} IST, {daylight} over India</span>}
                </p>
                <p className="wl-credit">Illustration, not live imagery</p>
                <div className="wl-key" key={active + hazardId}>
                  <b>{active === 0 ? hazard.mark : STEPS[active - 1].title}</b>
                  <ul>{legend.map(([tone, text]) => <li key={text}><i data-tone={tone} />{text}</li>)}</ul>
                </div>
              </div>
            </div>
            <nav className="wl-rail" aria-label="Steps in the story">
              {STEPS.map((step, index) => <button key={step.rail} type="button" aria-current={active === index + 1 ? "step" : undefined} data-done={active > index + 1 || undefined} aria-label={`Step ${index + 1}: ${step.title}`} onClick={() => goTo(index + 1)}><b>{index + 1}</b><span>{step.rail}</span></button>)}
            </nav>
          </div>

          <div className="wl-steps" ref={stepsRef}>
            <section className="wl-hero" data-stage="0" aria-labelledby="wl-title">
              <h1 id="wl-title">From the first signal to a warning people can trust</h1>
              <p>{brand.name} is a decision desk for India’s disaster agencies. It gathers the evidence, estimates the risk, and makes sure two accountable officers approve an alert before it goes to the official channel.</p>
              <div className="wl-actions">
                {signedIn
                  ? <Link href="/" className="wl-btn wl-solid">Open the Command Center</Link>
                  : <Link href="/sign-in" className="wl-btn wl-solid"><LogIn size={18} aria-hidden="true" />Sign in to explore</Link>}
                <button type="button" className="wl-btn wl-ghost" onClick={() => goTo(1)}>See how an alert travels<ArrowDown size={18} aria-hidden="true" /></button>
              </div>
              {hazardPicker("Follow a")}
              <p className="wl-note">This is a prototype for rehearsal. Everything shown uses synthetic exercise data. {brand.name} does not send warnings.</p>
            </section>

            {STEPS.map((step, index) => (
              <section key={step.title} className="wl-step" data-stage={index + 1} data-current={active === index + 1 || undefined} aria-labelledby={`wl-step-${index}`}>
                <span className="wl-step-n">Step {index + 1} of {STEPS.length}</span>
                <h2 id={`wl-step-${index}`}>{step.title}</h2>
                <p key={index < 2 ? hazardId : "fixed"} className={index < 2 ? "wl-swap" : undefined}>{b(step.text(hazard))}</p>
                <div className="wl-split">
                  <div className="wl-lane-ai"><Bot size={20} aria-hidden="true" /><span><b>AI helps: </b>{step.ai}</span></div>
                  <div className="wl-lane-people"><UserCheck size={20} aria-hidden="true" /><span><b>People decide: </b>{step.people}</span></div>
                </div>
                {index < 2 && hazardPicker("Showing")}
              </section>
            ))}
          </div>
        </div>

        <section className="wl-band wl-paper" aria-labelledby="wl-why">
          <div className="wl-wrap wl-reveal">
            <h2 id="wl-why">Why this was built</h2>
            <p className="wl-lede">Few countries face as many kinds of hazard as India. The hours before a disaster are when a clear, trusted warning saves the most lives, and they are also when information is most scattered.</p>
            <dl className="wl-figures">{FIGURES.map(figure => <Figure key={figure.value} {...figure} />)}</dl>
            <p className="wl-source">Figures: National Disaster Management Authority, vulnerability profile of India. Confirm against ndma.gov.in before quoting.</p>
          </div>
        </section>

        <section className="wl-band" aria-labelledby="wl-who">
          <div className="wl-wrap wl-reveal">
            <h2 id="wl-who">Who it helps, and how</h2>
            <div className="wl-people">
              {PEOPLE.map(group => (
                <article key={group.who}>
                  <header><span><group.icon size={24} aria-hidden="true" /></span><h3>{group.who}</h3></header>
                  <div className="wl-before"><h4>Without a shared desk</h4><ul>{group.today.map(line => <li key={line}><Minus size={18} aria-hidden="true" /><span>{line}</span></li>)}</ul></div>
                  <div className="wl-after"><h4>With <BrandName /></h4><ul>{group.with.map(line => <li key={line}><Check size={18} aria-hidden="true" /><span>{b(line)}</span></li>)}</ul></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="wl-band wl-paper" id="wl-ai" aria-labelledby="wl-ai-title">
          <div className="wl-wrap wl-reveal">
            <h2 id="wl-ai-title">What the AI does, and what it is never allowed to do</h2>
            <p className="wl-lede">AI is used to read, compare and explain. Decisions and warnings stay with named officers.</p>
            <div className="wl-two">
              <div className="wl-ai">
                <h3>AI helps with</h3>
                <ul>
                  {["Watching many sources at once and flagging stale or conflicting ones", "Estimating how unusual a rainfall, river level or heat forecast is, with a range", "Citing the exact records behind every statement", "Saying “not enough evidence” instead of guessing", "Suggesting where teams could wait, and drafting a shift handover", "Answering an officer’s questions from validated records only"].map(line => <li key={line}><Check size={20} aria-hidden="true" /><span>{line}</span></li>)}
                </ul>
              </div>
              <div className="wl-never">
                <h3>{brand.name} never</h3>
                <ul>
                  {["Sends a public warning, SMS or cell broadcast", "Approves an alert, or lets one person approve alone", "Dispatches, moves or tasks a team", "Writes free text into an official alert", "Claims a forecast accuracy it has not earned", "Stores public feed data as if it were an agency record"].map(line => <li key={line}><Ban size={20} aria-hidden="true" /><span>{line}</span></li>)}
                </ul>
              </div>
            </div>
            <div className="wl-callout">
              <p><b>Natural and human-made hazards.</b> The prototype models natural hazards: floods, cyclones, earthquakes, landslides, heat, drought and wildfire. Human-made incidents such as an industrial fire or a dam release can be rehearsed through the same approval steps and playbooks, but there is no detection model for them yet.</p>
            </div>
          </div>
        </section>

        <section className="wl-band wl-ink" aria-labelledby="wl-chain">
          <div className="wl-wrap wl-reveal">
            <div className="wl-chain-head">
              <div>
                <h2 id="wl-chain">How a warning reaches a phone</h2>
                <p className="wl-lede">{brand.name} prepares and hands over. The official channel warns. The line between the two is deliberate.</p>
              </div>
              <button type="button" className="wl-btn wl-light" onClick={() => { setNode(0); setPlaying(true); }} disabled={playing}><Play size={18} aria-hidden="true" />{playing ? "Following the alert" : "Follow the alert"}</button>
            </div>
            <ol className="wl-chain" data-node={node} data-playing={playing || undefined} onKeyDown={onChainKey} style={{ ["--node" as string]: node }}>
              {CHAIN.map((item, index) => (
                <Fragment key={item.title}><li className={item.outside ? "wl-outside" : undefined} data-state={index === node ? "on" : index < node ? "done" : undefined}>
                  <button type="button" aria-current={index === node ? "step" : undefined} tabIndex={index === node ? 0 : -1} onClick={() => pickNode(index)}>
                    <span><item.icon size={22} aria-hidden="true" /></span>
                    <span><b>{b(item.title)}</b><small>{item.text}</small></span>
                  </button>
                  <p className="wl-node-inline">{b(item.detail)}</p>
                </li>
                {index === GATE_AFTER && <li className="wl-gate" data-state={node > GATE_AFTER ? "done" : undefined}><span><FileCheck2 size={18} aria-hidden="true" /></span><p>{brand.name} stops here. Only an approved draft crosses.</p></li>}</Fragment>
              ))}
            </ol>
            <div className="wl-node" aria-live="polite">
              <span>{b(current.outside ? "Official channel, outside IndTrana" : "Inside IndTrana")}</span>
              <p key={node}><b>{b(current.title)}. </b>{b(current.detail)}</p>
            </div>
          </div>
        </section>

        <section className="wl-band" aria-labelledby="wl-tech">
          <div className="wl-wrap wl-reveal">
            <h2 id="wl-tech">How it is built</h2>
            <div className="wl-tech">
              <div>
                <p className="wl-lede" style={{ marginTop: 0 }}>Open, widely used components that a government team can audit, host in India and maintain.</p>
              </div>
              <dl>
                <div><dt>Sign-in</dt><dd>The agency’s own identity provider (OpenID Connect). {brand.name} never sees a password. Role and agency come from the signed token.</dd></div>
                <div><dt>Approval</dt><dd>Maker and checker must be different people, enforced on the server and recorded in an audit trail.</dd></div>
                <div><dt>Privacy</dt><dd>The browser talks only to the {brand.name} server. Outside map and data sources never see who is looking.</dd></div>
                <div><dt>Maps and 3D</dt><dd>PostGIS for geography, MapLibre for maps, three.js for the 3D views.</dd></div>
                <div><dt>Application</dt><dd>Next.js and React in the browser, Python FastAPI services, PostgreSQL database, Docker containers.</dd></div>
                <div><dt>Standards</dt><dd>Alerts are drafted in the Common Alerting Protocol used by national alerting systems.</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section className="wl-band wl-paper" id="wl-status" aria-labelledby="wl-status-title">
          <div className="wl-wrap wl-status wl-reveal">
            <div>
              <h2 id="wl-status-title">Where the project stands</h2>
              <ul>
                <li>A working prototype that runs complete rehearsals on synthetic data.</li>
                <li>Not yet audited, hosted or approved for operational use.</li>
                <li>Official data agreements, a security audit and accessibility certification come first.</li>
              </ul>
            </div>
            <div className="wl-next">
              {signedIn ? <>
                <p>You are signed in. The rehearsal pages are open to you.</p>
                <div className="wl-actions">
                  <Link href="/demo" className="wl-btn wl-solid">Take the guided exercise</Link>
                  <Link href="/admin/go-live" className="wl-btn wl-ghost">See what going live needs</Link>
                </div>
              </> : <>
                <p>The guided exercise and the workbench open after you sign in with an agency account.</p>
                <div className="wl-actions">
                  <Link href="/sign-in" className="wl-btn wl-solid"><LogIn size={18} aria-hidden="true" />Sign in to explore</Link>
                </div>
              </>}
            </div>
          </div>
        </section>
      </main>

      <footer className="wl-foot">
        <div className="wl-wrap">
          <span>{brand.name}, exercise prototype. Synthetic data. Not a warning service.</span>
          <span>The globe is an illustration built from NASA imagery. It is not live and not a map of record. India’s outline is schematic, not an authoritative boundary.</span>
        </div>
      </footer>
    </div>
  );
}
