// Scroll-driven 3D illustration for the public landing page (/ when signed out, and /welcome). Decoration that
// explains the workflow: nothing here is data, a map of record, or a boundary depiction. Stage 0 is the overview;
// stages 1-6 follow the six steps of the page (sense, predict, decide, hand over, reach people, learn).
// The globe builder is shared with the sign-in page so both pages show the same object.
import * as THREE from "three";

export type HazardId = "cyclone" | "flood" | "earthquake" | "heatwave";
export type WelcomeScene = { setStage: (stage: number) => void; setHazard: (hazard: HazardId) => void; dispose: () => void };

type Vec = InstanceType<typeof THREE.Vector3>;
type Fading = { material: { opacity: number }; base: number };
type Keep = <T extends { dispose: () => void }>(item: T) => T;

export const RAD = Math.PI / 180, R = 3;
const INK = 0x0b1f5c, SAFFRON = 0xf08a1c, GREEN = 0x17803d, SEA = 0x1f6fb5, RUST = 0xc7361b;
const HAZARD_AT: Record<HazardId, [number, number]> = { cyclone: [90.4, 10.8], flood: [93.6, 27.0], earthquake: [79.5, 30.4], heatwave: [78.5, 24.5] };
const TARGET_AT: Record<HazardId, [number, number]> = { cyclone: [85.8, 20.3], flood: [90.6, 25.8], earthquake: [78.0, 29.6], heatwave: [79.1, 21.1] };
const HAZARD_COLOUR: Record<HazardId, number> = { cyclone: SAFFRON, flood: SEA, earthquake: RUST, heatwave: SAFFRON };
const DESK: [number, number] = [78.5, 17.4], AUTHORITY: [number, number] = [77.2, 28.6];
const PLACES: Array<[number, number]> = [[72.9, 19.1], [80.3, 13.1], [88.4, 22.6], [85.8, 20.3], [83.3, 17.7], [76.3, 10.0], [91.7, 26.1], [75.8, 26.9], [72.6, 23.0]];

export function onSphere(lon: number, lat: number, radius: number): Vec {
  const phi = (90 - lat) * RAD, theta = (lon + 180) * RAD;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}
// Rough, schematic test for "this dot is over the Indian subcontinent". Illustration only, not a boundary.
export function overSubcontinent(lon: number, lat: number) {
  return lat > 8 && lat < 35 && lon > 68.5 && lon < 97 && lat < 37 - Math.abs(lon - 79) * 1.25 + (lat > 22 ? 12 : 0);
}
/** The globe rotation (about Y) that turns a longitude to face the camera. */
export function facing(lon: number) { const c = onSphere(lon, 0, 1); return Math.atan2(-c.x, c.z); }
export const smooth = (edge0: number, edge1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
// 1 while the story is on this step, fading over half a step on each side.
const near = (stage: number, at: number, hold = 0.35) => 1 - smooth(hold, hold + 0.5, Math.abs(stage - at));

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

const SPHERE_VERTEX = "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const CORE_FRAGMENT = "uniform vec3 lit; uniform vec3 shade; uniform vec3 light; varying vec3 vN; void main(){ vec3 n = normalize(vN); float d = dot(n, normalize(light)); vec3 c = mix(shade, lit, smoothstep(-0.55, 0.9, d)); float rim = pow(1.0 - max(n.z, 0.0), 2.4); c = mix(c, shade, rim * 0.55); gl_FragColor = vec4(c, 1.0); }";
const HALO_FRAGMENT = "uniform vec3 tint; uniform float strength; uniform float edge; varying vec3 vN; void main(){ float k = clamp(-normalize(vN).z / edge, 0.0, 1.0); gl_FragColor = vec4(tint, pow(k, 2.2) * strength); }";

export type GlobeLook = { count: number; dot: [number, number, number]; land: [number, number, number]; lit: number; shade: number; halo: number; haloStrength: number; dotSize: number };
/** Dotted, softly lit globe with an atmosphere rim. The subcontinent is a schematic patch of warmer dots. */
export function buildGlobe(keep: Keep, look: GlobeLook) {
  const globe = new THREE.Group(), sea: number[] = [], land: number[] = [], sprite = roundSprite(keep);
  for (let i = 0; i < look.count; i++) {
    const y = 1 - (i / (look.count - 1)) * 2, lat = Math.asin(y) / RAD, lon = (((i * 2.399963) / RAD) % 360) - 180, p = onSphere(lon, lat, R * 1.002);
    (overSubcontinent(lon, lat) ? land : sea).push(p.x, p.y, p.z);
  }
  const layer = (points: number[], colour: [number, number, number], size: number) => {
    const geometry = keep(new THREE.BufferGeometry()); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    globe.add(new THREE.Points(geometry, keep(new THREE.PointsMaterial({ size, map: sprite, color: new THREE.Color(colour[0], colour[1], colour[2]), transparent: true, alphaTest: 0.3 }))));
  };
  layer(sea, look.dot, look.dotSize); layer(land, look.land, look.dotSize * 1.5);
  globe.add(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.992, 72, 48)), keep(new THREE.ShaderMaterial({
    uniforms: { lit: { value: new THREE.Color(look.lit) }, shade: { value: new THREE.Color(look.shade) }, light: { value: new THREE.Vector3(-0.55, 0.65, 0.6) } },
    vertexShader: SPHERE_VERTEX, fragmentShader: CORE_FRAGMENT,
  }))));
  const halo = new THREE.Mesh(keep(new THREE.SphereGeometry(R * 1.2, 72, 48)), keep(new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(look.halo) }, strength: { value: look.haloStrength }, edge: { value: 0.55 } },
    vertexShader: SPHERE_VERTEX, fragmentShader: HALO_FRAGMENT, side: THREE.BackSide, transparent: true, depthWrite: false,
  })));
  return { globe, halo };
}

/** A renderer on this canvas, or null when the browser has no WebGL. Asking the canvas first keeps the console quiet. */
export function createRenderer(canvas: HTMLCanvasElement, maxPixelRatio: number): InstanceType<typeof THREE.WebGLRenderer> | null {
  const options = { alpha: true, antialias: true, powerPreference: "low-power" as const };
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

export function startWelcomeScene(canvas: HTMLCanvasElement, still: boolean): WelcomeScene | null {
  const renderer = createRenderer(canvas, 1.75);
  if (!renderer) return null;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const world = new THREE.Group(); scene.add(world);
  const disposables: Array<{ dispose: () => void }> = [];
  const keep: Keep = item => { disposables.push(item); return item; };
  const groups: Record<string, Fading[]> = {};
  const fade = (name: string, material: { opacity: number }, base: number) => { const list = groups[name] ?? []; groups[name] = list; list.push({ material, base }); };
  const lineMaterial = (colour: number, group: string, base: number) => { const m = keep(new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0 })); fade(group, m, base); return m; };
  const flatMaterial = (colour: number, group: string, base: number) => { const m = keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); fade(group, m, base); return m; };

  const { globe, halo } = buildGlobe(keep, { count: 6400, dot: [0.24, 0.34, 0.6], land: [0.94, 0.54, 0.11], lit: 0xfbfcff, shade: 0xd3deef, halo: SEA, haloStrength: 0.34, dotSize: 0.04 });
  world.add(globe); world.add(halo);

  // Depth: a few still specks far around the globe, which shift with the pointer.
  const specks: number[] = [];
  for (let i = 0; i < 220; i++) { const v = new THREE.Vector3(Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 12543.123 % 1, Math.sin(i * 39.425) * 9631.77 % 1).normalize().multiplyScalar(6 + (i % 9)); specks.push(v.x, v.y, v.z - 4); }
  const speckGeometry = keep(new THREE.BufferGeometry()); speckGeometry.setAttribute("position", new THREE.Float32BufferAttribute(specks, 3));
  const speckField = new THREE.Points(speckGeometry, keep(new THREE.PointsMaterial({ color: INK, size: 2.2, sizeAttenuation: false, map: roundSprite(keep), transparent: true, opacity: 0.2, depthWrite: false })));
  scene.add(speckField);

  // Lay an object flat on the globe at a point, facing outward. Works in the globe's own frame, so it stays right
  // however the globe is turned at the time.
  const flatOn = (mesh: InstanceType<typeof THREE.Object3D>, at: Vec) => {
    const normal = at.clone().normalize(), east = new THREE.Vector3(0, 1, 0).cross(normal).normalize(), north = normal.clone().cross(east);
    mesh.position.copy(at); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal));
  };
  const arcPoints = (from: Vec, to: Vec, lift: number) => {
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(R + lift), points: Vec[] = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48, a = from.clone().lerp(mid, t), b = mid.clone().lerp(to, t); points.push(a.lerp(b, t)); }
    return points;
  };
  const arc = (from: Vec, to: Vec, lift: number, colour: number, group: string, base: number) => {
    const points = arcPoints(from, to, lift); globe.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points)), lineMaterial(colour, group, base))); return points;
  };
  const dot = (at: Vec, size: number, colour: number, group: string, parent: InstanceType<typeof THREE.Object3D> = globe) => { const m = new THREE.Mesh(keep(new THREE.SphereGeometry(size, 16, 16)), flatMaterial(colour, group, 1)); m.position.copy(at); parent.add(m); return m; };
  const ringMesh = (inner: number, outer: number, colour: number, group: string, base = 1) => new THREE.Mesh(keep(new THREE.RingGeometry(inner, outer, 64)), flatMaterial(colour, group, base));
  const along = (path: Vec[], u: number, into: Vec) => {
    const f = Math.min(1, Math.max(0, u)) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f));
    return into.copy(path[i]).lerp(path[i + 1], f - i);
  };

  // Hazard marker (moves and changes shape with the chosen hazard).
  const hazard = new THREE.Group(); globe.add(hazard);
  const hazardRings = [0, 1, 2].map(() => { const ring = ringMesh(0.11, 0.126, SAFFRON, "hazard", 0.9); hazard.add(ring); return ring; });
  // Cyclone: a slowly turning two-armed spiral.
  const spiralPoints: number[] = [];
  for (let i = 0; i < 560; i++) { const t = i / 560, a = t * 15 + (i % 2) * Math.PI, r = 0.04 + t * 0.32; spiralPoints.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
  const spiralGeometry = keep(new THREE.BufferGeometry()); spiralGeometry.setAttribute("position", new THREE.Float32BufferAttribute(spiralPoints, 3));
  const spiralMaterial = keep(new THREE.PointsMaterial({ color: INK, size: 0.034, map: roundSprite(keep), transparent: true, opacity: 0, alphaTest: 0.05 })); fade("hazard", spiralMaterial, 0.95);
  const spiral = new THREE.Points(spiralGeometry, spiralMaterial); hazard.add(spiral);
  // Earthquake: a seismograph trace across the epicentre.
  const tracePoints: Vec[] = [];
  for (let i = 0; i <= 60; i++) { const x = (i / 60 - 0.5) * 0.9, envelope = Math.exp(-Math.pow(x * 4.2, 2)); tracePoints.push(new THREE.Vector3(x, Math.sin(i * 2.1) * 0.2 * envelope * (i % 2 ? 1 : -0.8), 0.004)); }
  const trace = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(tracePoints)), lineMaterial(RUST, "hazard", 1)); hazard.add(trace);
  // Heatwave: a warm dome that breathes.
  const heat = new THREE.Mesh(keep(new THREE.CircleGeometry(0.34, 56)), flatMaterial(SAFFRON, "hazard", 0.3)); hazard.add(heat);
  // River flood: the river itself, drawn from upstream to the towns below (geometry set when the hazard is placed).
  const riverGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const river = new THREE.Line(riverGeometry, lineMaterial(SEA, "hazard", 1)); globe.add(river);
  const riverDrops = [0, 1, 2].map(() => dot(new THREE.Vector3(), 0.03, SEA, "hazard"));
  let riverPath: Vec[] = [new THREE.Vector3(), new THREE.Vector3()];

  // Step 1: satellites with readings travelling down to the hazard, and ground gauges around it.
  const beamGeometries: Array<InstanceType<typeof THREE.BufferGeometry>> = [];
  const satellites = [{ radius: 4.25, tilt: 0.55, speed: 0.42 }, { radius: 4.7, tilt: -0.85, speed: 0.3 }, { radius: 5.15, tilt: 1.2, speed: 0.22 }].map((orbit, index) => {
    const group = new THREE.Group(); group.rotation.set(orbit.tilt, index * 1.2, orbit.tilt * 0.4); world.add(group);
    const path: Vec[] = []; for (let a = 0; a <= 140; a++) path.push(new THREE.Vector3(Math.cos(a / 140 * Math.PI * 2) * orbit.radius, 0, Math.sin(a / 140 * Math.PI * 2) * orbit.radius));
    group.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(path)), lineMaterial(INK, "orbit", 0.2)));
    const craft = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.09)), flatMaterial(INK, "orbit", 1)); group.add(craft);
    const panel = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.34, 0.07)), flatMaterial(SEA, "orbit", 0.85)); craft.add(panel);
    const beam = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])); beamGeometries.push(beam);
    scene.add(new THREE.Line(beam, lineMaterial(SEA, "sense", 0.5)));
    const reading = dot(new THREE.Vector3(), 0.045, SEA, "sense", scene);
    return { ...orbit, group, craft, reading, phase: index * 2.2, at: new THREE.Vector3() };
  });
  const gauges = [0, 1, 2, 3].map(() => dot(new THREE.Vector3(), 0.032, SEA, "sense"));

  // Step 2: forecast spread (several possible tracks), a likely range and the area at risk.
  const predict = new THREE.Group(); globe.add(predict);
  const riskDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(0.2, 56)), flatMaterial(SAFFRON, "predict", 0.3)); predict.add(riskDisc);
  const riskEdge = ringMesh(0.2, 0.216, SAFFRON, "predict"); predict.add(riskEdge);
  const riskRange = ringMesh(0.3, 0.308, SAFFRON, "predict", 0.55); predict.add(riskRange);
  const trackGeometries = [-2, -1, 0, 1, 2].map(index => { const g = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])); predict.add(new THREE.Line(g, lineMaterial(INK, "predict", index === 0 ? 0.85 : 0.4))); return g; });
  const trackHead = dot(new THREE.Vector3(), 0.04, INK, "predict");
  let centreTrack: Vec[] = [new THREE.Vector3(), new THREE.Vector3()];

  // Step 3: two people, maker and checker, pass one draft across the desk; a green seal follows the second check.
  const desk = onSphere(DESK[0], DESK[1], R * 1.005), authority = onSphere(AUTHORITY[0], AUTHORITY[1], R * 1.005);
  const deskUp = desk.clone().normalize(), side = new THREE.Vector3(0, 1, 0).cross(deskUp).normalize();
  const head = (offset: number) => desk.clone().add(deskUp.clone().multiplyScalar(0.3)).add(side.clone().multiplyScalar(offset));
  const foot = (offset: number) => desk.clone().add(side.clone().multiplyScalar(offset)).normalize().multiplyScalar(R * 1.005);
  const makerAt = head(-0.3), checkerAt = head(0.3);
  dot(makerAt, 0.054, SEA, "decide"); dot(checkerAt, 0.054, INK, "decide");
  globe.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([foot(-0.3), makerAt])), lineMaterial(SEA, "decide", 0.8)));
  globe.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([foot(0.3), checkerAt])), lineMaterial(INK, "decide", 0.8)));
  const draftPath = [makerAt, head(0).add(deskUp.clone().multiplyScalar(0.1)), checkerAt];
  const draft = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.1, 0.13)), flatMaterial(0xffffff, "decide", 1));
  const draftEdge = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([[-0.05, -0.065], [0.05, -0.065], [0.05, 0.065], [-0.05, 0.065], [-0.05, -0.065]].map(p => new THREE.Vector3(p[0], p[1], 0.001)))), lineMaterial(INK, "decide", 1));
  draft.add(draftEdge); flatOn(draft, makerAt.clone()); globe.add(draft);
  const seal = ringMesh(0.1, 0.128, GREEN, "decide"); flatOn(seal, desk); globe.add(seal);
  const sealDot = new THREE.Mesh(keep(new THREE.CircleGeometry(0.05, 32)), flatMaterial(GREEN, "decide", 1)); flatOn(sealDot, desk.clone().multiplyScalar(1.001)); globe.add(sealDot);
  const deskMark = ringMesh(0.045, 0.07, INK, "desk"); flatOn(deskMark, desk); globe.add(deskMark);

  // Step 4: one hand-over to the official authority, through a single gate.
  const handover = arc(desk, authority, 0.75, GREEN, "handover", 1);
  const parcel = dot(desk, 0.062, GREEN, "handover");
  const gate = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.012, 8, 48)), flatMaterial(INK, "handover", 0.9));
  gate.position.copy(handover[24]); gate.lookAt(handover[26]); globe.add(gate);
  const authorityRing = ringMesh(0.1, 0.13, GREEN, "handover"); flatOn(authorityRing, authority); globe.add(authorityRing);
  const authorityMark = ringMesh(0.045, 0.07, SAFFRON, "authority"); flatOn(authorityMark, authority); globe.add(authorityMark);

  // Step 5: the official channel reaches places; AEGIS is not on these lines.
  const reach = PLACES.map(place => {
    const at = onSphere(place[0], place[1], R * 1.005), path = arc(authority, at, 0.42, SAFFRON, "reach", 0.5);
    const ring = ringMesh(0.05, 0.068, SAFFRON, "reach"); flatOn(ring, at); globe.add(ring);
    return { ring, path, message: dot(authority, 0.034, SAFFRON, "reach") };
  });

  // Step 6: what happened flows back to the desk.
  const learnGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  globe.add(new THREE.Line(learnGeometry, lineMaterial(SEA, "learn", 0.9)));
  const lesson = dot(desk, 0.055, SEA, "learn");
  const learnRing = ringMesh(0.1, 0.122, SEA, "learn"); flatOn(learnRing, desk); globe.add(learnRing);
  let learnPath: Vec[] = [desk, desk];

  let hazardId: HazardId = "cyclone", hazardAt = onSphere(90.4, 10.8, R * 1.005), targetAt = onSphere(85.8, 20.3, R * 1.005), pop = 1;
  const surface = (v: Vec, lift = 1.006) => v.normalize().multiplyScalar(R * lift);
  const placeHazard = () => {
    const h = HAZARD_AT[hazardId], t = TARGET_AT[hazardId];
    hazardAt = onSphere(h[0], h[1], R * 1.005); targetAt = onSphere(t[0], t[1], R * 1.006);
    flatOn(hazard, hazardAt);
    flatOn(riskDisc, targetAt); flatOn(riskEdge, targetAt); flatOn(riskRange, targetAt);
    trackGeometries.forEach((geometry, index) => {
      const spread = (index - 2) * 0.13, end = surface(targetAt.clone().add(side.clone().multiplyScalar(spread))), points: Vec[] = [];
      for (let i = 0; i <= 24; i++) points.push(surface(hazardAt.clone().lerp(end, i / 24)));
      geometry.setFromPoints(points); if (index === 2) centreTrack = points;
    });
    // The river bends on its way down. Schematic, not a real course.
    const bend = side.clone().multiplyScalar(0.07); riverPath = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40; riverPath.push(surface(hazardAt.clone().lerp(targetAt, u * 1.5 - 0.25).add(bend.clone().multiplyScalar(Math.sin(u * 9))), 1.007)); }
    riverGeometry.setFromPoints(riverPath);
    learnPath = arcPoints(targetAt, desk, 0.55); learnGeometry.setFromPoints(learnPath);
    gauges.forEach((gauge, index) => { const a = index * 1.7 + 0.6; gauge.position.copy(surface(hazardAt.clone().add(side.clone().multiplyScalar(Math.cos(a) * 0.3)).add(new THREE.Vector3(0, Math.sin(a) * 0.3, 0)))); });
    const colour = HAZARD_COLOUR[hazardId];
    hazardRings.forEach(ring => ring.material.color.setHex(colour));
    for (const mesh of [riskDisc, riskEdge, riskRange]) mesh.material.color.setHex(colour === SEA ? SEA : SAFFRON);
    spiral.visible = hazardId === "cyclone"; trace.visible = hazardId === "earthquake"; heat.visible = hazardId === "heatwave";
    river.visible = hazardId === "flood"; riverDrops.forEach(drop => { drop.visible = hazardId === "flood"; });
  };
  placeHazard();

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const fine = window.matchMedia("(pointer: fine)").matches;
  const onPointer = (event: PointerEvent) => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
  if (fine && !still) window.addEventListener("pointermove", onPointer, { passive: true });

  // Where the camera looks at each step: [longitude, latitude, distance].
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const keyframes = (): Array<[number, number, number]> => {
    const h = HAZARD_AT[hazardId], t = TARGET_AT[hazardId], ht = mid(h, t), td = mid(t, DESK), da = mid(DESK, AUTHORITY);
    // From step 2 on the view sits a little south of the action, so arcs and markers are seen at an angle.
    return [[(81 + h[0]) / 2, 18, 10.6], [(h[0] + 81) / 2, (h[1] + 20) / 2, 8.4], [ht[0], ht[1] - 3, 6.2], [DESK[0], DESK[1] - 7, 5.5], [da[0] + 9, da[1] - 4, 6.1], [80.5, 14, 7.4], [td[0] + 6, td[1] - 6, 6.7]];
  };

  let stage = 0, shown = 0, time = 0, last = 0, width = 1, height = 1, rotY = facing(84), rotX = 18 * RAD, distance = 10.6, first = true;
  const resize = () => {
    const box = canvas.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  };
  const hazardWorld = new THREE.Vector3();

  function draw(now: number) {
    const delta = still ? 0 : Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time = still ? 2.9 : time + delta;
    const ease = (rate: number) => (still || first ? 1 : Math.min(1, delta * rate));
    shown += (stage - shown) * ease(4); pop += (1 - pop) * ease(5);
    pointer.sx += (pointer.x - pointer.sx) * ease(3); pointer.sy += (pointer.y - pointer.sy) * ease(3);
    const frames = keyframes(), index = Math.min(5, Math.floor(shown)), blend = smooth(0, 1, shown - index), a = frames[index], b = frames[index + 1];
    const close = smooth(0.2, 1.2, shown), narrow = Math.min(1.5, Math.max(1, 1.2 / (width / height)));
    const wantY = facing(a[0] + (b[0] - a[0]) * blend) + (1 - close) * Math.sin(time * 0.12) * 0.42 + pointer.sx * 0.22;
    const wantX = (a[1] + (b[1] - a[1]) * blend) * RAD + pointer.sy * 0.14, wantD = (a[2] + (b[2] - a[2]) * blend) * narrow;
    rotY += (wantY - rotY) * ease(3.2); rotX += (wantX - rotX) * ease(3.2); distance += (wantD - distance) * ease(3.2); first = false;
    camera.position.set(0, 0, distance); globe.rotation.y = rotY; world.rotation.x = rotX;
    speckField.position.set(-pointer.sx * 0.9, pointer.sy * 0.6, 0);

    const weight: Record<string, number> = {
      hazard: (0.75 + 0.25 * smooth(0.3, 0.9, shown)) * (1 - 0.4 * near(shown, 2, 0.4)) * (1 - 0.78 * smooth(2.5, 3, shown)),
      orbit: 1 - 0.8 * smooth(1.5, 2.2, shown), sense: near(shown, 1),
      predict: near(shown, 2, 0.4) + 0.16 * smooth(2.6, 3, shown),
      desk: smooth(2.3, 2.8, shown), decide: near(shown, 3), handover: near(shown, 4, 0.4),
      authority: smooth(3.4, 3.9, shown), reach: near(shown, 5, 0.4), learn: near(shown, 6, 0.5),
    };
    for (const name of Object.keys(groups)) for (const item of groups[name]) item.material.opacity = item.base * Math.min(1, weight[name] ?? 0);

    // Hazard: shape and pace depend on the kind.
    hazard.scale.setScalar((0.35 + 0.65 * pop) * (1 - 0.3 * near(shown, 2, 0.4)));
    const quake = hazardId === "earthquake", pace = quake ? 0.75 : hazardId === "heatwave" ? 0.16 : 0.3, reachOut = hazardId === "cyclone" ? 2.6 : quake ? 4.4 : 3.4;
    spiral.rotation.z = -time * 0.5;
    hazardRings.forEach((ring, i) => { const u = (time * pace + i / 3) % 1; ring.scale.setScalar(0.45 + u * reachOut); ring.material.opacity *= 1 - u; });
    trace.scale.y = 0.55 + 0.45 * Math.abs(Math.sin(time * 5.5)); heat.scale.setScalar(1 + 0.1 * Math.sin(time * 1.4)); heat.material.opacity *= 0.75 + 0.25 * Math.sin(time * 1.4);
    riverDrops.forEach((drop, i) => along(riverPath, (time * 0.22 + i / 3) % 1, drop.position));

    world.updateMatrixWorld(true);
    hazardWorld.copy(hazardAt).applyMatrix4(globe.matrixWorld);
    satellites.forEach((satellite, i) => {
      const angle = time * satellite.speed + satellite.phase; satellite.craft.position.set(Math.cos(angle) * satellite.radius, 0, Math.sin(angle) * satellite.radius); satellite.craft.rotation.y = -angle;
      satellite.craft.updateMatrixWorld(true); satellite.craft.getWorldPosition(satellite.at);
      beamGeometries[i].setFromPoints([satellite.at, hazardWorld]);
      satellite.reading.position.copy(satellite.at).lerp(hazardWorld, (time * 0.55 + i * 0.37) % 1);
    });
    gauges.forEach((gauge, i) => { gauge.material.opacity *= 0.45 + 0.55 * Math.abs(Math.sin(time * 1.6 + i * 1.3)); });

    const breathe = 1 + 0.06 * Math.sin(time * 2.2); riskDisc.scale.setScalar(breathe); riskEdge.scale.setScalar(breathe); riskRange.scale.setScalar(1 + 0.03 * Math.sin(time * 1.1));
    along(centreTrack, (time * 0.32) % 1, trackHead.position);

    // Decide: the draft crosses from maker to checker, then the seal appears.
    const turn = (time * 0.28) % 1, across = smooth(0.12, 0.52, turn), sealed = smooth(0.58, 0.72, turn) * (1 - smooth(0.93, 1, turn));
    along(draftPath, across, draft.position);
    seal.scale.setScalar(0.5 + sealed * 0.9); seal.material.opacity *= sealed; sealDot.material.opacity *= sealed;

    const trip = (time * 0.3) % 1; along(handover, smooth(0.05, 0.85, trip), parcel.position);
    gate.scale.setScalar(1 + 0.35 * (1 - smooth(0, 0.12, Math.abs(smooth(0.05, 0.85, trip) - 0.5))));
    authorityRing.scale.setScalar(1 + 0.9 * smooth(0.8, 1, trip)); authorityRing.material.opacity *= 1 - 0.7 * smooth(0.85, 1, trip);
    reach.forEach((place, i) => {
      const u = (time * 0.42 + i * 0.13) % 1; along(place.path, smooth(0, 0.6, u), place.message.position); place.message.material.opacity *= 1 - smooth(0.55, 0.62, u);
      const spread = smooth(0.55, 1, u); place.ring.scale.setScalar(1 + spread * 3.2); place.ring.material.opacity *= u < 0.55 ? 0.5 : 1 - spread;
    });
    const back = (time * 0.3) % 1; along(learnPath, smooth(0, 0.85, back), lesson.position);
    learnRing.scale.setScalar(1 + 1.1 * smooth(0.8, 1, back)); learnRing.material.opacity *= 1 - smooth(0.82, 1, back) * 0.8;
    renderer.render(scene, camera);
  }

  const loop = frameLoop(canvas, still, draw);
  const observer = new ResizeObserver(() => { resize(); if (still) loop.wake(); }); observer.observe(canvas);
  resize();

  return {
    setStage(value) { stage = Math.min(6, Math.max(0, value)); if (still) loop.wake(); },
    setHazard(value) { if (value === hazardId) return; hazardId = value; pop = 0; placeHazard(); if (still) loop.wake(); },
    dispose() { loop.stop(); observer.disconnect(); window.removeEventListener("pointermove", onPointer); disposables.forEach(item => item.dispose()); renderer.dispose(); },
  };
}
