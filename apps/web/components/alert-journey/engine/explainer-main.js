/* AEGIS Alert Journey explainer — app shell: renderer, simulation clock, decisions, camera rig, picking, render loop. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {}, C = AX.core, S = AX.story, T = g.THREE;
  var $ = function (s) { return document.querySelector(s); };
  var Q = new URLSearchParams(location.search);
  var QUAL = { high: { terrainN: 190, rain: 5200, wind: 700, trees: 820, people: 540, cars: 46, spiral: 512, pr: 2 }, med: { terrainN: 150, rain: 3000, wind: 420, trees: 520, people: 420, cars: 36, spiral: 384, pr: 1.5 }, low: { terrainN: 110, rain: 1600, wind: 220, trees: 300, people: 300, cars: 24, spiral: 256, pr: 1 } };
  var app = { ctx: null, sim: { t: C.TMIN, playing: false, speed: 1, awaiting: null }, mode: 'space', quality: Q.get('q') || 'high', director: true, decision: { staging: null, cap: null, escalate: null }, emergencyManual: null, reduced: !!(g.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) };
  if (Q.get('rm') === '1') app.reduced = true;
  var F = { t: C.TMIN, st: C.stateAt(C.TMIN), dt: 0.016, time: 0, plan: 'B', cam: null, target: null, camDist: 100, kpi: null, bc: false, selected: null, hover: null, reduced: app.reduced, showRisk: false, showCone: true, light: 1 };
  app.F = F;

  var canvas = $('#gl'), renderer = null, cam = null, ctx = null, env = null, places = null, actors = null, space = null, glow = null;
  var cc = { target: null, tTarget: null, r: 18, tR: 18, th: 0.8, tTh: 0.8, ph: 1.15, tPh: 1.15, follow: null, mx: 0, my: 0 };
  var presets = S.PRESETS;
  var lastTs = 0, time = 0, fpsAcc = 0, fpsN = 0, lowFpsT = 0;

  /* ---------------- scenario helpers ---------------- */
  function emergencyOn() { var t = app.sim.t; if (app.emergencyManual !== null) return app.emergencyManual; return app.decision.escalate === 'go' && t >= -6.2 && t < 6; }
  function planNow() { return app.decision.staging || 'B'; }
  function toast(title, text, color, icon) { if (app.ui) app.ui.toast(title, text, color, icon); }
  function resolveDefaults(from, to) {
    var skipped = []; resolveDefaults0(from, to, skipped);
    if (skipped.length) toast('Explore mode', 'Skipped ' + skipped.length + ' human decision' + (skipped.length > 1 ? 's' : '') + ' (' + skipped.join('; ') + '). The recommended option was assumed. A real system cannot skip these gates.', '#ffb547', 'alert');
  }
  function resolveDefaults0(from, to, skipped) {
    S.DECISIONS.forEach(function (d) {
      if (!app.decision[d.id] && d.t > from && d.t <= to) {
        var def = d.id === 'staging' ? 'B' : d.id === 'cap' ? 'approve' : 'go'; app.decision[d.id] = def;
        skipped.push(d.title.split('·')[1].trim());
      }
    });
  }
  app.setTime = function (t, quiet) {
    t = C.clamp(t, C.TMIN, C.TMAX); var prev = app.sim.t;
    if (t > prev) resolveDefaults(prev, t);
    app.sim.t = t; app.sim.awaiting = null; if (app.ui) { app.ui.closeDecision(); }
    if (!quiet && app.ui) app.ui.onJump(prev, t);
  };
  app.play = function (on) { if (on === undefined) on = !app.sim.playing; if (on && app.sim.t >= C.TMAX - 0.01) app.setTime(C.TMIN, true); app.sim.playing = on; if (app.ui) app.ui.onPlayState(); };
  app.setSpeed = function (s) { app.sim.speed = s; if (app.ui) app.ui.onPlayState(); };
  app.restart = function () { app.decision = { staging: null, cap: null, escalate: null }; app.emergencyManual = null; app.sim.t = C.TMIN; app.sim.awaiting = null; app.sim.playing = false; app.ui && (app.ui.closeDecision(), app.ui.onJump(0, C.TMIN), app.ui.onPlayState()); app.goPreset('orbit'); };
  app.decide = function (id, opt, why) {
    var d = S.DECISIONS.filter(function (x) { return x.id === id; })[0];
    if (id === 'cap' && opt === 'changes') { app.ui.makerRevising(); return; }
    app.decision[id] = opt; app.sim.awaiting = null; app.ui.closeDecision();
    var o = d.options.filter(function (x) { return x.id === opt; })[0];
    toast('Decision recorded', (d.who.split(' (')[0]) + ': ' + o.label + (why ? ' · “' + why + '”' : ''), '#4be3a0', 'check');
    if (id === 'staging') { F.plan = opt; if (actors) actors.buildRoutes(); }
    if (id === 'escalate' && opt === 'go') toast('EMERGENCY MODE', 'Command board opened. Evacuation expanded to Zone B.', '#ff5d6c', 'siren');
    app.sim.playing = true; app.ui.onPlayState();
  };
  app.setPlan = function (p) { app.decision.staging = p; F.plan = p; if (actors) actors.buildRoutes(); if (app.ui) app.ui.onPlanChange(); };

  /* ---------------- camera rig ---------------- */
  var V3 = function () { return new T.Vector3(); };
  function ll2cam(lon, lat, r) { var d = space.ll(lon, lat, 1).normalize(); return { r: r, ph: Math.acos(d.y), th: Math.atan2(d.x, d.z) }; }
  function nearestTh(cur, want) { var d = ((want - cur) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; return cur + d; }
  function fly(p, immediate) {
    cc.tTarget.set(p.target[0], p.target[1], p.target[2]); cc.tR = p.r; cc.tPh = p.phi; cc.tTh = nearestTh(cc.th, p.theta);
    if (immediate) { cc.target.copy(cc.tTarget); cc.r = cc.tR; cc.ph = cc.tPh; cc.th = cc.tTh; }
  }
  var transitioning = false;
  function fadeOverlay(on) { var f = $('#fade'); if (f) f.classList.toggle('on', on); }
  app.dive = function (preset) {
    if (transitioning) return; transitioning = true;
    var c = ll2cam(82, 16.7, 6.4); cc.follow = null; cc.tTarget.set(0, 0, 0); cc.tR = 6.4; cc.tPh = c.ph; cc.tTh = nearestTh(cc.th, c.th);
    setTimeout(function () { fadeOverlay(true); }, 1500);
    setTimeout(function () {
      if (!AX.alive) return;
      app.mode = 'ground'; if (app.ui) app.ui.onMode();
      cc.target.set(0, 0, 0); cc.tTarget.set(0, 0, 0); cc.r = 340; cc.ph = 0.35; cc.th = 0.4; fly(presets[preset || 'region']); cc.tR = presets[preset || 'region'].r;
      setTimeout(function () { fadeOverlay(false); transitioning = false; }, 350);
    }, 2100);
  };
  app.rise = function (preset) {
    if (transitioning) return; transitioning = true; cc.follow = null; fadeOverlay(true);
    setTimeout(function () {
      app.mode = 'space'; if (app.ui) app.ui.onMode(); var c = ll2cam(82, 16.7, 8);
      cc.target.set(0, 0, 0); cc.tTarget.set(0, 0, 0); cc.r = 8; cc.ph = c.ph; cc.th = c.th; var sp = SPACE_PRESETS[preset || 'orbit']; spaceFly(sp);
      setTimeout(function () { fadeOverlay(false); transitioning = false; }, 300);
    }, 600);
  };
  var SPACE_PRESETS = { orbit: { lon: 62, lat: 20, r: 17 }, india: { lon: 82, lat: 20, r: 9.5 }, sea: { lon: 88, lat: 12, r: 9 } };
  function spaceFly(sp) { var c = ll2cam(sp.lon, sp.lat, sp.r); cc.tTarget.set(0, 0, 0); cc.tR = sp.r; cc.tPh = c.ph; cc.tTh = nearestTh(cc.th, c.th); }
  app.goPreset = function (name, opts) {
    opts = opts || {}; if (!opts.keepFollow) cc.follow = null;
    if (SPACE_PRESETS[name]) { if (app.mode !== 'space') { app.rise(name); } else spaceFly(SPACE_PRESETS[name]); app.lastPreset = name; return; }
    if (name === 'dive') { if (app.mode === 'space') app.dive('region'); app.lastPreset = name; return; }
    if (!presets[name]) return;
    app.lastPreset = name;
    if (app.mode === 'space') { app.dive(name); return; }
    fly(presets[name]);
  };
  app.follow = function (kind, id) { cc.follow = kind ? { kind: kind, id: id } : null; if (kind && app.mode === 'ground') { cc.tR = Math.min(cc.tR, 16); cc.tPh = Math.min(cc.tPh, 1.1); } };
  app.camInfo = function () { return { mode: app.mode, r: cc.r, th: cc.th, ph: cc.ph, target: cc.target }; };

  function entityWorldPos(id) {
    var e = ctx.byId[id]; if (!e) return null; var v = V3(); e.anchor.getWorldPosition(v); return v;
  }
  function updateCamera(dt) {
    var k = 1 - Math.exp(-dt * (app.mode === 'space' ? 3.2 : 3.6));
    if (cc.follow && app.mode === 'ground') {
      var p = cc.follow.kind === 'person' ? actors.personaPos() : entityWorldPos(cc.follow.id);
      if (p) cc.tTarget.lerp(p, Math.min(1, dt * 6));
    }
    cc.target.lerp(cc.tTarget, k); cc.r += (cc.tR - cc.r) * k; cc.ph += (cc.tPh - cc.ph) * k; cc.th += (cc.tTh - cc.th) * k;
    var par = app.reduced ? 0 : 1, pth = (cc.mx - 0.5) * 0.07 * par, pph = (cc.my - 0.5) * 0.045 * par;
    var th = cc.th + pth, ph = C.clamp(cc.ph + pph, 0.001, app.mode === 'space' ? Math.PI - 0.1 : Math.PI / 2 - 0.02);
    var sp = Math.sin(ph);
    cam.position.set(cc.target.x + cc.r * sp * Math.sin(th), cc.target.y + cc.r * Math.cos(ph), cc.target.z + cc.r * sp * Math.cos(th));
    if (app.mode === 'ground') {
      var shk = !app.reduced ? C.clamp(F.st.wind - 0.55, 0, 1) * 0.012 * Math.min(cc.r, 40) : 0;
      if (shk > 0) cam.position.add(new T.Vector3((Math.random() - 0.5) * shk, (Math.random() - 0.5) * shk, (Math.random() - 0.5) * shk));
      var gh = ctx.hAt(cam.position.x, cam.position.z); if (cam.position.y < gh + 1.3) cam.position.y = gh + 1.3;
    }
    cam.lookAt(cc.target);
  }
  /* input */
  var drag = null, pointers = {}, pinch0 = 0;
  function userMoved() { if (app.director) { app.director = false; if (app.ui) app.ui.onDirector(); } }
  function setupInput() {
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId); pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      drag = { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey, moved: 0, id: e.pointerId };
      if (Object.keys(pointers).length === 2) { var ps = Object.values(pointers); pinch0 = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); }
    });
    canvas.addEventListener('pointermove', function (e) {
      cc.mx = e.clientX / innerWidth; cc.my = e.clientY / innerHeight; hoverPos = { x: e.clientX, y: e.clientY, dirty: true };
      if (!pointers[e.pointerId]) return; var prev = pointers[e.pointerId]; pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var ps = Object.values(pointers), d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); if (pinch0) { cc.tR = clampR(cc.tR * (pinch0 / d)); } pinch0 = d; userMoved(); return;
      }
      if (!drag) return; var dx = e.clientX - prev.x, dy = e.clientY - prev.y; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4) userMoved();
      if (drag.btn === 2 || drag.btn === 1 || drag.shift) pan(dx, dy);
      else { cc.tTh -= dx * 0.0055; cc.tPh = C.clamp(cc.tPh - dy * 0.0048, 0.04, app.mode === 'space' ? Math.PI - 0.15 : Math.PI / 2 - 0.03); if (cc.follow && drag.moved > 6) { /* keep following while orbiting */ } }
    });
    function end(e) { var wasClick = drag && drag.moved < 5 && drag.btn === 0; delete pointers[e.pointerId]; if (Object.keys(pointers).length < 2) pinch0 = 0; if (wasClick) clickAt(e.clientX, e.clientY); drag = null; }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', function () { hoverPos = null; app.setHover(null); });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); cc.tR = clampR(cc.tR * Math.exp(e.deltaY * 0.0011)); userMoved(); }, { passive: false });
    canvas.addEventListener('dblclick', function (e) { focusAt(e.clientX, e.clientY); });
  }
  function clampR(r) { return app.mode === 'space' ? C.clamp(r, 6.6, 60) : C.clamp(r, 3.5, 360); }
  function pan(dx, dy) {
    if (app.mode === 'space') return; cc.follow = null; var s = cc.r * 0.0017, rt = new T.Vector3(Math.cos(cc.th), 0, -Math.sin(cc.th)), fw = new T.Vector3(-Math.sin(cc.th), 0, -Math.cos(cc.th));
    cc.tTarget.addScaledVector(rt, -dx * s).addScaledVector(fw, dy * s * 1.2); cc.tTarget.x = C.clamp(cc.tTarget.x, -140, 140); cc.tTarget.z = C.clamp(cc.tTarget.z, -140, 140);
  }
  /* picking */
  var ray = new T.Raycaster(), ndc = new T.Vector2(), hoverPos = null, lastPick = 0;
  function chainVisible(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
  function pickAt(x, y) {
    if (!ctx) return null; ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    var roots = [], wantSpace = app.mode === 'space';
    ctx.entities.forEach(function (e) { if (!!e.space !== wantSpace || !e.pick || !ctx.layerOn[e.layer]) return; e.pick.forEach(function (o) { roots.push(o); }); });
    var hits = ray.intersectObjects(roots, true);
    for (var i = 0; i < hits.length; i++) { var o = hits[i].object; if (!chainVisible(o)) continue; var id = o.userData.eid; if (id) return id; }
    return null;
  }
  app.setHover = function (id) { if (F.hover !== id) { F.hover = id; if (app.ui) app.ui.onHover(id, hoverPos); canvas.style.cursor = id ? 'pointer' : ''; } };
  function clickAt(x, y) { var id = pickAt(x, y); if (id) app.select(id); else app.select(null); }
  function focusAt(x, y) {
    var id = pickAt(x, y); if (id) { app.select(id); app.focusEntity(id); return; }
    if (app.mode !== 'ground') return; ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    var p = ray.ray.origin.clone(), d = ray.ray.direction.clone(), i;
    for (i = 0; i < 700; i++) { p.addScaledVector(d, 1.2); if (p.y < ctx.hAt(p.x, p.z)) break; }
    cc.follow = null; cc.tTarget.set(p.x, ctx.hAt(p.x, p.z), p.z); cc.tR = Math.max(10, cc.tR * 0.55); userMoved();
  }
  app.select = function (id) { F.selected = id; if (app.ui) app.ui.onSelect(id); };
  app.focusEntity = function (id, keepFollow) {
    var e = ctx.byId[id]; if (!e) return;
    if (e.space) { if (app.mode !== 'space') return; var v = V3(); e.anchor.getWorldPosition(v); var d = v.clone().normalize(); cc.tTarget.set(0, 0, 0); cc.tPh = Math.acos(d.y); cc.tTh = nearestTh(cc.th, Math.atan2(d.x, d.z)); cc.tR = Math.min(cc.tR, 10); userMoved(); return; }
    if (app.mode !== 'ground') { app.dive('region'); return; }
    var p = entityWorldPos(id); cc.follow = keepFollow ? { kind: 'entity', id: id } : null; cc.tTarget.copy(p); cc.tR = e.kind === 'cyclone' ? 120 : e.kind === 'satellite' || e.kind === 'hub' ? 70 : e.kind === 'team' ? 22 : 18; cc.tPh = Math.min(cc.tPh, 1.15); userMoved();
  };
  app.toggleLayer = function (name, on) {
    if (on === undefined) on = !ctx.layerOn[name]; ctx.layerOn[name] = on;
    (ctx.layers[name] || []).forEach(function (o) { o.visible = on; });
    if (app.ui) app.ui.onLayers();
  };
  app.layerPreset = function (p) {
    var sets = { all: ['water', 'weather', 'cyclone', 'wind', 'buildings', 'roads', 'people', 'towers', 'satellites', 'comms', 'teams', 'risk', 'cone', 'labels'], weather: ['water', 'weather', 'cyclone', 'wind', 'radar', 'cone', 'labels'], network: ['buildings', 'towers', 'coverage', 'satellites', 'comms', 'people', 'labels'], response: ['water', 'buildings', 'roads', 'people', 'teams', 'risk', 'comms', 'labels'] };
    Object.keys(ctx.layerOn).forEach(function (k) { if (k === 'terrain') return; app.toggleLayer(k, sets[p].indexOf(k) > -1); });
  };

  /* ---------------- boot ---------------- */
  function boot() {
    var qd = QUAL[app.quality] || QUAL.high;
    if (!T) { app.nogl = true; return startUI(); }
    try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { app.nogl = true; return startUI(); }
    AX.disposers.push(function () { try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* context already released */ } }); renderer.setPixelRatio(Math.min(g.devicePixelRatio || 1, qd.pr)); renderer.setClearColor(0x050816);
    gov = AX.gfx.governor(renderer, qd.pr, function () { resize(); }); app.gov = gov;
    cam = new T.PerspectiveCamera(48, 1, 0.2, 6000); cc.target = V3(); cc.tTarget = V3();
    var scene = new T.Scene();
    ctx = { T: T, C: C, S: S, G: AX.gfx, scene: scene, q: qd, entities: [], byId: {}, layers: {}, layerOn: { terrain: true, water: true, weather: true, cyclone: true, wind: true, radar: false, buildings: true, roads: true, people: true, towers: true, coverage: false, satellites: true, comms: true, teams: true, risk: true, cone: true, labels: true }, F: F, decision: app.decision };
    Object.defineProperty(ctx, 'decision', { get: function () { return app.decision; } });
    ctx.add = function (layer, obj) { (ctx.layers[layer] = ctx.layers[layer] || []).push(obj); ctx.scene.add(obj); return obj; };
    ctx.reg = function (e) {
      e.pick = e.pick || [];
      if (e.proxyR !== 0 && e.anchor && e.kind !== 'cyclone' && e.kind !== 'place' && e.kind !== 'person' && e.kind !== 'hotspot' && e.kind !== 'staging') {
        var pr = e.proxyR || ({ tower: 1.5, team: 1.1, satellite: 2.4, hub: 3, shelter: 2, facility: 1.8, gauge: 1.0 }[e.kind] || 1.4), px = new T.Mesh(new T.SphereGeometry(pr, 8, 6), new T.MeshBasicMaterial({ visible: false }));
        px.position.y = e.kind === 'tower' ? 2.4 : e.kind === 'team' ? 0.4 : e.kind === 'satellite' || e.kind === 'hub' ? 0 : 1; e.anchor.add(px); e.pick.push(px);
      }
      e.pick.forEach(function (o) { o.traverse(function (n) { n.userData.eid = e.id; }); });
      ctx.entities.push(e); ctx.byId[e.id] = e; return e;
    };
    glow = AX.gfx.glowBatch(7000, true); ctx.glow = glow; scene.add(glow.obj);
    env = AX.buildEnvironment(ctx); places = AX.buildPlaces(ctx); actors = AX.buildActors(ctx, places); space = AX.buildSpace(ctx);
    ctx.F = F; F.cam = cam.position; F.target = cc.target; app.ctx = ctx;
    var yard = new T.Mesh(new T.RingGeometry(1.8, 2.1, 36).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xff9d3c, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false })); yard.position.set(16, ctx.hAt(16, 4) + 0.2, 4); ctx.scene.add(yard); app.yard = yard;
    var selRing = new T.Mesh(new T.RingGeometry(1, 1.12, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false, depthTest: false }));
    var selBeam = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 40, 6, 1, true), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false }));
    selRing.renderOrder = selBeam.renderOrder = 30; selRing.visible = selBeam.visible = false; scene.add(selRing, selBeam); app.selRing = selRing; app.selBeam = selBeam;
    app.env = env; app.places = places; app.actors = actors; app.space = space;
    ctx.actorsTeamAt = actors.teamAt; ctx.actorsPeople = actors.people; ctx.actorsTeams = actors.teams;
    app.panTo = function (x, z) { cc.follow = null; cc.tTarget.set(x, ctx.hAt(x, z), z); };
    cc.target.set(0, 0, 0); var c0 = ll2cam(62, 20, 17); cc.th = cc.tTh = c0.th; cc.ph = cc.tPh = c0.ph; cc.r = cc.tR = 17;
    setupInput(); resize(); AX.on(g, 'resize', resize);
    startUI();
  }
  function resize() {
    if (!renderer) return; renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    if (innerWidth > 1100) cam.setViewOffset(innerWidth, innerHeight, 105, 0, innerWidth, innerHeight); else cam.clearViewOffset();
    var sc = renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360)); glow.setScale(sc); (space.glows || []).forEach(function (gb) { gb.setScale(sc); });
  }
  function startUI() {
    app.ui = AX.UI; AX.UI.init(app, ctx);
    var tq = Q.get('t'); if (tq !== null) app.setTime(parseFloat(tq), true);
    if (ctx) {
      if (Q.get('layers')) { var want = Q.get('layers').split(','); Object.keys(ctx.layerOn).forEach(function (k) { if (k !== 'terrain') app.toggleLayer(k, want.indexOf(k) > -1); }); }
      var cm = Q.get('cam'); if (cm) { app.director = Q.get('dir') === '1'; if (SPACE_PRESETS[cm]) { spaceFly(SPACE_PRESETS[cm]); } else if (presets[cm]) { app.mode = 'ground'; fly(presets[cm], true); } AX.UI.onDirector(); AX.UI.onMode(); }
      if (Q.get('dec')) { var dd = Q.get('dec').split(','); app.decision.staging = dd[0] || null; app.decision.cap = dd[1] || null; app.decision.escalate = dd[2] || null; F.plan = planNow(); }
      if (Q.get('sel')) app.select(Q.get('sel'));
      if (Q.get('play') === '1') app.play(true);
      if (Q.get('em') === '1') app.emergencyManual = true;
      AX.UI.onPlayState();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- frame ---------------- */
  var lastDirSwitch = 0, dirWant = null, dirSince = 0, gov = null;
  function frame(ts) {
    if (!AX.alive) return;
    requestAnimationFrame(frame);
    if (gov && !gov.shouldDraw(ts)) return;
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016); lastTs = ts; if (gov) gov.sample(dt); time += dt; F.dt = dt; F.time = time; F.reduced = app.reduced;
    var sim = app.sim;
    if (sim.playing && !sim.awaiting) {
      var prev = sim.t, rate = 0.9 * sim.speed * S.rateFactor(sim.t); sim.t = Math.min(C.TMAX, sim.t + dt * rate);
      for (var di = 0; di < S.DECISIONS.length; di++) {
        var d = S.DECISIONS[di];
        if (!app.decision[d.id] && prev < d.t && sim.t >= d.t) { sim.t = d.t; sim.awaiting = d.id; sim.playing = false; app.ui.onPlayState(); app.ui.openDecision(d); break; }
      }
      if (sim.t >= C.TMAX) { sim.playing = false; app.ui.onPlayState(); app.ui.onEnd(); }
      if (!sim.awaiting) app.ui.onTick(prev, sim.t);
    }
    F.t = sim.t; F.st = C.stateAt(F.t); F.plan = planNow(); F.emergency = emergencyOn();
    F.bc = (ctx && ctx.BCAST || [[-17.5, -16.4], [-2.4, -1.5]]).some(function (b) { return F.t >= b[0] && F.t <= b[1]; });
    F.showRisk = F.st.pred.has; F.showCone = F.t < 6;
    if (app.nogl) { app.ui.update(F); return; }
    // director
    if (app.director && !transitioning) {
      var want = S.directorAt(F.t);
      if (want !== dirWant) { dirWant = want; dirSince = time; }
      if (dirWant && dirWant !== app.lastPreset && time - dirSince > (sim.playing ? 0.15 : 0.5)) app.goPreset(dirWant, { keepFollow: false });
    }
    updateCamera(dt);
    // fps guard
    fpsAcc += dt; fpsN++; if (fpsAcc > 2) { var fps = fpsN / fpsAcc; F.fps = fps; fpsAcc = 0; fpsN = 0; if (fps < 24 && app.quality !== 'low') { lowFpsT++; if (lowFpsT >= 2) { lowFpsT = 0; app.ui.suggestQuality(); } } else lowFpsT = 0; }
    if (app.mode === 'ground') {
      glow.begin();
      env.update(F); places.update(F); actors.update(F);
      // staging + hotspot markers
      var stg = ctx.layerOn.teams && F.t > -31;
      places.markers.forEach(function (m) { m.g.visible = stg && app.decision.staging !== 'A'; m.ring.material.color.setHex(app.decision.staging === 'B' ? 0x4be3a0 : 0x38e1ff); m.ring.scale.setScalar(1 + 0.08 * Math.sin(time * 3)); });
      app.yard.visible = ctx.layerOn.teams && app.decision.staging === 'A' && F.t > -26;
      S.HOTSPOTS.forEach(function (h) { h.ring.visible = ctx.layerOn.risk && F.t > -36; h.ring.scale.setScalar(1 + 0.2 * Math.sin(time * 4 + h.x)); });
      glow.end();
      if (F.selected && ctx.byId[F.selected] && !ctx.byId[F.selected].space) {
        var sp = entityWorldPos(F.selected); app.selRing.visible = app.selBeam.visible = true; var sz = ctx.byId[F.selected].kind === 'cyclone' ? 40 : 1.6;
        app.selRing.position.set(sp.x, ctx.hAt(sp.x, sp.z) + 0.25, sp.z); app.selRing.scale.setScalar(sz * (1 + 0.1 * Math.sin(time * 5))); app.selBeam.position.set(sp.x, ctx.hAt(sp.x, sp.z) + 20, sp.z);
      } else { app.selRing.visible = app.selBeam.visible = false; }
      renderer.render(ctx.scene, cam);
    } else {
      var sg = space.glow; sg.begin(); space.update(F); sg.end();
      renderer.render(space.scene, cam);
    }
    if (hoverPos && hoverPos.dirty && ts - lastPick > 55 && !drag) { hoverPos.dirty = false; lastPick = ts; app.setHover(pickAt(hoverPos.x, hoverPos.y)); }
    app.ui.update(F, cam, renderer);
  }
  app.setQuality = function (qn) { var u = new URL(location.href); u.searchParams.set('q', qn); location.href = u.toString(); };
  app.toggleFullscreen = function () { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); else document.exitFullscreen && document.exitFullscreen(); };
  g.__aegis = app;
  AX.bootExercise = boot;
}
