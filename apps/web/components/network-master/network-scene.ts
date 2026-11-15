// Schematic 3D scene for the Network Identifier Master: a plain sphere, one satellite on an orbit ring, one lattice
// tower with signal rings, and a link line coloured by the selected provider's rehearsal state. Purely illustrative:
// not a real orbit, position, coverage or connection. Three.js r128, already an app dependency (see components/globe).
// Pausable; reduced motion renders a still frame; any WebGL failure returns null so the caller shows the 2D schematic.
import * as THREE from "three";

export type Focus = "satellite" | "tower" | null;
export type LinkState = "up" | "degraded" | "down";
export interface NetworkScene { setFocus(focus: Focus, state: LinkState, colour: string): void; setPaused(paused: boolean): void; dispose(): void }

const LINK_COLOUR: Record<LinkState, number> = { up: 0x22c55e, degraded: 0xf59e0b, down: 0xef4444 };

export function createNetworkScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean; dark: boolean }): NetworkScene | null {
  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch { return null; }
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 2.6, 8.8);
  camera.lookAt(0, -0.15, 0);
  scene.add(new THREE.AmbientLight(0xffffff, options.dark ? 0.55 : 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(4, 5, 6); scene.add(sun);

  const ink = options.dark ? 0xcbd5e1 : 0x334155;
  const earth = new THREE.Mesh(keep(new THREE.SphereGeometry(1.6, 48, 32)),
    keep(new THREE.MeshPhongMaterial({ color: options.dark ? 0x1e3a5f : 0xdbeafe, emissive: options.dark ? 0x0b1a2e : 0x000000, shininess: 12 })));
  scene.add(earth);
  const grid = new THREE.LineSegments(keep(new THREE.WireframeGeometry(keep(new THREE.SphereGeometry(1.605, 18, 12)))),
    keep(new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.18 })));
  scene.add(grid);

  // Orbit ring and satellite.
  const orbitRadius = 2.75, tilt = 0.22;
  const orbitGroup = new THREE.Group(); orbitGroup.rotation.x = tilt; scene.add(orbitGroup);
  const ringPoints: InstanceType<typeof THREE.Vector3>[] = [];
  for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; ringPoints.push(new THREE.Vector3(Math.cos(a) * orbitRadius, 0, Math.sin(a) * orbitRadius)); }
  const ringMaterial = keep(new THREE.LineDashedMaterial({ color: ink, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.55 }));
  const ring = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(ringPoints)), ringMaterial);
  ring.computeLineDistances(); orbitGroup.add(ring);
  const satellite = new THREE.Group();
  const bodyMaterial = keep(new THREE.MeshPhongMaterial({ color: 0xe2e8f0, emissive: 0x000000 }));
  satellite.add(new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.22, 0.32)), bodyMaterial));
  const panelMaterial = keep(new THREE.MeshPhongMaterial({ color: 0x1d4ed8, emissive: 0x0a1f5c, side: THREE.DoubleSide }));
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 0.02, 0.22)), panelMaterial);
    panel.position.x = side * 0.38; satellite.add(panel);
  }
  orbitGroup.add(satellite);

  // Lattice tower on the surface, facing the camera.
  const towerGroup = new THREE.Group();
  const towerMaterial = keep(new THREE.LineBasicMaterial({ color: ink }));
  const h = 0.9, base = 0.22, top = 0.05, levels = 5;
  const pts: number[] = [];
  const corner = (y: number, i: number) => { const w = base + (top - base) * (y / h); const a = (i / 4) * Math.PI * 2 + Math.PI / 4; return [Math.cos(a) * w, y, Math.sin(a) * w]; };
  for (let l = 0; l < levels; l++) {
    const y0 = (l / levels) * h, y1 = ((l + 1) / levels) * h;
    for (let i = 0; i < 4; i++) {
      pts.push(...corner(y0, i), ...corner(y1, i));            // legs
      pts.push(...corner(y1, i), ...corner(y1, (i + 1) % 4));  // ring
      pts.push(...corner(y0, i), ...corner(y1, (i + 1) % 4));  // cross brace
    }
  }
  const towerGeometry = keep(new THREE.BufferGeometry());
  towerGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  towerGroup.add(new THREE.LineSegments(towerGeometry, towerMaterial));
  const pulses: InstanceType<typeof THREE.Mesh>[] = [];
  for (let i = 0; i < 3; i++) {
    const pulse = new THREE.Mesh(keep(new THREE.RingGeometry(0.1, 0.12, 40)),
      keep(new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6, side: THREE.DoubleSide })));
    pulse.position.y = h; towerGroup.add(pulse); pulses.push(pulse);
  }
  const towerSpot = new THREE.Vector3(-0.45, 0.8, 0.6).normalize().multiplyScalar(1.6);
  towerGroup.position.copy(towerSpot);
  towerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), towerSpot.clone().normalize());
  scene.add(towerGroup);

  // Link line from the tower top to the satellite.
  const linkGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const linkMaterial = keep(new THREE.LineDashedMaterial({ color: LINK_COLOUR.up, dashSize: 0.1, gapSize: 0.06 }));
  const link = new THREE.Line(linkGeometry, linkMaterial); scene.add(link);

  let focus: Focus = null, state: LinkState = "up", paused = options.reducedMotion, angle = -0.5, frame = 0, last = 0, disposed = false;
  const highlight = new THREE.Color();

  const resize = () => {
    const width = canvas.clientWidth || 600, height = canvas.clientHeight || 320;
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  };
  const place = (time: number) => {
    satellite.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(towerGroup.quaternion).add(towerGroup.position);
    const sat = satellite.getWorldPosition(new THREE.Vector3());
    linkGeometry.setFromPoints([top, sat]); link.computeLineDistances();
    // Hide the line while the planet is between the tower and the satellite (closest point of the segment inside the sphere).
    const seg = sat.clone().sub(top), along = Math.max(0, Math.min(1, -top.dot(seg) / seg.lengthSq()));
    const blocked = top.clone().add(seg.multiplyScalar(along)).length() < 1.6;
    link.visible = state !== "down" && !blocked;
    linkMaterial.color.setHex(LINK_COLOUR[state]);
    pulses.forEach((pulse, i) => {
      const phase = paused ? (i + 1) / 4 : ((time / 1600) + i / 3) % 1;
      const scale = 1 + phase * 5; pulse.scale.set(scale, scale, scale);
      (pulse.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = state === "down" ? 0.08 : 0.6 * (1 - phase);
      pulse.rotation.x = -Math.PI / 2;
    });
    const glowSat = focus === "satellite" ? 0.55 : 0, glowTower = focus === "tower" ? 1 : 0;
    bodyMaterial.emissive.copy(highlight).multiplyScalar(glowSat);
    towerMaterial.color.setHex(ink).lerp(highlight, glowTower);
  };
  const render = (time: number) => { place(time); renderer.render(scene, camera); };
  const loop = (time: number) => {
    if (disposed) return;
    const delta = last ? Math.min(64, time - last) : 16; last = time;
    if (!paused) { angle += delta * 0.00025; earth.rotation.y += delta * 0.00004; grid.rotation.y = earth.rotation.y; }
    render(time);
    frame = paused ? 0 : requestAnimationFrame(loop);
  };
  const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; };
  canvas.addEventListener("webglcontextlost", lost);
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { resize(); if (paused) render(0); }) : null;
  observer?.observe(canvas);
  resize();
  render(0);
  if (!paused) frame = requestAnimationFrame(loop);

  return {
    setFocus(next, nextState, colour) {
      focus = next; state = nextState; highlight.set(colour);
      if (paused) render(0);
    },
    setPaused(next) {
      if (options.reducedMotion) next = true;
      if (next === paused) return;
      paused = next; last = 0;
      if (paused) { cancelAnimationFrame(frame); frame = 0; render(0); } else frame = requestAnimationFrame(loop);
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      disposables.forEach(item => item.dispose()); renderer.dispose();
    },
  };
}
