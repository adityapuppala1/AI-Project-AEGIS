// 3D illustration for the sign-in page: the same dotted globe as the landing page, at night. A token leaves the
// AEGIS desk for the identity provider, is checked there, and comes back approved. Decoration only: nothing here
// takes part in the real sign-in, and it is not a map of record or a depiction of boundaries.
import * as THREE from "three";
import { buildGlobe, createRenderer, facing, frameLoop, onSphere, R, RAD, roundSprite, smooth } from "./welcome/welcome-scene";

type Vec = InstanceType<typeof THREE.Vector3>;
export type SignInPhase = 0 | 1 | 2;

export function startSignInScene(canvas: HTMLCanvasElement, still: boolean, onPhase: (phase: SignInPhase) => void): (() => void) | null {
  const renderer = createRenderer(canvas, 1.5);
  if (!renderer) return null;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200), world = new THREE.Group(); scene.add(world);
  const disposables: Array<{ dispose: () => void }> = [];
  const keep = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item; };
  const sprite = roundSprite(keep);

  const { globe, halo } = buildGlobe(keep, { count: 4200, dot: [0.5, 0.66, 0.98], land: [1, 0.66, 0.24], lit: 0x1b3a94, shade: 0x071236, halo: 0x6f9df0, haloStrength: 0.5, dotSize: 0.042 });
  world.add(globe); world.add(halo);

  // Quiet stars behind everything.
  const stars: number[] = [];
  for (let i = 0; i < 420; i++) { const v = new THREE.Vector3(Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 12543.123 % 1, Math.sin(i * 39.425) * 9631.77 % 1).normalize().multiplyScalar(40 + (i % 30)); stars.push(v.x, v.y, -Math.abs(v.z) - 10); }
  const starGeometry = keep(new THREE.BufferGeometry()); starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
  const starField = new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({ color: 0xc9d8ff, size: 1.6, sizeAttenuation: false, map: sprite, transparent: true, opacity: 0.55, depthWrite: false })));
  scene.add(starField);

  const flat = (colour: number, opacity = 1) => keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  // The AEGIS desk on the globe.
  const desk = onSphere(78.5, 19, R * 1.006), normal = desk.clone().normalize(), east = new THREE.Vector3(0, 1, 0).cross(normal).normalize(), north = normal.clone().cross(east);
  const lay = (mesh: InstanceType<typeof THREE.Object3D>) => { mesh.position.copy(desk); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal)); globe.add(mesh); return mesh; };
  const deskMark = lay(new THREE.Mesh(keep(new THREE.RingGeometry(0.06, 0.1, 40)), flat(0xffffff)));
  const deskSeal = lay(new THREE.Mesh(keep(new THREE.RingGeometry(0.15, 0.18, 56)), flat(0x4fd08a, 0)));
  const deskPulse = lay(new THREE.Mesh(keep(new THREE.RingGeometry(0.15, 0.165, 56)), flat(0x4fd08a, 0)));

  // The identity provider: a separate place, off the globe.
  const provider = new THREE.Group(); scene.add(provider);
  const providerRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.42, 0.02, 10, 72)), flat(0xffb454)); provider.add(providerRing);
  const providerOuter = new THREE.Mesh(keep(new THREE.TorusGeometry(0.6, 0.008, 8, 72)), flat(0xffb454, 0.45)); provider.add(providerOuter);
  const providerCore = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.16)), flat(0xffb454)); provider.add(providerCore);
  const providerCheck = new THREE.Mesh(keep(new THREE.RingGeometry(0.42, 0.47, 64)), flat(0x4fd08a, 0)); provider.add(providerCheck);

  // The path between them, redrawn as the globe turns, and the token that travels it.
  const pathGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const pathMaterial = keep(new THREE.LineDashedMaterial({ color: 0x9db8f5, transparent: true, opacity: 0.6, dashSize: 0.14, gapSize: 0.1 }));
  const pathLine = new THREE.Line(pathGeometry, pathMaterial); scene.add(pathLine);
  const token = new THREE.Mesh(keep(new THREE.SphereGeometry(0.085, 20, 20)), flat(0xffffff)); scene.add(token);
  const tokenGlow = new THREE.Points(keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()])), keep(new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, map: roundSprite(keep, true), transparent: true, opacity: 0.35, depthWrite: false })));
  token.add(tokenGlow);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointer = (event: PointerEvent) => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
  if (!still && window.matchMedia("(pointer: fine)").matches) window.addEventListener("pointermove", onPointer, { passive: true });

  let width = 1, height = 1, band = false;
  const resize = () => {
    const box = canvas.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    // A short, wide strip (phones and tablets) shows the globe as a horizon; a tall panel shows all of it.
    const aspect = width / height; band = aspect > 1.7;
    if (band) { camera.position.set(0, 0, 7.4); world.position.set(-Math.min(2.2, aspect * 0.45), -2.75, 0); provider.position.set(Math.min(4.2, aspect * 1.05), 0.3, 0.4); provider.scale.setScalar(0.8); }
    else { camera.position.set(0, 0, 12 * Math.min(1.7, Math.max(1, 1.1 / aspect))); world.position.set(-0.35, 0.1, 0); provider.position.set(2.9, 2.85, 0.8); provider.scale.setScalar(1); }
  };

  const deskWorld = new THREE.Vector3(), lift = new THREE.Vector3(), points: Vec[] = Array.from({ length: 41 }, () => new THREE.Vector3());
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let time = 0, last = 0, phase: SignInPhase | -1 = -1;
  const face = facing(79);

  const draw = (now: number) => {
    const delta = still ? 0 : Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time = still ? 4.35 : time + delta;
    const k = still ? 1 : Math.min(1, delta * 3); pointer.sx += (pointer.x - pointer.sx) * k; pointer.sy += (pointer.y - pointer.sy) * k;
    globe.rotation.y = face + Math.sin(time * 0.13) * 0.28 + pointer.sx * 0.3;
    world.rotation.x = (band ? 52 : 19) * RAD + pointer.sy * 0.16;
    starField.position.set(-pointer.sx * 1.5, pointer.sy, 0);
    provider.rotation.set(Math.sin(time * 0.5) * 0.25 - pointer.sy * 0.3, time * 0.35 + pointer.sx * 0.4, 0);
    providerOuter.rotation.x = time * 0.4; providerCore.rotation.y = -time * 0.9;

    world.updateMatrixWorld(true); deskWorld.copy(desk).applyMatrix4(globe.matrixWorld);
    lift.copy(deskWorld).add(provider.position).multiplyScalar(0.5); lift.z += 2.2; lift.y += 0.5;
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
    if (!still && next !== phase) { phase = next; onPhase(next); }
    renderer.render(scene, camera);
  };

  const loop = frameLoop(canvas, still, draw);
  const observer = new ResizeObserver(() => { resize(); if (still) loop.wake(); }); observer.observe(canvas);
  resize();
  return () => { loop.stop(); observer.disconnect(); window.removeEventListener("pointermove", onPointer); disposables.forEach(item => item.dispose()); renderer.dispose(); };
}
