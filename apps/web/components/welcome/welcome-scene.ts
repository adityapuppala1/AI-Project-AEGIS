// Scroll-driven 3D illustration for the public landing page (/ when signed out, and /welcome): India as its own
// weather satellites see it, with one hazard at a time and the six steps an alert takes. Stage 0 is the overview;
// stages 1-6 follow the page (sense, predict, decide, hand over, reach people, learn). Decoration that explains the
// workflow: nothing here is AEGIS data, live imagery or a map of record. The Earth itself is shared with the sign-in
// page (components/globe/india-globe.ts).
import * as THREE from "three";

import { buildIndiaGlobe, buildOrbiters, buildStars, createRenderer, facing, frameLoop, INDIA_CENTRE, onSphere, R, RAD, roundSprite, smooth, type Keep, type Obj, type Vec } from "../globe/india-globe";
import { RIVERS, type LonLat } from "../globe/india-outline";

export type HazardId = "cyclone" | "flood" | "earthquake" | "heatwave";
export type WelcomeScene = { setStage: (stage: number) => void; setHazard: (hazard: HazardId, fly?: boolean) => void; dispose: () => void };
export type WelcomeHooks = { onReady: () => void; onView: (lon: number, lat: number) => void };

type Fading = { material: { opacity: number }; base: number; hazard?: HazardId };

const WHITE = 0xffffff, SAFFRON = 0xffb454, GREEN = 0x4fd08a, SKY = 0x7cc4ff, RUST = 0xff6b4a, INK = 0x0b1f5c;
const IDS: HazardId[] = ["cyclone", "flood", "earthquake", "heatwave"];
const nearest = (path: LonLat[], to: LonLat) => path.reduce((best, p) => (Math.hypot(p[0] - to[0], p[1] - to[1]) < Math.hypot(best[0] - to[0], best[1] - to[1]) ? p : best), path[0]);
// Where each hazard is shown, and the place it threatens. Real regions; the events themselves are invented.
const HAZARDS: Record<HazardId, { at: LonLat; target: LonLat; colour: number }> = {
  cyclone: { at: [89.4, 14.4], target: [86.3, 20.1], colour: SAFFRON },                                   // Bay of Bengal towards the Odisha coast
  flood: { at: nearest(RIVERS.brahmaputra, [94.9, 27.9]), target: nearest(RIVERS.brahmaputra, [91.6, 26.2]), colour: SKY }, // Brahmaputra, upper Assam to Guwahati
  earthquake: { at: [79.4, 30.4], target: [78.0, 29.3], colour: RUST },                                    // Himalayan arc, Uttarakhand
  heatwave: { at: [76.4, 26.2], target: [79.1, 21.4], colour: SAFFRON },                                   // north-west and central plains
};
// The Himalayan seismic belt, as a schematic arc along the range.
const HIMALAYAN_ARC: LonLat[] = [[73.6, 34.5], [75.6, 33.1], [77.4, 31.6], [79.4, 30.3], [81.4, 29.3], [83.8, 28.3], [86.4, 27.7], [88.8, 27.3], [91.4, 27.2], [93.6, 27.6], [95.6, 28.5]];
const DESK: LonLat = [78.5, 17.4], AUTHORITY: LonLat = [77.2, 28.6];
const PLACES: LonLat[] = [[72.9, 19.1], [80.3, 13.1], [88.4, 22.6], [85.8, 20.3], [83.3, 17.7], [76.3, 10.0], [91.7, 26.1], [75.8, 26.9], [72.6, 23.0]];

// 1 while the story is on this step, fading over half a step on each side.
const near = (stage: number, at: number, hold = 0.35) => 1 - smooth(hold, hold + 0.5, Math.abs(stage - at));

export function startWelcomeScene(canvas: HTMLCanvasElement, still: boolean, hooks: WelcomeHooks): WelcomeScene | null {
  const renderer = createRenderer(canvas, 1.75);
  if (!renderer) return null;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const world = new THREE.Group(); scene.add(world);
  const disposables: Array<{ dispose: () => void }> = [];
  const keep: Keep = item => { disposables.push(item); return item; };
  const fades: Record<string, Fading[]> = {};
  const fade = (name: string, material: { opacity: number }, base: number, hazard?: HazardId) => { (fades[name] ??= []).push({ material, base, hazard }); };
  const lineMaterial = (colour: number, group: string, base: number, hazard?: HazardId) => { const m = keep(new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0 })); fade(group, m, base, hazard); return m; };
  const flatMaterial = (colour: number, group: string, base: number, hazard?: HazardId) => { const m = keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); fade(group, m, base, hazard); return m; };

  let wakeLoop = () => undefined as void;
  const earth = buildIndiaGlobe(keep, renderer, { still, onChange: () => wakeLoop(), onReady: hooks.onReady });
  const globe = earth.globe; world.add(globe); world.add(earth.halo);
  const stars = buildStars(keep, 520); scene.add(stars);
  const orbiters = buildOrbiters(keep, globe, world, () => wakeLoop());
  for (const item of orbiters.materials) fade("orbit", item.material, item.base);

  // Lay an object flat on the globe at a point, facing outward. Works in the globe's own frame, so it stays right
  // however the globe is turned at the time.
  const basis = (at: Vec) => { const normal = at.clone().normalize(), east = new THREE.Vector3(0, 1, 0).cross(normal).normalize(); return { normal, east, north: normal.clone().cross(east) }; };
  const flatOn = (mesh: Obj, at: Vec) => { const b = basis(at); mesh.position.copy(at); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(b.east, b.north, b.normal)); };
  const surface = (v: Vec, lift = 1.006) => v.normalize().multiplyScalar(R * lift);
  const arcPoints = (from: Vec, to: Vec, lift: number) => {
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(R + lift), points: Vec[] = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48, a = from.clone().lerp(mid, t), b = mid.clone().lerp(to, t); points.push(a.lerp(b, t)); }
    return points;
  };
  // Lines are one pixel wide in WebGL, so paths are drawn as thin tubes.
  const tube = (points: Vec[], radius: number, material: Obj) => { const mesh = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(24, points.length * 2), radius, 6, false)), material); globe.add(mesh); return mesh; };
  const course = (path: LonLat[], lift: number) => path.map(p => onSphere(p[0], p[1], R * lift));
  const dot = (at: Vec, size: number, colour: number, group: string, parent: Obj = globe, hazard?: HazardId) => { const m = new THREE.Mesh(keep(new THREE.SphereGeometry(size, 16, 16)), flatMaterial(colour, group, 1, hazard)); m.position.copy(at); parent.add(m); return m; };
  const ringMesh = (inner: number, outer: number, colour: number, group: string, base = 1, hazard?: HazardId) => new THREE.Mesh(keep(new THREE.RingGeometry(inner, outer, 64)), flatMaterial(colour, group, base, hazard));
  const along = (path: Vec[], u: number, into: Vec) => {
    const f = Math.min(1, Math.max(0, u)) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f));
    return into.copy(path[i]).lerp(path[i + 1], f - i);
  };

  const desk = onSphere(DESK[0], DESK[1], R * 1.005), authority = onSphere(AUTHORITY[0], AUTHORITY[1], R * 1.005);

  // One set of pictures per hazard, cross-faded when the visitor picks another.
  const sets = IDS.map(id => {
    const spec = HAZARDS[id], at = onSphere(spec.at[0], spec.at[1], R * 1.006), target = onSphere(spec.target[0], spec.target[1], R * 1.007), local = basis(target);
    const marker = new THREE.Group(); flatOn(marker, at); globe.add(marker);
    const rings = [0, 1, 2].map(() => { const ring = ringMesh(0.11, 0.124, spec.colour, "hazard", id === "cyclone" ? 0.55 : 0.95, id); marker.add(ring); return ring; });
    // Readings from gauges on the ground around the hazard (step 1).
    const gauges = [0, 1, 2, 3].map(index => { const a = index * 1.7 + 0.6, b = basis(at); return dot(surface(at.clone().add(b.east.clone().multiplyScalar(Math.cos(a) * 0.3)).add(b.north.clone().multiplyScalar(Math.sin(a) * 0.3))), 0.03, SKY, "sense", globe, id); });
    // Step 2: several possible paths, the area most at risk and a wider likely range.
    const riskDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(0.2, 56)), flatMaterial(spec.colour, "predict", 0.32, id));
    const riskEdge = ringMesh(0.2, 0.214, spec.colour, "predict", 1, id), riskRange = ringMesh(0.3, 0.307, spec.colour, "predict", 0.6, id);
    for (const mesh of [riskDisc, riskEdge, riskRange]) { flatOn(mesh, target); globe.add(mesh); }
    let centre: Vec[] = [];
    [-2, -1, 0, 1, 2].forEach(index => {
      // Storm tracks bow westward before turning north to the coast; the others run straight.
      const end = surface(target.clone().add(local.east.clone().multiplyScalar(index * 0.12))), bend = id === "cyclone" ? local.east.clone().multiplyScalar(-0.2) : new THREE.Vector3(), points: Vec[] = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; points.push(surface(at.clone().lerp(end, t).add(bend.clone().multiplyScalar(Math.sin(t * Math.PI))), 1.008)); }
      tube(points, index === 0 ? 0.007 : 0.004, flatMaterial(WHITE, "predict", index === 0 ? 0.95 : 0.5, id)); if (index === 0) centre = points;
    });
    const head = dot(at, 0.04, WHITE, "predict", globe, id);
    // Step 6: what happened flows back to the desk.
    const learnPath = arcPoints(target, desk, 0.55); tube(learnPath, 0.006, flatMaterial(SKY, "learn", 0.9, id));
    return { id, at, target, marker, rings, gauges, riskDisc, riskEdge, riskRange, centre, head, learnPath };
  });
  const setOf = (id: HazardId) => sets[IDS.indexOf(id)];

  // Earthquake: the seismic belt along the Himalaya, and a seismograph trace across the epicentre.
  tube(course(HIMALAYAN_ARC, 1.006), 0.011, flatMaterial(RUST, "hazard", 0.7, "earthquake"));
  const tracePoints: Vec[] = [];
  for (let i = 0; i <= 60; i++) { const x = (i / 60 - 0.5) * 0.9, envelope = Math.exp(-Math.pow(x * 4.2, 2)); tracePoints.push(new THREE.Vector3(x, Math.sin(i * 2.1) * 0.2 * envelope * (i % 2 ? 1 : -0.8), 0.004)); }
  const trace = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(tracePoints)), lineMaterial(WHITE, "hazard", 1, "earthquake")); setOf("earthquake").marker.add(trace);
  // River flood: the Brahmaputra with water moving down it, and two more of India's large rivers for context.
  const riverPath = course(RIVERS.brahmaputra, 1.007);
  tube(riverPath, 0.013, flatMaterial(SKY, "hazard", 0.95, "flood"));
  tube(course(RIVERS.ganga, 1.006), 0.007, flatMaterial(SKY, "hazard", 0.5, "flood")); tube(course(RIVERS.godavari, 1.006), 0.007, flatMaterial(SKY, "hazard", 0.5, "flood"));
  const riverDrops = [0, 1, 2, 3].map(() => dot(new THREE.Vector3(), 0.02, WHITE, "hazard", globe, "flood"));

  // Step 1: readings travel down from the two INSAT satellites to the hazard.
  const beams = orbiters.insat.map(() => {
    const geometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
    scene.add(new THREE.Line(geometry, lineMaterial(SKY, "sense", 0.55)));
    return { geometry, reading: dot(new THREE.Vector3(), 0.045, SKY, "sense", scene) };
  });

  // Step 3: two people, maker and checker, pass one draft across the desk; a green seal follows the second check.
  const deskLocal = basis(desk);
  const head = (offset: number) => desk.clone().add(deskLocal.normal.clone().multiplyScalar(0.12)).add(deskLocal.east.clone().multiplyScalar(offset));
  const foot = (offset: number) => desk.clone().add(deskLocal.east.clone().multiplyScalar(offset)).normalize().multiplyScalar(R * 1.005);
  const makerAt = head(-0.14), checkerAt = head(0.14);
  dot(makerAt, 0.036, SKY, "decide"); dot(checkerAt, 0.036, WHITE, "decide");
  tube([foot(-0.14), makerAt], 0.006, flatMaterial(SKY, "decide", 0.85)); tube([foot(0.14), checkerAt], 0.006, flatMaterial(WHITE, "decide", 0.85));
  const draftPath = [makerAt, head(0).add(deskLocal.normal.clone().multiplyScalar(0.05)), checkerAt];
  const draft = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.055, 0.072)), flatMaterial(WHITE, "decide", 1));
  draft.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([[-0.0275, -0.036], [0.0275, -0.036], [0.0275, 0.036], [-0.0275, 0.036], [-0.0275, -0.036]].map(p => new THREE.Vector3(p[0], p[1], 0.001)))), lineMaterial(INK, "decide", 1)));
  flatOn(draft, makerAt.clone()); globe.add(draft);
  const seal = ringMesh(0.075, 0.096, GREEN, "decide"); flatOn(seal, desk); globe.add(seal);
  const sealDot = new THREE.Mesh(keep(new THREE.CircleGeometry(0.034, 32)), flatMaterial(GREEN, "decide", 1)); flatOn(sealDot, desk.clone().multiplyScalar(1.001)); globe.add(sealDot);
  const deskMark = ringMesh(0.045, 0.07, WHITE, "desk"); flatOn(deskMark, desk); globe.add(deskMark);

  // Step 4: one hand-over to the official authority, through a single gate.
  const handover = arcPoints(desk, authority, 0.75); tube(handover, 0.008, flatMaterial(GREEN, "handover", 1));
  const parcel = dot(desk, 0.062, GREEN, "handover");
  const gate = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.012, 8, 48)), flatMaterial(WHITE, "handover", 0.95));
  gate.position.copy(handover[24]); gate.lookAt(handover[26]); globe.add(gate);
  const authorityRing = ringMesh(0.1, 0.13, GREEN, "handover"); flatOn(authorityRing, authority); globe.add(authorityRing);
  const authorityMark = ringMesh(0.045, 0.07, SAFFRON, "authority"); flatOn(authorityMark, authority); globe.add(authorityMark);

  // Step 5: the official channel reaches places; AEGIS is not on these lines.
  const reach = PLACES.map(place => {
    const at = onSphere(place[0], place[1], R * 1.005), path = arcPoints(authority, at, 0.42); tube(path, 0.0045, flatMaterial(SAFFRON, "reach", 0.6));
    const ring = ringMesh(0.05, 0.068, SAFFRON, "reach"); flatOn(ring, at); globe.add(ring);
    return { ring, path, message: dot(authority, 0.034, SAFFRON, "reach") };
  });
  const lesson = dot(desk, 0.055, SKY, "learn");
  const learnRing = ringMesh(0.1, 0.122, SKY, "learn"); flatOn(learnRing, desk); globe.add(learnRing);

  let hazardId: HazardId = "cyclone", picked = false, pop = 1;
  const mix: Record<HazardId, number> = { cyclone: 1, flood: 0, earthquake: 0, heatwave: 0 };
  earth.uniforms.uCyclone.value.set(...onSphere(HAZARDS.cyclone.at[0], HAZARDS.cyclone.at[1], 1).toArray(), 0);
  earth.uniforms.uHeat.value.set(...onSphere(HAZARDS.heatwave.at[0] + 1.2, HAZARDS.heatwave.at[1] - 1.6, 1).toArray(), 0);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointer = (event: PointerEvent) => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
  if (!still && window.matchMedia("(pointer: fine)").matches) window.addEventListener("pointermove", onPointer, { passive: true });

  // Where the camera looks at each step: [longitude, latitude, distance]. Before a hazard is picked the overview rests
  // on the middle of India; picking one flies to its region.
  const mid = (a: LonLat, b: LonLat): LonLat => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const keyframes = (): Array<[number, number, number]> => {
    const h = HAZARDS[hazardId].at, t = HAZARDS[hazardId].target, ht = mid(h, t), td = mid(t, DESK), da = mid(DESK, AUTHORITY);
    const rest: [number, number, number] = picked ? [ht[0], ht[1] - 1.5, 6.5] : [INDIA_CENTRE[0] + 1.5, INDIA_CENTRE[1] - 3.5, 7.2];
    // The sensing step pulls back and looks further south so the satellites above the equator are in the picture.
    return [rest, [(h[0] + 79) / 2, 13, 8.9], [ht[0], ht[1] - 1, 6.3], [DESK[0] + 2, DESK[1] + 1.5, 6.1], [da[0] + 4, da[1] - 1.5, 6.4], [80.5, 19, 7.4], [td[0] + 3, td[1] - 1.5, 6.8]];
  };

  let stage = 0, shown = 0, time = 0, last = 0, width = 1, height = 1, lon = INDIA_CENTRE[0] + 1.5, lat = INDIA_CENTRE[1] - 3.5, distance = 7.2, first = true, toldLon = 999, toldLat = 999, toldAt = 0;
  const resize = () => {
    const box = canvas.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height);
    renderer.setSize(width, height, false); camera.aspect = width / height;
    // Beside the text on wide screens the globe sits a little right of centre; everywhere it sits a little high, clear of the step rail.
    camera.setViewOffset(width, height, window.matchMedia("(min-width: 64rem)").matches ? -0.06 * width : 0, 0.035 * height, width, height);
    camera.updateProjectionMatrix();
  };
  const hazardWorld = new THREE.Vector3();

  function draw(now: number) {
    const delta = still ? 0 : Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time = still ? 2.9 : time + delta;
    const ease = (rate: number) => (still || first ? 1 : Math.min(1, delta * rate));
    shown += (stage - shown) * ease(4); pop += (1 - pop) * ease(5);
    pointer.sx += (pointer.x - pointer.sx) * ease(3); pointer.sy += (pointer.y - pointer.sy) * ease(3);
    for (const id of IDS) mix[id] += ((id === hazardId ? 1 : 0) - mix[id]) * ease(4.5);
    const frames = keyframes(), index = Math.min(5, Math.floor(shown)), blend = smooth(0, 1, shown - index), a = frames[index], b = frames[index + 1];
    const close = smooth(0.2, 1.2, shown), narrow = Math.min(1.45, Math.max(1, 1.18 / (width / height)));
    lon += (a[0] + (b[0] - a[0]) * blend - lon) * ease(2.6); lat += (a[1] + (b[1] - a[1]) * blend - lat) * ease(2.6);
    distance += ((a[2] + (b[2] - a[2]) * blend) * narrow - distance) * ease(2.6); first = false;
    // A slow drift while resting on the overview, and a small lean towards the pointer.
    const drift = still ? 0 : (1 - close) * Math.sin(time * 0.11) * 3.2;
    camera.position.set(0, 0, distance); globe.rotation.y = facing(lon + drift) + pointer.sx * 0.1; world.rotation.x = lat * RAD + pointer.sy * 0.07;
    stars.position.set(-pointer.sx * 1.6, pointer.sy * 1.1, 0);
    if ((Math.abs(lon - toldLon) > 0.05 || Math.abs(lat - toldLat) > 0.05) && (still || now - toldAt > 110)) { toldLon = lon; toldLat = lat; toldAt = now; hooks.onView(lon, lat); }

    const weight: Record<string, number> = {
      hazard: (0.8 + 0.2 * smooth(0.3, 0.9, shown)) * (1 - 0.35 * near(shown, 2, 0.4)) * (1 - 0.7 * smooth(2.5, 3, shown)),
      // The satellites sit low in the picture, so they bow out when the camera moves in close.
      orbit: (1 - 0.75 * smooth(1.5, 2.2, shown)) * smooth(6.2, 6.9, distance / narrow), sense: near(shown, 1),
      predict: near(shown, 2, 0.4) + 0.16 * smooth(2.6, 3, shown),
      desk: smooth(2.3, 2.8, shown), decide: near(shown, 3), handover: near(shown, 4, 0.4),
      authority: smooth(3.4, 3.9, shown), reach: near(shown, 5, 0.4), learn: near(shown, 6, 0.5),
    };
    for (const name of Object.keys(fades)) for (const item of fades[name]) item.material.opacity = item.base * Math.min(1, weight[name] ?? 0) * (item.hazard ? mix[item.hazard] : 1);
    earth.uniforms.uCyclone.value.w = mix.cyclone * Math.min(1, weight.hazard * 1.15) * (0.4 + 0.6 * pop);
    earth.uniforms.uHeat.value.w = mix.heatwave * Math.min(1, weight.hazard * 1.15);
    earth.update(time, delta); orbiters.update(time);

    // Hazard: shape and pace depend on the kind.
    const current = setOf(hazardId);
    for (const set of sets) {
      const quake = set.id === "earthquake", pace = quake ? 0.75 : set.id === "heatwave" ? 0.16 : 0.3, reachOut = set.id === "cyclone" ? 3.4 : quake ? 4.4 : 3.2;
      set.marker.scale.setScalar((0.35 + 0.65 * pop) * (1 - 0.3 * near(shown, 2, 0.4)));
      set.rings.forEach((ring, i) => { const u = (time * pace + i / 3) % 1; ring.scale.setScalar(0.45 + u * reachOut); ring.material.opacity *= 1 - u; });
      set.gauges.forEach((gauge, i) => { gauge.material.opacity *= 0.45 + 0.55 * Math.abs(Math.sin(time * 1.6 + i * 1.3)); });
      const breathe = 1 + 0.06 * Math.sin(time * 2.2); set.riskDisc.scale.setScalar(breathe); set.riskEdge.scale.setScalar(breathe); set.riskRange.scale.setScalar(1 + 0.03 * Math.sin(time * 1.1));
      along(set.centre, (time * 0.32) % 1, set.head.position);
    }
    trace.scale.y = 0.55 + 0.45 * Math.abs(Math.sin(time * 5.5));
    riverDrops.forEach((drop, i) => { const u = (time * 0.16 + i / 4) % 1; along(riverPath, u, drop.position); drop.material.opacity *= smooth(0, 0.06, u) * (1 - smooth(0.92, 1, u)); });

    world.updateMatrixWorld(true);
    hazardWorld.copy(current.at).applyMatrix4(globe.matrixWorld);
    orbiters.insat.forEach((satellite, i) => {
      satellite.craft.getWorldPosition(satellite.at);
      beams[i].geometry.setFromPoints([satellite.at, hazardWorld]);
      beams[i].reading.position.copy(satellite.at).lerp(hazardWorld, (time * 0.55 + i * 0.47) % 1);
    });

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
    const back = (time * 0.3) % 1; along(current.learnPath, smooth(0, 0.85, back), lesson.position);
    learnRing.scale.setScalar(1 + 1.1 * smooth(0.8, 1, back)); learnRing.material.opacity *= 1 - smooth(0.82, 1, back) * 0.8;
    renderer.render(scene, camera);
  }

  const loop = frameLoop(canvas, still, draw);
  wakeLoop = () => { if (still) loop.wake(); };
  const observer = new ResizeObserver(() => { resize(); if (still) loop.wake(); }); observer.observe(canvas);
  resize();

  return {
    setStage(value) { stage = Math.min(6, Math.max(0, value)); if (still) loop.wake(); },
    setHazard(value, fly = false) { if (fly) picked = true; if (value !== hazardId) { hazardId = value; pop = 0; } if (still) loop.wake(); },
    dispose() { loop.stop(); observer.disconnect(); window.removeEventListener("pointermove", onPointer); disposables.forEach(item => item.dispose()); renderer.dispose(); },
  };
}
