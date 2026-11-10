"use client";

// Public landing page: what AEGIS is, why it exists and how an alert travels. Explanation only. Nothing here
// reads operational data, and the 3D stage is an illustration (skipped without WebGL, still for reduced motion).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@fontsource-variable/anek-latin/wdth.css";
import { Ban, Bot, Building2, Check, Command, FileCheck2, Landmark, RadioTower, Satellite, Smartphone, UserCheck, Users, UsersRound } from "lucide-react";
import { startWelcomeScene, type HazardId, type WelcomeScene } from "./welcome-scene";
import "./welcome.css";

const HAZARDS: Array<{ id: HazardId; label: string; sense: string; predict: string }> = [
  { id: "cyclone", label: "Cyclone", sense: "Weather satellites and coastal gauges follow a storm forming over the Bay of Bengal, days before landfall.", predict: "Several possible storm tracks are compared. The districts most likely to flood are marked, with the evidence behind each one listed." },
  { id: "flood", label: "River flood", sense: "Rainfall estimates and river gauges show water rising upstream, long before it reaches the towns below.", predict: "The river level is compared with past years to say how unusual it is, and which low-lying areas would flood first." },
  { id: "earthquake", label: "Earthquake", sense: "Seismic networks report a strong earthquake within minutes of it happening.", predict: "Earthquakes cannot be predicted, and AEGIS says so. It estimates who was shaken and what may follow, such as landslides." },
  { id: "heatwave", label: "Heatwave", sense: "Temperature and humidity forecasts show several dangerous days ahead.", predict: "Forecast heat is compared with local records to flag the districts where the health risk is highest." },
];

type Step = { title: string; rail: string; text: (hazard: (typeof HAZARDS)[number]) => string; ai: string; people: string };
const STEPS: Step[] = [
  { title: "Sense the hazard", rail: "Sense", text: hazard => hazard.sense, ai: "Reads many sources at once and flags the ones that are late or disagree.", people: "Decide which sources the agency trusts." },
  { title: "Estimate the risk", rail: "Predict", text: hazard => hazard.predict, ai: "Gives a range, cites every source, and says “not enough evidence” when that is the truth.", people: "Read the evidence and question it." },
  { title: "Two people decide", rail: "Decide", text: () => "One officer drafts the alert. A different officer checks it and approves or sends it back with a reason. No single person can approve alone, and software cannot approve at all.", ai: "Points the checker to the evidence that matters most.", people: "Draft, check, approve. Their names and reasons are recorded." },
  { title: "Hand over to the authority", rail: "Hand over", text: () => "The approved draft goes to the alerting authority in the standard alert format (Common Alerting Protocol). AEGIS stops here. It has no way to send a public warning.", ai: "Fills a fixed template. It does not write free text into an alert.", people: "The authority decides whether, where and when to warn." },
  { title: "Reach people", rail: "Reach", text: () => "The authority’s own system passes the warning to telecom operators, who broadcast it to phones in the affected area. Response teams receive their tasks from their departments.", ai: "Suggests where teams could wait, as a recommendation only.", people: "Departments task their teams. Operators deliver the broadcast." },
  { title: "Learn from what happened", rail: "Learn", text: () => "After the event, what was estimated is compared with what happened. Any change to a threshold goes through the same two-person approval before it is used.", ai: "Reports how its estimates compared, without calling it accuracy.", people: "Approve or reject each proposed change." },
];

const FIGURES = [
  { value: "58.6%", text: "of India’s land is prone to earthquakes of moderate to very high intensity" },
  { value: "12%", text: "of the land, over 40 million hectares, is prone to floods and river erosion" },
  { value: "5,700 km", text: "of the 7,516 km coastline is prone to cyclones and tsunamis" },
  { value: "68%", text: "of cultivable land is vulnerable to drought" },
];

const PEOPLE = [
  { icon: Landmark, who: "Government and agencies", today: ["Information arrives from many systems and in many formats", "Hard to show later who decided what, and on which evidence"], with: ["One desk shows the sources, how fresh they are and what they imply", "Every decision keeps its evidence, its two approvers and their reasons"] },
  { icon: UsersRound, who: "Response teams", today: ["Tasks reach teams late or through phone calls", "Shift changes lose context"], with: ["Departments see approved tasks in one inbox", "A handover note is prepared for the next shift, with every line traceable"] },
  { icon: Users, who: "Citizens", today: ["Warnings can be late, vague or contradictory", "False alarms reduce trust in the next warning"], with: ["A warning is drafted earlier and checked by two officers before it goes to the authority", "Citizens still hear from the official channel only, never from AEGIS"] },
];

const CHAIN = [
  { icon: Satellite, title: "Sensors", text: "Satellites, gauges and public feeds", outside: false },
  { icon: Command, title: "AEGIS desk", text: "Evidence gathered and risk estimated", outside: false },
  { icon: UserCheck, title: "Maker and checker", text: "Two officers approve a draft alert", outside: false },
  null,
  { icon: Building2, title: "Alerting authority", text: "NDMA or the state authority issues the warning", outside: true },
  { icon: RadioTower, title: "Telecom operators", text: "Cell broadcast and SMS to the affected area", outside: true },
  { icon: Smartphone, title: "People", text: "Phones, sirens, local officials", outside: true },
] as const;

type Session = { authenticated: boolean; configured: boolean };

// Where on the screen a step counts as "being read".
function readingLine() {
  const wide = window.matchMedia("(min-width: 64rem)").matches;
  if (wide) return { wide, line: window.innerHeight * 0.55 };
  const stageBottom = document.querySelector(".wl-stage")?.getBoundingClientRect().bottom ?? window.innerHeight * 0.5;
  return { wide, line: stageBottom + (window.innerHeight - stageBottom) * 0.4 };
}

export function WelcomeExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null), sceneRef = useRef<WelcomeScene | null>(null), stepsRef = useRef<HTMLDivElement>(null);
  const [hazardId, setHazardId] = useState<HazardId>("cyclone");
  const [active, setActive] = useState(0);
  const [webgl, setWebgl] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const hazard = HAZARDS.find(item => item.id === hazardId) ?? HAZARDS[0];

  useEffect(() => {
    const canvas = canvasRef.current, steps = stepsRef.current;
    if (!canvas || !steps) return;
    const scene = startWelcomeScene(canvas, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    sceneRef.current = scene;
    if (!scene) setWebgl(false);
    let queued = 0;
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
      scene?.setStage(settled); setActive(Math.round(settled));
    };
    const onScroll = () => { if (!queued) queued = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll); measure();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(queued); scene?.dispose(); sceneRef.current = null; };
  }, []);

  useEffect(() => { sceneRef.current?.setHazard(hazardId); }, [hazardId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }).then(response => response.json())
      .then((value: Partial<Session>) => setSession({ authenticated: value.authenticated === true, configured: value.configured === true }))
      .catch(() => { if (!controller.signal.aborted) setSession({ authenticated: false, configured: false }); });
    return () => controller.abort();
  }, []);

  const goTo = useCallback((stage: number) => {
    const block = stepsRef.current?.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
    if (!block) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const box = block.getBoundingClientRect(), { line, wide } = readingLine();
    const top = window.scrollY + (wide ? box.top + box.height / 2 - line : box.top - line + 28);
    window.scrollTo({ top: Math.max(0, top), behavior: calm ? "auto" : "smooth" });
  }, []);

  const hazardPicker = (label: string) => (
    <div className="wl-hazards" role="group" aria-label={label}>
      <span>{label}</span>
      {HAZARDS.map(item => <button key={item.id} type="button" aria-pressed={item.id === hazardId} onClick={() => setHazardId(item.id)}>{item.label}</button>)}
    </div>
  );

  return (
    <div className="wl">
      <header className="wl-top">
        <div className="wl-wrap">
          <Link href="/welcome" className="wl-mark" aria-label="AEGIS, about this project"><span><Command size={18} aria-hidden="true" /></span>AEGIS</Link>
          <nav aria-label="Main">
            <Link href="/alert-journey" className="wl-hide-s">Alert Journey</Link>
            <Link href="/" className="wl-hide-s">Command Center</Link>
            <Link href={session?.authenticated ? "/approvals" : "/sign-in"} className="wl-in">{session?.authenticated ? "Open workbench" : "Sign in"}</Link>
          </nav>
        </div>
      </header>

      <main>
        <div className="wl-story">
          <div className="wl-stage" aria-hidden="true">
            {webgl ? <canvas ref={canvasRef} /> : <div className="wl-stage-fallback"><div /></div>}
            <div className="wl-rail">
              {STEPS.map((step, index) => <button key={step.rail} type="button" tabIndex={-1} aria-current={active === index + 1 ? "step" : undefined} onClick={() => goTo(index + 1)}>{index + 1}<span>{step.rail}</span></button>)}
            </div>
          </div>

          <div className="wl-steps" ref={stepsRef}>
            <section className="wl-hero" data-stage="0" aria-labelledby="wl-title">
              <h1 id="wl-title">From the first signal to a warning people can trust</h1>
              <p>AEGIS is a decision desk for India’s disaster agencies. It gathers the evidence, estimates the risk, and makes sure two accountable officers approve an alert before it goes to the official channel.</p>
              <div className="wl-actions">
                <Link href="/alert-journey" className="wl-btn wl-solid"><Satellite size={18} aria-hidden="true" />Watch an alert travel</Link>
                <Link href="/" className="wl-btn wl-ghost">Open the Command Center</Link>
              </div>
              {hazardPicker("Follow a")}
              <p className="wl-note">This is a prototype for rehearsal. Everything shown uses synthetic exercise data. AEGIS does not send warnings.</p>
            </section>

            {STEPS.map((step, index) => (
              <section key={step.title} className="wl-step" data-stage={index + 1} aria-labelledby={`wl-step-${index}`}>
                <span className="wl-step-n">Step {index + 1} of {STEPS.length}</span>
                <h2 id={`wl-step-${index}`}>{step.title}</h2>
                <p>{step.text(hazard)}</p>
                <div className="wl-split">
                  <div><Bot size={20} color="#1f6fb5" aria-hidden="true" /><span><b>AI helps: </b>{step.ai}</span></div>
                  <div><UserCheck size={20} color="#17803d" aria-hidden="true" /><span><b>People decide: </b>{step.people}</span></div>
                </div>
                {index < 2 && hazardPicker("Showing")}
              </section>
            ))}
          </div>
        </div>

        <section className="wl-band wl-paper" aria-labelledby="wl-why">
          <div className="wl-wrap">
            <h2 id="wl-why">Why this was built</h2>
            <p className="wl-lede">Few countries face as many kinds of hazard as India. The hours before a disaster are when a clear, trusted warning saves the most lives, and they are also when information is most scattered.</p>
            <dl className="wl-figures">{FIGURES.map(figure => <div key={figure.value}><dt>{figure.value}</dt><dd>{figure.text}</dd></div>)}</dl>
            <p className="wl-source">Figures: National Disaster Management Authority, vulnerability profile of India. Confirm against ndma.gov.in before quoting.</p>
          </div>
        </section>

        <section className="wl-band" aria-labelledby="wl-who">
          <div className="wl-wrap">
            <h2 id="wl-who">Who it helps, and how</h2>
            <div className="wl-people">
              {PEOPLE.map(group => (
                <article key={group.who}>
                  <header><group.icon size={28} aria-hidden="true" /><h3>{group.who}</h3></header>
                  <div><h4>Without a shared desk</h4><ul>{group.today.map(line => <li key={line}>{line}</li>)}</ul></div>
                  <div><h4>With AEGIS</h4><ul>{group.with.map(line => <li key={line}>{line}</li>)}</ul></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="wl-band wl-paper" aria-labelledby="wl-ai">
          <div className="wl-wrap">
            <h2 id="wl-ai">What the AI does, and what it is never allowed to do</h2>
            <p className="wl-lede">AI is used to read, compare and explain. Decisions and warnings stay with named officers.</p>
            <div className="wl-two">
              <div className="wl-ai">
                <h3>AI helps with</h3>
                <ul>
                  {["Watching many sources at once and flagging stale or conflicting ones", "Estimating how unusual a rainfall, river level or heat forecast is, with a range", "Citing the exact records behind every statement", "Saying “not enough evidence” instead of guessing", "Suggesting where teams could wait, and drafting a shift handover", "Answering an officer’s questions from validated records only"].map(line => <li key={line}><Check size={20} aria-hidden="true" /><span>{line}</span></li>)}
                </ul>
              </div>
              <div className="wl-never">
                <h3>AEGIS never</h3>
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
          <div className="wl-wrap">
            <h2 id="wl-chain">How a warning reaches a phone</h2>
            <p className="wl-lede">AEGIS prepares and hands over. The official channel warns. The line between the two is deliberate.</p>
            <ol className="wl-chain">
              {CHAIN.map((node, index) => node
                ? <li key={node.title} className={node.outside ? "wl-outside" : undefined} style={{ ["--i" as string]: index }}><span><node.icon size={22} aria-hidden="true" /></span><div><b>{node.title}</b><small>{node.text}</small></div></li>
                : <li key="gate" className="wl-gate"><p><FileCheck2 size={18} aria-hidden="true" style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />AEGIS stops here. Only an approved draft crosses.</p></li>)}
            </ol>
          </div>
        </section>

        <section className="wl-band" aria-labelledby="wl-tech">
          <div className="wl-wrap">
            <h2 id="wl-tech">How it is built</h2>
            <div className="wl-tech">
              <div>
                <p className="wl-lede" style={{ marginTop: 0 }}>Open, widely used components that a government team can audit, host in India and maintain.</p>
              </div>
              <dl>
                <div><dt>Sign-in</dt><dd>The agency’s own identity provider (OpenID Connect). AEGIS never sees a password. Role and agency come from the signed token.</dd></div>
                <div><dt>Approval</dt><dd>Maker and checker must be different people, enforced on the server and recorded in an audit trail.</dd></div>
                <div><dt>Privacy</dt><dd>The browser talks only to the AEGIS server. Outside map and data sources never see who is looking.</dd></div>
                <div><dt>Maps and 3D</dt><dd>PostGIS for geography, MapLibre for maps, three.js for the 3D views.</dd></div>
                <div><dt>Application</dt><dd>Next.js and React in the browser, Python FastAPI services, PostgreSQL database, Docker containers.</dd></div>
                <div><dt>Standards</dt><dd>Alerts are drafted in the Common Alerting Protocol used by national alerting systems.</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section className="wl-band wl-paper" aria-labelledby="wl-status">
          <div className="wl-wrap wl-status">
            <div>
              <h2 id="wl-status">Where the project stands</h2>
              <ul>
                <li>A working prototype that runs complete rehearsals on synthetic data.</li>
                <li>Not yet audited, hosted or approved for operational use.</li>
                <li>Official data agreements, a security audit and accessibility certification come first.</li>
              </ul>
            </div>
            <div className="wl-actions">
              <Link href="/demo" className="wl-btn wl-solid">Take the guided exercise</Link>
              <Link href="/admin/go-live" className="wl-btn wl-ghost">See what going live needs</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="wl-foot">
        <div className="wl-wrap">
          <span>AEGIS, exercise prototype. Synthetic data. Not a warning service.</span>
          <span>The globe is an illustration, not a map of record or a depiction of boundaries.</span>
        </div>
      </footer>
    </div>
  );
}
