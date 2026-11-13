// The shared Earth used by the two public pages (landing and sign-in): India as its own weather satellites see it.
// An illustration, not data: NASA Blue Marble / Black Marble imagery (self-hosted, bundled as build assets, never
// fetched from another host), a simplified outline of India, procedural cloud, and a daylight line computed from the
// visitor's clock. Nothing here reads an IndTrana record. Sources and licences: research/real-data/LICENCES.md.
import * as THREE from "three";

import dayGlobal from "./assets/earth-day.jpg";
import dayIndia from "./assets/earth-day-india.jpg";
import nightGlobal from "./assets/earth-night.jpg";
import nightIndia from "./assets/earth-night-india.jpg";
import { subsolar } from "./sun";
import { INDIA_ISLANDS, INDIA_ISLETS, INDIA_MAINLAND, type LonLat } from "./india-outline";

/* eslint-disable @typescript-eslint/no-explicit-any -- three@0.128 ships no type declarations */
export type Vec = any;
export type Obj = any;
export type Keep = <T extends { dispose: () => void }>(item: T) => T;

export const RAD = Math.PI / 180, R = 3;
/** Where the camera rests: the middle of India. */
export const INDIA_CENTRE: LonLat = [79, 22];
// The high-detail imagery and the outline cover this window (degrees). Must match the asset build.
const REGION = { west: 49, south: -8, span: 60 };

export function onSphere(lon: number, lat: number, radius: number): Vec {
  const phi = (90 - lat) * RAD, theta = (lon + 180) * RAD;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}
/** The globe rotation (about Y) that turns a longitude to face the camera. */
export function facing(lon: number) { return (-lon - 90) * RAD; }
export const smooth = (edge0: number, edge1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/** A soft round sprite so points draw as discs instead of squares. Generated in memory; nothing is fetched. */
export function roundSprite(keep: Keep, soft = false) {
  const size = 64, canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)"); gradient.addColorStop(soft ? 0.25 : 0.72, "rgba(255,255,255,1)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  }
  return keep(new THREE.CanvasTexture(canvas));
}

/** A renderer on this canvas, or null when the browser has no WebGL. Asking the canvas first keeps the console quiet. */
export function createRenderer(canvas: HTMLCanvasElement, maxPixelRatio: number): any | null {
  const options = { alpha: true, antialias: true, powerPreference: "default" as const };
  try {
    const context = canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options);
    if (!context) return null;
    const renderer = new THREE.WebGLRenderer({ canvas, context, ...options });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setClearColor(0x000000, 0);
    return renderer;
  } catch { return null; }
}

/** Draws only while the canvas is on screen and the tab is visible. Still mode draws single frames on request. */
export function frameLoop(canvas: HTMLCanvasElement, still: boolean, draw: (now: number) => void) {
  let frame = 0, alive = true, onScreen = true;
  const tick = (now: number) => { frame = 0; if (!alive) return; draw(now); if (!still && onScreen && !document.hidden) frame = requestAnimationFrame(tick); };
  const wake = () => { if (alive && !frame && (still || (onScreen && !document.hidden))) frame = requestAnimationFrame(tick); };
  const watcher = new IntersectionObserver(entries => { onScreen = entries[entries.length - 1].isIntersecting; if (!still) wake(); });
  watcher.observe(canvas); document.addEventListener("visibilitychange", wake); wake();
  return { wake, stop() { alive = false; cancelAnimationFrame(frame); watcher.disconnect(); document.removeEventListener("visibilitychange", wake); } };
}

const EARTH_VERTEX = `
varying vec2 vUv; varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewP;
void main(){ vUv = uv; vObj = normalize(position); vViewN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vViewP = mv.xyz; gl_Position = projectionMatrix * mv; }`;

// Day and night imagery, a sharper inset over South Asia, India's outline, moving cloud, and two hazard pictures that
// belong in the sky rather than on top of it: a turning cyclone and a heat dome.
const EARTH_FRAGMENT = `
uniform sampler2D tDay; uniform sampler2D tDayIn; uniform sampler2D tNight; uniform sampler2D tNightIn; uniform sampler2D tOver;
uniform vec3 uSun; uniform float uTime; uniform float uReady; uniform float uScan; uniform float uCloud; uniform float uFocus;
uniform vec4 uCyclone; uniform vec4 uHeat; uniform vec3 uRegion;
varying vec2 vUv; varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewP;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
void main(){
  vec3 n = normalize(vObj);
  float lon = vUv.x * 360.0 - 180.0; float lat = vUv.y * 180.0 - 90.0;
  vec2 r = vec2((lon - uRegion.x) / uRegion.z, (lat - uRegion.y) / uRegion.z);
  vec2 edge = min(r, 1.0 - r); float inside = smoothstep(0.0, 0.05, min(edge.x, edge.y));
  vec2 rc = clamp(r, 0.0, 1.0);
  vec3 day = mix(texture2D(tDay, vUv).rgb, texture2D(tDayIn, rc).rgb, inside);
  vec3 night = mix(texture2D(tNight, vUv).rgb, texture2D(tNightIn, rc).rgb, inside);
  vec3 over = texture2D(tOver, rc).rgb * inside;
  float line = over.r; float glow = over.g; float mask = over.b;

  // India keeps its full colour; everything around it steps back a little.
  float lum = dot(day, vec3(0.3, 0.59, 0.11));
  day = mix(mix(vec3(lum), day, 1.0 - 0.3 * uFocus) * (1.0 - 0.2 * uFocus), day * 1.1, mask);

  float sun = dot(n, normalize(uSun)); float dayK = smoothstep(-0.16, 0.3, sun);

  // Cloud: slow drifting noise, thinned over India so the outline stays readable.
  vec3 q = n * 3.1 + vec3(uTime * 0.011, 0.0, uTime * 0.007);
  q += 0.4 * vec3(noise(n * 5.0 + uTime * 0.02), noise(n * 5.0 + 7.3), noise(n * 5.0 + 3.1 - uTime * 0.015));
  float cloud = smoothstep(0.5, 0.8, fbm(q)) * 0.8 * (1.0 - 0.6 * mask) * uCloud;

  // Cyclone: a two-armed spiral turning anticlockwise, as storms do north of the equator.
  vec3 cc = normalize(uCyclone.xyz); vec3 off = n - cc * dot(n, cc);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), cc)); vec3 north = cross(cc, east);
  float rad = length(n - cc) / 0.105; float ang = atan(dot(off, north), dot(off, east));
  float arms = 0.5 + 0.5 * cos(2.0 * ang + 5.2 * log(rad + 0.06) - uTime * 0.55);
  float storm = (exp(-rad * rad * 0.8) * (0.25 + 0.75 * arms * arms) + 0.75 * exp(-rad * rad * 7.0)) * smoothstep(0.045, 0.15, rad);
  storm *= (0.72 + 0.5 * noise(n * 46.0 + uTime * 0.05)) * uCyclone.w;
  float stormK = clamp(storm * 1.3, 0.0, 1.0); cloud = max(cloud, stormK);

  // Heat dome: land glows warm and shimmers.
  float hd = length(n - normalize(uHeat.xyz)) / 0.17;
  float heat = exp(-hd * hd) * uHeat.w * (0.5 + 0.12 * sin(uTime * 1.3) + 0.3 * noise(n * 34.0 + vec3(0.0, uTime * 0.35, 0.0))) * (0.25 + 0.75 * mask);

  vec3 dark = day * vec3(0.25, 0.31, 0.5) + day * mask * 0.2 + night * vec3(1.0, 0.8, 0.52) * 1.7 * (1.0 - cloud);
  vec3 col = mix(dark, day, dayK);
  col = mix(col, col * vec3(1.2, 0.72, 0.42) + vec3(0.42, 0.12, 0.0), clamp(heat, 0.0, 0.85));
  col = mix(col, vec3(0.16, 0.2, 0.3) + vec3(0.84, 0.8, 0.7) * max(dayK, 0.62 * stormK), cloud * 0.9);

  // Graticule every ten degrees, and the imager's scan passing north to south.
  vec2 g = vec2(lon, lat) / 10.0; vec2 gw = fwidth(g);
  vec2 gl = 1.0 - smoothstep(vec2(0.0), gw * 1.6, abs(fract(g - 0.5) - 0.5));
  col += vec3(0.55, 0.72, 1.0) * max(gl.x * step(gw.x, 0.2), gl.y) * 0.085;
  float band = exp(-pow((lat - uScan) / 1.4, 2.0)); float lead = exp(-pow((lat - uScan) / 0.16, 2.0));
  col += vec3(0.5, 0.78, 1.0) * (band * 0.09 + lead * 0.2) * inside;

  col += vec3(1.0, 0.56, 0.1) * glow * 0.6; col = mix(col, vec3(1.0, 0.8, 0.46), line);

  float rim = 1.0 - max(dot(normalize(vViewN), normalize(-vViewP)), 0.0);
  col += vec3(0.28, 0.52, 1.0) * pow(rim, 2.4) * (0.3 + 0.7 * dayK);
  vec3 bare = vec3(0.03, 0.07, 0.2) + vec3(1.0, 0.56, 0.1) * glow * 0.6; bare = mix(bare, vec3(1.0, 0.8, 0.46), line) + vec3(0.28, 0.52, 1.0) * pow(rim, 2.4) * 0.6;
  gl_FragColor = vec4(mix(bare, col, uReady), 1.0);
}`;

const HALO_VERTEX = "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const HALO_FRAGMENT = "uniform vec3 tint; uniform float strength; varying vec3 vN; void main(){ float k = clamp(-normalize(vN).z / 0.62, 0.0, 1.0); gl_FragColor = vec4(tint, pow(k, 3.0) * strength); }";

/** India's outline as a texture over the detail window: red = line, green = glow, blue = inside India. */
function outlineTexture(keep: Keep, size: number) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const context = canvas.getContext("2d"), texture = keep(new THREE.CanvasTexture(canvas));
  if (!context) return texture;
  const x = (lon: number) => (lon - REGION.west) / REGION.span * size, y = (lat: number) => (REGION.south + REGION.span - lat) / REGION.span * size;
  const trace = () => {
    context.beginPath();
    for (const ring of [INDIA_MAINLAND, ...INDIA_ISLANDS]) { ring.forEach((p, i) => (i ? context.lineTo(x(p[0]), y(p[1])) : context.moveTo(x(p[0]), y(p[1])))); context.closePath(); }
  };
  const unit = size / 2048;
  context.fillStyle = "#000"; context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = "lighter"; context.lineJoin = "round";
  trace(); context.fillStyle = "#0000ff"; context.fill();
  context.shadowColor = "#00ff00"; context.shadowBlur = 20 * unit; context.strokeStyle = "#00ff00"; context.lineWidth = 5 * unit; trace(); context.stroke();
  context.shadowBlur = 0; context.strokeStyle = "#ff0000"; context.lineWidth = 2.8 * unit; trace(); context.stroke();
  // Islands too small for an outline are still marked, so both island territories are present.
  for (const p of INDIA_ISLETS) { context.beginPath(); context.arc(x(p[0]), y(p[1]), 2.4 * unit, 0, Math.PI * 2); context.fillStyle = "#ff6000"; context.fill(); }
  texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

export type IndiaGlobe = {
  /** Turns with the Earth. Put anything that belongs to a place on the ground in here. */
  globe: Obj;
  halo: Obj;
  uniforms: Record<string, { value: any }>;
  /** Advance cloud, the scan line and the daylight line. `time` is seconds of animation. */
  update: (time: number, delta: number) => void;
};
export type GlobeOptions = { still: boolean; cloud?: number; focus?: number; scanEvery?: number; onChange: () => void; onReady: () => void };

export function buildIndiaGlobe(keep: Keep, renderer: any, options: GlobeOptions): IndiaGlobe {
  const blank = (r: number, g: number, b: number) => { const t = keep(new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat)); t.needsUpdate = true; return t; };
  const small = Math.min(window.screen.width, window.screen.height) < 700;
  const uniforms: Record<string, { value: any }> = {
    tDay: { value: blank(8, 20, 52) }, tDayIn: { value: blank(8, 20, 52) }, tNight: { value: blank(0, 0, 0) }, tNightIn: { value: blank(0, 0, 0) },
    tOver: { value: outlineTexture(keep, small ? 1536 : 2048) },
    uSun: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uReady: { value: 0 }, uScan: { value: -200 },
    uCloud: { value: options.cloud ?? 1 }, uFocus: { value: options.focus ?? 1 },
    uCyclone: { value: new THREE.Vector4(0, 1, 0, 0) }, uHeat: { value: new THREE.Vector4(0, 1, 0, 0) },
    uRegion: { value: new THREE.Vector3(REGION.west, REGION.south, REGION.span) },
  };
  const globe = new THREE.Group();
  const material = keep(new THREE.ShaderMaterial({ uniforms, vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT, extensions: { derivatives: true } }));
  globe.add(new THREE.Mesh(keep(new THREE.SphereGeometry(R, 128, 96)), material));
  const halo = new THREE.Mesh(keep(new THREE.SphereGeometry(R * 1.16, 72, 48)), keep(new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(0x5b9dff) }, strength: { value: 0.75 } }, vertexShader: HALO_VERTEX, fragmentShader: HALO_FRAGMENT,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // Imagery arrives after first paint. Until the two daytime pictures are in, the globe is a dark sea with the outline.
  let alive = true, pending = 2, ready = false, readyAt = -1;
  keep({ dispose() { alive = false; } });
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loader = new THREE.TextureLoader();
  const load = (name: string, url: string, needed: boolean) => loader.load(url, (texture: any) => {
    if (!alive) { texture.dispose(); return; }
    keep(texture); texture.anisotropy = anisotropy; uniforms[name].value = texture;
    if (needed && --pending === 0) { ready = true; options.onReady(); }
    options.onChange();
  }, undefined, () => { if (alive && needed && !ready) { ready = true; options.onReady(); options.onChange(); } });
  load("tDay", dayGlobal.src, true); load("tDayIn", dayIndia.src, true); load("tNight", nightGlobal.src, false); load("tNightIn", nightIndia.src, false);

  const every = options.scanEvery ?? 11;
  let sunAt = 0;
  const placeSun = () => { const s = subsolar(new Date()); uniforms.uSun.value.copy(onSphere(s[0], s[1], 1)); };
  placeSun();
  return {
    globe, halo, uniforms,
    update(time, delta) {
      uniforms.uTime.value = time;
      if (ready) { if (readyAt < 0) readyAt = time; uniforms.uReady.value = options.still ? 1 : Math.min(1, uniforms.uReady.value + delta * 1.6); }
      // One imager pass from 46N down to the equator, then a rest.
      const pass = (time % every) / 5.5;
      uniforms.uScan.value = options.still || pass > 1 ? -200 : 46 - pass * 50;
      if (time - sunAt > 30) { sunAt = time; placeSun(); }
    },
  };
}

/** Distant stars on a shell around the scene. */
export function buildStars(keep: Keep, count: number) {
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 12543.123 % 1, Math.sin(i * 39.425) * 9631.77 % 1).normalize().multiplyScalar(46 + (i % 23));
    points.push(v.x, v.y, -Math.abs(v.z) - 8);
  }
  const geometry = keep(new THREE.BufferGeometry()); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.Points(geometry, keep(new THREE.PointsMaterial({ color: 0xcfdcff, size: 1.7, sizeAttenuation: false, map: roundSprite(keep), transparent: true, opacity: 0.6, depthWrite: false })));
}

/** A small text label that always faces the camera. Drawn to a canvas, so no font file is fetched. */
export function textLabel(keep: Keep, text: string, onChange: () => void, align: "left" | "right" | "center" = "left") {
  const canvas = document.createElement("canvas"); canvas.width = 384; canvas.height = 64;
  const texture = keep(new THREE.CanvasTexture(canvas));
  const paint = () => {
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '600 30px "Anek Latin Variable", ui-sans-serif, system-ui, sans-serif'; context.textBaseline = "middle"; context.textAlign = align;
    context.shadowColor = "rgba(3,8,28,.95)"; context.shadowBlur = 8; context.fillStyle = "#eaf1ff";
    const x = align === "left" ? 8 : align === "right" ? canvas.width - 8 : canvas.width / 2;
    context.fillText(text, x, 34); context.fillText(text, x, 34);
    texture.needsUpdate = true; onChange();
  };
  paint();
  // Repaint once the page font is in, so the label matches the rest of the page.
  document.fonts?.load('600 30px "Anek Latin Variable"').then(paint).catch(() => undefined);
  const material = keep(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
  const sprite = new THREE.Sprite(material); sprite.scale.set(1.02, 0.17, 1); sprite.center.set(0, 0.5);
  return sprite;
}

export type Orbiters = { materials: Array<{ material: { opacity: number }; base: number }>; insat: Array<{ craft: Obj; at: Vec }>; update: (time: number) => void };
/**
 * India's two geostationary weather satellites, INSAT-3DR (74E) and INSAT-3DS (82E), which stay over the same
 * longitude, and one polar-orbiting satellite. Heights are drawn far lower than the real 35,786 km so they fit.
 */
export function buildOrbiters(keep: Keep, globe: Obj, world: Obj, onChange: () => void, withInsat = true): Orbiters {
  const materials: Orbiters["materials"] = [];
  const track = <T extends { opacity: number }>(material: T, base: number) => { materials.push({ material, base }); return material; };
  const line = (colour: number, base: number) => track(keep(new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0 })), base);
  const flat = (colour: number, base: number) => track(keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })), base);
  const GEO = R * 1.18, LEO = R * 1.09;
  // The geostationary belt above the equator, as an arc over the Indian Ocean.
  const belt: Vec[] = []; for (let lon = 28; lon <= 128; lon += 2) belt.push(onSphere(lon, 0, GEO));
  if (withInsat) globe.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(belt)), line(0x9cc4ff, 0.34)));
  const craftGeometry = keep(new THREE.BoxGeometry(0.05, 0.05, 0.07)), panelGeometry = keep(new THREE.PlaneGeometry(0.24, 0.05));
  const insat = (withInsat ? [{ name: "INSAT-3DR  74°E", lon: 74 }, { name: "INSAT-3DS  82°E", lon: 82 }] : []).map((item, index) => {
    const craft = new THREE.Group(); craft.position.copy(onSphere(item.lon, 0, GEO)); craft.lookAt(0, 0, 0); globe.add(craft);
    craft.add(new THREE.Mesh(craftGeometry, flat(0xffffff, 1)));
    craft.add(new THREE.Mesh(panelGeometry, flat(0x6fb4ff, 0.95)));
    const label = textLabel(keep, item.name, onChange, "center"); track(label.material, 0.92);
    // The first label sits above its satellite and the second below, so the two never overlap.
    label.center.set(0.5, index ? 1.45 : -0.45); craft.add(label);
    return { craft, at: new THREE.Vector3() };
  });
  // A polar orbiter crossing north to south.
  const polar = new THREE.Group(); polar.rotation.set(0, 0.5, 82 * RAD); world.add(polar);
  const ring: Vec[] = []; for (let a = 0; a <= 160; a++) ring.push(new THREE.Vector3(Math.cos(a / 160 * Math.PI * 2) * LEO, 0, Math.sin(a / 160 * Math.PI * 2) * LEO));
  polar.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(ring)), line(0x9cc4ff, 0.22)));
  const orbiter = new THREE.Group(); polar.add(orbiter);
  orbiter.add(new THREE.Mesh(craftGeometry, flat(0xffffff, 1))); orbiter.add(new THREE.Mesh(panelGeometry, flat(0x6fb4ff, 0.9)));
  return {
    materials, insat,
    update(time) { const angle = time * 0.16 + 1.1; orbiter.position.set(Math.cos(angle) * LEO, 0, Math.sin(angle) * LEO); orbiter.lookAt(0, 0, 0); },
  };
}
