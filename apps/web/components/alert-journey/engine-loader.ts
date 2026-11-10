// Mounts one Alert Journey engine (synthetic exercise or Live Earth) into the React-rendered shell and returns a
// dispose function. Every mount builds fresh engine state, so switching modes or leaving the page leaks nothing.
import * as THREE from "three";
import * as satellite from "satellite.js";

import installCore from "./engine/explainer-core.js";
import installStory from "./engine/explainer-story.js";
import installGfx from "./engine/explainer-gfx.js";
import installEnv from "./engine/explainer-env.js";
import installPlaces from "./engine/explainer-places.js";
import installActors from "./engine/explainer-actors.js";
import installSpace from "./engine/explainer-space.js";
import installUi from "./engine/explainer-ui.js";
import installMain from "./engine/explainer-main.js";
import installModel from "./engine/live-model.js";
import installData from "./engine/live-data.js";
import installGlobe from "./engine/live-globe.js";
import installPlace from "./engine/live-place.js";
import installPanels from "./engine/live-panels.js";
import installLiveUi from "./engine/live-ui.js";
import installLiveMain from "./engine/live-main.js";

export type JourneyMode = "exercise" | "live";
type Installer = (g: unknown) => void;
type EngineScope = {
  alive: boolean; root: HTMLElement; disposers: Array<() => void>;
  on: (target: EventTarget, type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => void;
  bootExercise?: () => void; bootLive?: () => void;
};

const EXERCISE: Installer[] = [installCore, installStory, installGfx, installEnv, installPlaces, installActors, installSpace, installUi, installMain];
const LIVE: Installer[] = [installCore, installGfx, installModel, installData, installGlobe, installPlace, installPanels, installLiveUi, installLiveMain];

export function mountAlertJourney(mode: JourneyMode, root: HTMLElement): () => void {
  const host = window as unknown as Record<string, unknown>;
  const removers: Array<() => void> = [];
  const scope: EngineScope = {
    alive: true, root, disposers: [],
    // Engines register window/document listeners through here so they can all be removed on dispose.
    on(target, type, handler, options) { target.addEventListener(type, handler, options); removers.push(() => target.removeEventListener(type, handler, options)); },
  };
  // The engine modules are written against these three globals.
  host.AX = scope; host.THREE = THREE; host.satellite = satellite;
  root.querySelectorAll("[data-aj-fill]").forEach(element => { element.innerHTML = ""; });
  root.className = "aj-root";
  delete root.dataset.mode;
  for (const install of mode === "live" ? LIVE : EXERCISE) install(window);
  (mode === "live" ? scope.bootLive : scope.bootExercise)?.();

  return () => {
    scope.alive = false;
    removers.forEach(remove => remove());
    scope.disposers.forEach(dispose => dispose());
    // A canvas whose WebGL context was released cannot be reused, so leave a fresh one behind.
    const canvas = root.querySelector("canvas#gl");
    if (canvas) canvas.replaceWith(canvas.cloneNode(false));
    if (host.AX === scope) delete host.AX;
  };
}
