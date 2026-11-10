// Scroll-driven 3D illustration for the public landing page (/welcome). Decoration that explains the workflow:
// nothing here is data, a map of record, or a boundary depiction. Stage 0 is the overview; stages 1-6 follow the
// six steps of the page (sense, predict, decide, hand over, reach people, learn).
import * as THREE from "three";

export type HazardId = "cyclone" | "flood" | "earthquake" | "heatwave";
export type WelcomeScene = { setStage: (stage: number) => void; setHazard: (hazard: HazardId) => void; dispose: () => void };

type Vec = InstanceType<typeof THREE.Vector3>;
type Fading = { material: { opacity: number }; base: number };

const RAD = Math.PI / 180, R = 3;
const INK = 0x0b1f5c, SAFFRON = 0xf08a1c, GREEN = 0x17803d, SEA = 0x1f6fb5;
const HAZARD_AT: Record<HazardId, [number, number]> = { cyclone: [88.5, 15.5], flood: [92.5, 26.2], earthquake: [79.5, 30.4], heatwave: [78.5, 24.5] };
const TARGET_AT: Record<HazardId, [number, number]> = { cyclone: [85.8, 20.3], flood: [91.7, 26.1], earthquake: [78.0, 30.3], heatwave: [79.1, 21.1] };
const DESK: [number, number] = [78.5, 17.4], AUTHORITY: [number, number] = [77.2, 28.6];
const PLACES: Array<[number, number]> = [[72.9, 19.1], [80.3, 13.1], [88.4, 22.6], [85.8, 20.3], [83.3, 17.7], [76.3, 10.0], [91.7, 26.1], [75.8, 26.9], [72.6, 23.0]];

function onSphere(lon: number, lat: number, radius: number): Vec {
  const phi = (90 - lat) * RAD, theta = (lon + 180) * RAD;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}
// Rough, schematic test for "this dot is over the Indian subcontinent". Illustration only, not a boundary.
function overSubcontinent(lon: number, lat: number) {
  return lat > 8 && lat < 35 && lon > 68.5 && lon < 97 && lat < 37 - Math.abs(lon - 79) * 1.25 + (lat > 22 ? 12 : 0);
}
const smooth = (edge0: number, edge1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
// 1 while the story is on this step, fading over half a step on each side.
const near = (stage: number, at: number, hold = 0.35) => 1 - smooth(hold, hold + 0.5, Math.abs(stage - at));

export function startWelcomeScene(canvas: HTMLCanvasElement, still: boolean): WelcomeScene | null {
  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const world = new THREE.Group(), globe = new THREE.Group(); scene.add(world); world.add(globe);
  const disposables: Array<{ dispose: () => void }> = [];
  const keep = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item; };
  const groups: Record<string, Fading[]> = {};
  const fade = (name: string, material: { opacity: number }, base: number) => { (groups[name] ??= []).push({ material, base }); };
  const lineMaterial = (colour: number, group: string, base: number) => { const m = keep(new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0 })); fade(group, m, base); return m; };
  const flatMaterial = (colour: number, group: string, base: number) => { const m = keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); fade(group, m, base); return m; };

  // Globe: ink dots on a pale sphere, the subcontinent in saffron.
  const positions: number[] = [], colours: number[] = [], COUNT = 5200;
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2, lat = Math.asin(y) / RAD, lon = (((i * 2.399963) / RAD) % 360) - 180, p = onSphere(lon, lat, R);
    positions.push(p.x, p.y, p.z);
    if (overSubcontinent(lon, lat)) colours.push(0.94, 0.54, 0.11); else colours.push(0.26, 0.36, 0.62);
  }
  const dots = keep(new THREE.BufferGeometry());
  dots.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  dots.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  globe.add(new THREE.Points(dots, keep(new THREE.PointsMaterial({ size: 0.042, vertexColors: true, transparent: true, opacity: 0.95 }))));
  globe.add(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.99, 64, 40)), keep(new THREE.MeshBasicMaterial({ color: 0xe9eef7 }))));
  globe.add(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 1.07, 64, 40)), keep(new THREE.MeshBasicMaterial({ color: SEA, transparent: true, opacity: 0.07, side: THREE.BackSide }))));

  const flatOn = (mesh: InstanceType<typeof THREE.Mesh>, at: Vec) => { mesh.position.copy(at); mesh.lookAt(at.clone().multiplyScalar(2)); };
  const arc = (from: Vec, to: Vec, lift: number, colour: number, group: string, base: number) => {
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(R + lift), points: Vec[] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = from.clone().lerp(mid, t), b = mid.clone().lerp(to, t); points.push(a.lerp(b, t)); }
    const line = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points)), lineMaterial(colour, group, base)); globe.add(line);
    return points;
  };
  const dot = (at: Vec, size: number, colour: number, group: string) => { const m = new THREE.Mesh(keep(new THREE.SphereGeometry(size, 14, 14)), flatMaterial(colour, group, 1)); m.position.copy(at); globe.add(m); return m; };

  // Hazard marker (moves with the chosen hazard): a slow spiral for a cyclone, rings for the others.
  const hazard = new THREE.Group(); globe.add(hazard);
  const spiralPoints: number[] = [];
  for (let i = 0; i < 520; i++) { const t = i / 520, a = t * 15 + (i % 2) * Math.PI, r = 0.04 + t * 0.3; spiralPoints.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
  const spiralGeometry = keep(new THREE.BufferGeometry()); spiralGeometry.setAttribute("position", new THREE.Float32BufferAttribute(spiralPoints, 3));
  const spiralMaterial = keep(new THREE.PointsMaterial({ color: INK, size: 0.032, transparent: true, opacity: 0 })); fade("hazard", spiralMaterial, 0.9);
  const spiral = new THREE.Points(spiralGeometry, spiralMaterial); hazard.add(spiral);
  const hazardRings = [0, 1, 2].map(() => { const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.11, 0.125, 56)), flatMaterial(SAFFRON, "hazard", 0.9)); hazard.add(ring); return ring; });

  // Step 1: satellites, with beams down to the hazard.
  const beamGeometries: Array<InstanceType<typeof THREE.BufferGeometry>> = [];
  const satellites = [{ radius: 4.25, tilt: 0.55, speed: 0.42 }, { radius: 4.7, tilt: -0.85, speed: 0.3 }, { radius: 5.15, tilt: 1.2, speed: 0.22 }].map((orbit, index) => {
    const group = new THREE.Group(); group.rotation.set(orbit.tilt, index * 1.2, orbit.tilt * 0.4); world.add(group);
    const path: Vec[] = []; for (let a = 0; a <= 120; a++) path.push(new THREE.Vector3(Math.cos(a / 120 * Math.PI * 2) * orbit.radius, 0, Math.sin(a / 120 * Math.PI * 2) * orbit.radius));
    group.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(path)), lineMaterial(INK, "orbit", 0.22)));
    const craft = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.09)), flatMaterial(INK, "orbit", 1)); group.add(craft);
    const beam = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])); beamGeometries.push(beam);
    scene.add(new THREE.Line(beam, lineMaterial(SEA, "sense", 0.75)));
    return { ...orbit, group, craft, phase: index * 2.2 };
  });

  // Step 2: forecast spread (several possible tracks) and a risk area over the place at risk.
  const predict = new THREE.Group(); globe.add(predict);
  const riskDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(0.2, 48)), flatMaterial(SAFFRON, "predict", 0.32)); predict.add(riskDisc);
  const riskEdge = new THREE.Mesh(keep(new THREE.RingGeometry(0.2, 0.215, 64)), flatMaterial(SAFFRON, "predict", 1)); predict.add(riskEdge);
  const trackGeometries = [-2, -1, 0, 1, 2].map(() => { const g = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])); predict.add(new THREE.Line(g, lineMaterial(INK, "predict", 0.5))); return g; });

  // Step 3: two people, maker and checker, at the operations desk.
  const desk = onSphere(DESK[0], DESK[1], R * 1.005), authority = onSphere(AUTHORITY[0], AUTHORITY[1], R * 1.005);
  const deskUp = desk.clone().normalize(), side = new THREE.Vector3(0, 1, 0).cross(deskUp).normalize();
  const maker = dot(desk.clone().add(deskUp.clone().multiplyScalar(0.34)).add(side.clone().multiplyScalar(-0.22)), 0.06, SEA, "decide");
  const checker = dot(desk.clone().add(deskUp.clone().multiplyScalar(0.34)).add(side.clone().multiplyScalar(0.22)), 0.06, INK, "decide");
  globe.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([maker.position, desk, checker.position])), lineMaterial(INK, "decide", 0.6)));
  const seal = new THREE.Mesh(keep(new THREE.RingGeometry(0.09, 0.115, 48)), flatMaterial(GREEN, "decide", 1)); flatOn(seal, desk); globe.add(seal);
  dot(desk, 0.05, INK, "desk");

  // Step 4: one hand-over to the official authority.
  const handover = arc(desk, authority, 0.7, GREEN, "handover", 1);
  const parcel = dot(desk, 0.06, GREEN, "handover");
  const authorityRing = new THREE.Mesh(keep(new THREE.RingGeometry(0.1, 0.13, 48)), flatMaterial(GREEN, "handover", 1)); flatOn(authorityRing, authority); globe.add(authorityRing);

  // Step 5: the official channel reaches places; AEGIS is not on these lines.
  const reach = PLACES.map(place => {
    const at = onSphere(place[0], place[1], R * 1.005); arc(authority, at, 0.45, SAFFRON, "reach", 0.55);
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.05, 0.07, 32)), flatMaterial(SAFFRON, "reach", 1)); flatOn(ring, at); globe.add(ring); return ring;
  });

  // Step 6: what happened flows back to the desk.
  const learnGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  globe.add(new THREE.Line(learnGeometry, lineMaterial(SEA, "learn", 0.9)));
  const lesson = dot(desk, 0.055, SEA, "learn");
  let learnPath: Vec[] = [desk, desk];

  let hazardId: HazardId = "cyclone", hazardAt = onSphere(88.5, 15.5, R * 1.005), targetAt = onSphere(85.8, 20.3, R * 1.005);
  const placeHazard = () => {
    const h = HAZARD_AT[hazardId], t = TARGET_AT[hazardId];
    hazardAt = onSphere(h[0], h[1], R * 1.005); targetAt = onSphere(t[0], t[1], R * 1.006);
    hazard.position.copy(hazardAt); hazard.lookAt(hazardAt.clone().multiplyScalar(2));
    flatOn(riskDisc, targetAt); flatOn(riskEdge, targetAt);
    trackGeometries.forEach((geometry, index) => {
      const spread = (index - 2) * 0.09, end = targetAt.clone().add(side.clone().multiplyScalar(spread)).normalize().multiplyScalar(R * 1.006), points: Vec[] = [];
      for (let i = 0; i <= 24; i++) points.push(hazardAt.clone().lerp(end, i / 24).normalize().multiplyScalar(R * 1.006));
      geometry.setFromPoints(points);
    });
    const mid = targetAt.clone().add(desk).multiplyScalar(0.5).normalize().multiplyScalar(R + 0.55); learnPath = [];
    for (let i = 0; i <= 40; i++) { const t2 = i / 40, a = targetAt.clone().lerp(mid, t2), b = mid.clone().lerp(desk, t2); learnPath.push(a.lerp(b, t2)); }
    learnGeometry.setFromPoints(learnPath);
    spiral.visible = hazardId === "cyclone";
  };
  placeHazard();

  // India faces the camera; a small offset keeps the Bay of Bengal in view.
  const centre = onSphere(81, 20, 1), facing = Math.atan2(-centre.x, centre.z);
  let stage = 0, shown = 0, time = 0, last = 0, frame = 0, alive = true, width = 1, height = 1;
  const resize = () => {
    const box = canvas.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(() => { resize(); if (still) draw(performance.now()); }); observer.observe(canvas);
  const tmp = new THREE.Vector3();
  const at = (path: Vec[], u: number) => path[Math.min(path.length - 1, Math.max(0, Math.round(u * (path.length - 1))))];

  function draw(now: number) {
    if (!alive) return;
    if (!still) frame = requestAnimationFrame(draw);
    if (document.hidden) return;
    const delta = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time += delta;
    shown = still ? stage : shown + (stage - shown) * Math.min(1, delta * 4);
    const close = smooth(0.2, 1.4, shown), portrait = width / height < 0.95;
    camera.position.set(0, 0, (portrait ? 13.2 : 10.4) - close * (portrait ? 5.2 : 4.3));
    globe.rotation.y = facing + (1 - close) * Math.sin(time * 0.12) * 0.5;
    world.rotation.x = 0.16 + close * 0.22;
    world.position.y = close * 0.15;

    const weight: Record<string, number> = {
      hazard: smooth(0.3, 0.9, shown) * (1 - 0.55 * smooth(5.4, 6, shown)),
      orbit: 1 - 0.75 * smooth(1.5, 2.2, shown), sense: near(shown, 1),
      predict: near(shown, 2, 0.4) + 0.35 * smooth(2.6, 3, shown) * (1 - smooth(5.4, 6, shown)),
      desk: smooth(2.3, 2.8, shown), decide: near(shown, 3), handover: near(shown, 4, 0.4), reach: near(shown, 5, 0.4), learn: near(shown, 6, 0.5),
    };
    for (const name of Object.keys(groups)) for (const item of groups[name]) item.material.opacity = item.base * Math.min(1, weight[name] ?? 0);

    spiral.rotation.z = -time * 0.5;
    hazardRings.forEach((ring, index) => { const u = (time * 0.3 + index / 3) % 1; ring.scale.setScalar(hazardId === "cyclone" ? 0.4 + u * 2.6 : 0.5 + u * 3.4); ring.material.opacity *= 1 - u; });
    globe.updateMatrixWorld(true);
    const hazardWorld = tmp.copy(hazardAt).applyMatrix4(globe.matrixWorld).clone();
    satellites.forEach((satellite, index) => {
      const a = time * satellite.speed + satellite.phase; satellite.craft.position.set(Math.cos(a) * satellite.radius, 0, Math.sin(a) * satellite.radius); satellite.craft.rotation.y = time;
      satellite.group.updateMatrixWorld(true); beamGeometries[index].setFromPoints([satellite.craft.getWorldPosition(new THREE.Vector3()), hazardWorld]);
    });
    const breathe = 1 + 0.07 * Math.sin(time * 2.2); riskDisc.scale.setScalar(breathe); riskEdge.scale.setScalar(breathe);
    const agree = smooth(2.7, 3.2, shown); seal.scale.setScalar(0.4 + agree * 0.9); seal.material.opacity *= agree;
    parcel.position.copy(at(handover, (time * 0.35) % 1)); authorityRing.scale.setScalar(1 + 0.25 * Math.sin(time * 3));
    reach.forEach((ring, index) => { const u = (time * 0.5 + index * 0.13) % 1; ring.scale.setScalar(1 + u * 3.2); ring.material.opacity *= 1 - u; });
    lesson.position.copy(at(learnPath, (time * 0.3) % 1));
    renderer.render(scene, camera);
  }
  resize(); frame = requestAnimationFrame(draw);

  return {
    setStage(value) { stage = Math.min(6, Math.max(0, value)); if (still) requestAnimationFrame(draw); },
    setHazard(value) { hazardId = value; placeHazard(); if (still) requestAnimationFrame(draw); },
    dispose() { alive = false; cancelAnimationFrame(frame); observer.disconnect(); disposables.forEach(item => item.dispose()); renderer.dispose(); },
  };
}
