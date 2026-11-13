"use client";

// Alert Journey: one immersive page with two modes.
//  - "exercise": the synthetic cyclone-flood walk-through (no external data).
//  - "live": opt-in, read-only public data (real Earth, weather, satellites, maps). Nothing is sent or stored.
// React owns the page shell, the mode and navigation; the three.js engine fills the marked containers.
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import type { JourneyMode } from "./engine-loader";
import "./alert-journey.css";

function ExerciseShell() {
  return <>
    <canvas id="gl" aria-label="Interactive 3D illustration of a synthetic cyclone-flood exercise: Earth, India, satellites, a river city, cell towers, residents and response teams" />
    <div id="labels" data-aj-fill />
    <div id="vignette" />
    <header id="top" className="hud" data-aj-fill />
    <div id="emBanner" className="hud" role="status" data-aj-fill />
    <div id="kpis" className="hud" role="group" tabIndex={0} aria-label="Live indicators" data-aj-fill />
    <aside id="layers" className="hud" aria-label="Layers and cameras" data-aj-fill />
    <div id="minimapWrap" className="hud" aria-label="Minimap" data-aj-fill />
    <aside id="side" className="hud" aria-label="Story, AI copilot, teams, network and inspector" data-aj-fill />
    <div id="phoneW" className="hud" data-aj-fill />
    <div id="diveHint" className="hud">
      <button className="btn big primary" id="diveBtn" type="button">Dive to the region ▸</button>
      <small>Drag to spin the globe. Press Play for the 4-day story, or dive in and explore.</small>
    </div>
    <footer id="dock" className="hud" aria-label="Timeline" data-aj-fill />
    <div id="tip" aria-hidden="true" data-aj-fill />
    <div id="toasts" aria-live="polite" data-aj-fill />
    <div id="fade" />
    <div id="reality" className="modal" role="dialog" aria-modal="true" aria-label="Reality check" data-aj-fill />
    <div id="help" className="modal" role="dialog" aria-modal="true" aria-label="Help" data-aj-fill />
    <div id="quality" className="modal" role="dialog" aria-modal="true" aria-label="Display settings" data-aj-fill />
    <div id="decision" className="modal" role="dialog" aria-modal="true" aria-label="Decision needed" data-aj-fill />
    <div id="nogl"><div><h2>3D view unavailable</h2><p>WebGL could not start. The timeline, AI copilot, teams and reality-check panels still work.</p></div></div>
  </>;
}

function LiveShell() {
  return <>
    <canvas id="gl" aria-label="Interactive 3D real Earth and real places built from public data" />
    <div id="labels" data-aj-fill />
    <header id="top" className="hud" data-aj-fill />
    <div id="kpis" className="hud" role="group" tabIndex={0} aria-label="Live indicators" data-aj-fill />
    <aside id="layers" className="hud" aria-label="Layers and cameras" data-aj-fill />
    <aside id="side" className="hud" aria-label="Incidents, place, flood statistics, impact, comms, satellites, sources" data-aj-fill />
    <div id="wxchip" className="hud" aria-live="polite" data-aj-fill />
    <div id="goLive" className="hud on">
      <button className="btn big primary" type="button">Connect the real Earth ▸</button>
      <small>Opt-in · read-only public data · nothing is sent or written</small>
    </div>
    <footer id="dock" className="hud" aria-label="Time controls" data-aj-fill />
    <div id="attr" className="hud" data-aj-fill />
    <nav id="guide" className="hud" aria-label="Guided steps" data-aj-fill />
    <div id="txlog" className="hud" role="log" aria-label="Recent data transmissions" data-aj-fill />
    <button id="compass" className="hud" type="button" aria-label="Compass: face north" data-aj-fill />
    <div id="scalebar" className="hud" aria-hidden="true" data-aj-fill />
    <div id="busy" className="hud" role="status" data-aj-fill />
    <div id="tip" aria-hidden="true" data-aj-fill />
    <div id="toasts" aria-live="polite" data-aj-fill />
    <div id="fade" />
    <div id="consent" className="modal" role="dialog" aria-modal="true" aria-label="Connect live data" data-aj-fill />
    <div id="help" className="modal" role="dialog" aria-modal="true" aria-label="Help" data-aj-fill />
    <div id="sources" className="modal" role="dialog" aria-modal="true" aria-label="Live data sources" data-aj-fill />
    <div id="nogl"><div><h2>3D view unavailable</h2><p>WebGL could not start. The data panels still work once live data is on.</p></div></div>
  </>;
}

export function AlertJourney({ initialMode }: { initialMode: JourneyMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<JourneyMode>(initialMode);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // A layout effect, so the engine is disposed in the same commit that removes its DOM (no stray animation frame).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    setFailure(null); setLoading(true);
    import("./engine-loader").then(({ mountAlertJourney }) => {
      if (cancelled) return;
      dispose = mountAlertJourney(mode, root); setLoading(false);
    }).catch((error: unknown) => {
      if (!cancelled) setLoading(false);
      if (!cancelled) setFailure(error instanceof Error ? error.message : "The 3D engine could not start.");
    });
    return () => { cancelled = true; dispose?.(); };
  }, [mode]);

  const switchMode = useCallback((next: JourneyMode) => {
    // Mode-specific deep-link parameters are dropped so one engine never reads the other's settings.
    window.history.replaceState(null, "", next === "live" ? "?mode=live" : window.location.pathname);
    setMode(next);
  }, []);

  // The engine renders plain links for "switch mode" and "back to IndTrana"; React handles them without a page reload.
  const onClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const modeLink = event.target.closest<HTMLElement>("[data-aj-mode]");
    if (modeLink) { event.preventDefault(); switchMode(modeLink.dataset.ajMode === "live" ? "live" : "exercise"); return; }
    if (event.target.closest("[data-aj-exit]")) { event.preventDefault(); router.push("/"); }
  }, [router, switchMode]);

  return (
    <div onClick={onClick}>
      <h1 className="sr-only">Alert Journey: how a hazard becomes an official warning. Exercise only.</h1>
      {/* The key gives each mode a brand-new DOM subtree for its engine. */}
      <div key={mode} ref={rootRef} className="aj-root">
        {mode === "live" ? <LiveShell /> : <ExerciseShell />}
        {loading && <div className="aj-loading" role="status"><div className="spin" /><span>Loading the 3D engine…</span></div>}
        {failure && <p role="alert" style={{ position: "fixed", inset: "auto 16px 16px 16px", zIndex: 70, padding: 12, borderRadius: 12, background: "#3a0d14", color: "#ffd9dd" }}>Alert Journey could not start: {failure}</p>}
      </div>
    </div>
  );
}
