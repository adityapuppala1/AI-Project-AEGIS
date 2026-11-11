// 3D illustration for the sign-in page: the same Earth as the landing page, resting on India, in a calmer mood (no
// hazards). A token leaves the AEGIS desk for the identity provider, is checked there, and comes back approved.
// Decoration only: nothing here takes part in the real sign-in, and it is not live imagery or a map of record.
import * as THREE from "three";

import { buildIndiaGlobe, buildOrbiters, buildStars, createRenderer, facing, frameLoop, INDIA_CENTRE, onSphere, R, RAD, roundSprite, smooth, type Keep, type Obj, type Vec } from "./globe/india-globe";

export type SignInPhase = 0 | 1 | 2;
export type SignInHooks = { onPhase: (phase: SignInPhase) => void; onReady: () => void };

export function startSignInScene(canvas: HTMLCanvasElement, still: boolean, hooks: SignInHooks): (() => void) | null {
  const renderer = createRenderer(canvas, 1.5);
  if (!renderer) return null;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200), world = new THREE.Group(); scene.add(world);
  const disposables: Array<{ dispose: () => void }> = [];
  const keep: Keep = item => { disposables.push(item); return item; };

  let wakeLoop = () => undefined as void;
  const earth = buildIndiaGlobe(keep, renderer, { still, cloud: 0.7, focus: 1, scanEvery: 16, onChange: () => wakeLoop(), onReady: hooks.onReady });
  const globe = earth.globe; world.add(globe); world.add(earth.halo);
  const stars = buildStars(keep, 420); scene.add(stars);
  // Calmer than the landing page: only the polar orbiter passes; the labelled INSAT pair is left out.
  const orbiters = buildOrbiters(keep, globe, world, () => wakeLoop(), false);
  for (const item of orbiters.materials) item.material.opacity = item.base * 0.8;

  const flat = (colour: number, opacity = 1) => keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  // The AEGIS desk on the globe.
  const desk = onSphere(78.5, 19, R * 1.006), normal = desk.clone().normalize(), east = new THREE.Vector3(0, 1, 0).cross(normal).normalize(), north = normal.clone().cross(east);
  const lay = (mesh: Obj) => { mesh.position.copy(desk); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal)); globe.add(mesh); return mesh; };
  const deskMark = lay(new THREE.Mesh(keep(new THREE.RingGeometry(0.04, 0.066, 40)), flat(0xffffff)));
  const deskSeal = lay(new THREE.Mesh(keep(new THREE.RingGeometry(0.1, 0.122, 56)), flat(0x4fd08a, 0)));
  const deskPulse = lay(new THREE.Mesh(keep(new THREE.RingGeometry(0.1, 0.112, 56)), flat(0x4fd08a, 0)));

  // The identity provider: a separate place, off the globe.
  const provider = new THREE.Group(); scene.add(provider);
  const providerRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.42, 0.02, 10, 72)), flat(0xffb454)); provider.add(providerRing);
  const providerOuter = new THREE.Mesh(keep(new THREE.TorusGeometry(0.6, 0.008, 8, 72)), flat(0xffb454, 0.5)); provider.add(providerOuter);
  const providerCore = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.16)), flat(0xffb454)); provider.add(providerCore);
  const providerCheck = new THREE.Mesh(keep(new THREE.RingGeometry(0.42, 0.47, 64)), flat(0x4fd08a, 0)); provider.add(providerCheck);

  // The path between them, redrawn as the globe turns, and the token that travels it.
  const pathGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const pathLine = new THREE.Line(pathGeometry, keep(new THREE.LineDashedMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.75, dashSize: 0.07, gapSize: 0.05 }))); scene.add(pathLine);
  const token = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 20, 20)), flat(0xffffff)); scene.add(token);
  const tokenGlow = new THREE.Points(keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()])), keep(new THREE.PointsMaterial({ color: 0xffffff, size: 0.42, map: roundSprite(keep, true), transparent: true, opacity: 0.35, depthWrite: false })));
  token.add(tokenGlow);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointer = (event: PointerEvent) => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
  if (!still && window.matchMedia("(pointer: fine)").matches) window.addEventListener("pointermove", onPointer, { passive: true });

  let width = 1, height = 1, band = false;
  const resize = () => {
    const box = canvas.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    // A short, wide strip (phones and tablets) looks closely at India; a tall panel steps back to show more of the Earth.
    const aspect = width / height; band = aspect > 1.3;
    const depth = band ? 5.9 : 7.1 * Math.min(1.5, Math.max(1, 1.02 / aspect));
    camera.position.set(0, 0, depth);
    // The provider floats in front of the Earth, up and to the right, at a fixed place in the picture.
    const z = 3.9, half = (depth - z) * Math.tan(20 * RAD);
    provider.position.set(half * aspect * (band ? 0.78 : 0.62), half * (band ? -0.05 : 0.58), z); provider.scale.setScalar(band ? 0.36 : 0.44);
  };

  const deskWorld = new THREE.Vector3(), lift = new THREE.Vector3(), points: Vec[] = Array.from({ length: 41 }, () => new THREE.Vector3());
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let time = 0, last = 0, phase: SignInPhase | -1 = -1;

  const draw = (now: number) => {
    const delta = still ? 0 : Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time = still ? 4.35 : time + delta;
    const k = still ? 1 : Math.min(1, delta * 3); pointer.sx += (pointer.x - pointer.sx) * k; pointer.sy += (pointer.y - pointer.sy) * k;
    // India stays put; the view only breathes a few degrees.
    globe.rotation.y = facing(INDIA_CENTRE[0] + (band ? -6 : 1) + (still ? 0 : Math.sin(time * 0.09) * 2.6)) + pointer.sx * 0.09;
    world.rotation.x = (INDIA_CENTRE[1] - (band ? 0.5 : 4)) * RAD + pointer.sy * 0.06;
    stars.position.set(-pointer.sx * 1.5, pointer.sy, 0);
    provider.rotation.set(Math.sin(time * 0.5) * 0.25 - pointer.sy * 0.3, time * 0.35 + pointer.sx * 0.4, 0);
    providerOuter.rotation.x = time * 0.4; providerCore.rotation.y = -time * 0.9;
    earth.update(time, delta); orbiters.update(time);

    world.updateMatrixWorld(true); deskWorld.copy(desk).applyMatrix4(globe.matrixWorld);
    lift.copy(deskWorld).add(provider.position).multiplyScalar(0.5); lift.z += 0.9; lift.y += 0.25;
    for (let i = 0; i <= 40; i++) { const t = i / 40; a.copy(deskWorld).lerp(lift, t); b.copy(lift).lerp(provider.position, t); points[i].copy(a).lerp(b, t); }
    pathGeometry.setFromPoints(points); pathLine.computeLineDistances();

    // One round trip every nine seconds: leave, be checked at the provider, return approved.
    const turn = (time / 9) % 1, out = smooth(0.04, 0.3, turn), checked = smooth(0.36, 0.5, turn), home = smooth(0.58, 0.86, turn), settled = smooth(0.86, 0.92, turn) * (1 - smooth(0.96, 1, turn));
    const u = out - home, f = Math.min(40, Math.max(0, u * 40)), i = Math.min(39, Math.floor(f));
    token.position.copy(points[i]).lerp(points[i + 1], f - i);
    token.material.color.setHex(checked > 0.5 ? 0x4fd08a : 0xffffff); tokenGlow.material.color.setHex(checked > 0.5 ? 0x4fd08a : 0xffffff);
    token.material.opacity = Math.min(1, smooth(0.02, 0.06, turn)) * (1 - smooth(0.86, 0.9, turn)); tokenGlow.material.opacity = token.material.opacity * 0.35;
    const atProvider = out * (1 - smooth(0.56, 0.62, turn));
    providerCheck.material.opacity = checked * (1 - smooth(0.6, 0.75, turn)); providerCheck.scale.setScalar(1 + 0.5 * smooth(0.42, 0.6, turn));
    providerRing.scale.setScalar(1 + 0.08 * atProvider * Math.sin(time * 6));
    deskSeal.material.opacity = settled; deskPulse.material.opacity = settled * (1 - smooth(0.88, 0.98, turn)); deskPulse.scale.setScalar(1 + 2.4 * smooth(0.86, 0.98, turn));
    deskMark.scale.setScalar(1 + 0.12 * Math.sin(time * 2.4));

    const next: SignInPhase = turn < 0.32 ? 0 : turn < 0.58 ? 1 : 2;
    if (!still && next !== phase) { phase = next; hooks.onPhase(next); }
    renderer.render(scene, camera);
  };

  const loop = frameLoop(canvas, still, draw);
  wakeLoop = () => { if (still) loop.wake(); };
  const observer = new ResizeObserver(() => { resize(); if (still) loop.wake(); }); observer.observe(canvas);
  resize();
  return () => { loop.stop(); observer.disconnect(); window.removeEventListener("pointermove", onPointer); disposables.forEach(item => item.dispose()); renderer.dispose(); };
}
