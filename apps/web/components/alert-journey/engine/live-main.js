/* IndTrana Live Earth — app shell: state/event bus, renderer, camera rig, picking, live-data bootstrap, render loop. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {}, T = g.THREE, M = AX.model, L = AX.live, Q = new URLSearchParams(location.search), $ = function (s) { return document.querySelector(s); };
  var QUAL = { high: { pr: 2, rain: 7000 }, med: { pr: 1.5, rain: 4000 }, low: { pr: 1, rain: 2000 } };
  var LV = AX.LV = {
    T: T, M: M, L: L, quality: Q.get('q') || 'high',
    state: { live: false, mode: 'earth', scale: null, place: null, imagery: 'truecolor', layers: { sats: true, quakes: true, events: true, night: true, borders: true, fx: true, wind: true, labels: true, osm: true, towers: true, pois: true, buildings: true, rainOverlay: false, snowOverlay: false, flood: false, contours: false }, filters: {}, offsetH: 0, motion: 1, view: null, playing: false, speed: 2, timeScale: 1, data: {}, board: null, scenario: { level: 2, mode: 'river' } },
    _ev: {}, on: function (e, f) { (LV._ev[e] = LV._ev[e] || []).push(f); }, emit: function (e, p) { if (!AX.alive) return; (LV._ev[e] || []).forEach(function (f) { try { f(p); } catch (err) { console.error('[live] handler', e, err); } }); }
  };
  var S = LV.state, canvas = $('#gl'), renderer, camera, globe, place3d = null, cc, time = 0, last = 0, simBase = Date.now(), simT0 = performance.now(), hover = null, ptr = null, drag = null, glowScale = 600;
  LV.simMs = function () { return simBase + (performance.now() - simT0) * S.timeScale; };
  LV.setTimeScale = function (k) { simBase = LV.simMs(); simT0 = performance.now(); S.timeScale = k; LV.emit('timescale'); };
  LV.placeMs = function () { return Date.now() + S.offsetH * 3600000; };
  LV.toast = function (title, text, color, icon) { LV.emit('toast', { title: title, text: text, color: color, icon: icon }); };

  /* ---------------- camera rig ---------------- */
  function V() { return new T.Vector3(); }
  cc = { target: V(), tTarget: V(), r: 18, tr: 18, th: 0, tth: 0, ph: 1.2, tph: 1.2, mx: 0.5, my: 0.5 };
  function nearestTh(cur, want) { var d = ((want - cur) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; return cur + d; }
  LV.flyEarth = function (lon, lat, r, immediate) { var d = globe.ll(lon, lat, 1).normalize(); cc.tTarget.set(0, 0, 0); cc.tr = r; cc.tph = Math.acos(d.y); cc.tth = nearestTh(cc.th, Math.atan2(d.x, d.z)); if (immediate) { cc.target.set(0, 0, 0); cc.r = cc.tr; cc.ph = cc.tph; cc.th = cc.tth; } };
  LV.flyPlace = function (immediate) { var sc = S.scale === 'city' ? { r: 150, ph: 0.95, th: 0.6 } : { r: 95, ph: 0.9, th: 0.6 }; cc.tTarget.set(0, 0, 0); cc.tr = sc.r; cc.tph = sc.ph; cc.tth = sc.th; if (immediate) { cc.target.set(0, 0, 0); cc.r = cc.tr; cc.ph = cc.tph; cc.th = cc.tth; } };
  LV.flyFocus = function (x, z) { if (S.mode === 'place') { var y = place3d && place3d.yAt ? place3d.yAt(x, z) : 0; cc.tTarget.set(x, y, z); cc.tr = Math.min(cc.tr, S.scale === 'city' ? 60 : 40); cc.tph = Math.min(cc.tph, 1.1); } };
  LV.faceNorth = function () { cc.tth = nearestTh(cc.th, 0); };
  LV.camPreset = function (name) {
    if (S.mode === 'earth') { var P = S.place || { lat: 20, lon: 80 }; if (name === 'earth') LV.flyEarth(M.clamp(P.lon, -170, 170), 15, 17); else if (name === 'india') LV.flyEarth(80, 21, 10); else if (name === 'place') LV.flyEarth(P.lon, P.lat, 8); return; }
    if (name === 'top') { cc.tph = 0.05; cc.tr = S.scale === 'city' ? 190 : 120; } else if (name === 'oblique') { cc.tph = 1.0; cc.tr = S.scale === 'city' ? 140 : 90; } else if (name === 'low') { cc.tph = 1.35; cc.tr = S.scale === 'city' ? 60 : 40; } else if (name === 'orbitspin') { cc.tth += 1.2; }
  };
  function updateCamera(dt) {
    var k = 1 - Math.exp(-dt * 3.4); cc.target.lerp(cc.tTarget, k); cc.r += (cc.tr - cc.r) * k; cc.ph += (cc.tph - cc.ph) * k; cc.th += (cc.tth - cc.th) * k;
    var par = LV.reduced ? 0 : S.motion * 1.6, th = cc.th + (cc.mx - 0.5) * 0.05 * par, ph = M.clamp(cc.ph + (cc.my - 0.5) * 0.03 * par, 0.001, S.mode === 'earth' ? Math.PI - 0.12 : 1.5), sp = Math.sin(ph);
    camera.position.set(cc.target.x + cc.r * sp * Math.sin(th), cc.target.y + cc.r * Math.cos(ph), cc.target.z + cc.r * sp * Math.cos(th)); camera.lookAt(cc.target); LV.camTh = cc.th; LV.camR = cc.r;
  }
  function clampR(r) { return S.mode === 'earth' ? M.clamp(r, 6.4, 45) : S.scale === 'city' ? M.clamp(r, 12, 330) : M.clamp(r, 14, 220); }
  function setupInput() {
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, btn: e.button, moved: 0, shift: e.shiftKey, px: e.clientX, py: e.clientY }; });
    canvas.addEventListener('pointermove', function (e) {
      lastInput = performance.now(); cc.mx = e.clientX / innerWidth; cc.my = e.clientY / innerHeight; ptr = { x: e.clientX, y: e.clientY, dirty: true };
      if (!drag) return; var dx = e.clientX - drag.px, dy = e.clientY - drag.py; drag.px = e.clientX; drag.py = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.btn === 2 || drag.btn === 1 || drag.shift) { if (S.mode === 'place') { var s = cc.r * 0.0017, rt = new T.Vector3(Math.cos(cc.th), 0, -Math.sin(cc.th)), fw = new T.Vector3(-Math.sin(cc.th), 0, -Math.cos(cc.th)); cc.tTarget.addScaledVector(rt, -dx * s).addScaledVector(fw, dy * s * 1.2); } }
      else { cc.tth -= dx * 0.0052; cc.tph = M.clamp(cc.tph - dy * 0.0046, 0.04, S.mode === 'earth' ? Math.PI - 0.14 : 1.48); }
    });
    function end(e) { var click = drag && drag.moved < 5 && drag.btn === 0; drag = null; if (click) onClick(e.clientX, e.clientY); }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', function () { ptr = null; setHover(null); });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); cc.tr = clampR(cc.tr * Math.exp(e.deltaY * 0.0011)); }, { passive: false });
    canvas.addEventListener('dblclick', function (e) { if (S.mode === 'earth') { var hit = globe.pick(e.clientX, e.clientY, camera, innerWidth, innerHeight); if (hit) { LV.select(hit); return; } var p = globe.rayLatLon(e.clientX, e.clientY, camera, innerWidth, innerHeight); if (p) LV.selectLatLon(p.lat, p.lon, null, true); } });
  }
  function pickNow(x, y) { return S.mode === 'earth' ? globe.pick(x, y, camera, innerWidth, innerHeight) : (place3d && place3d.pick ? place3d.pick(x, y, camera, innerWidth, innerHeight) : null); }
  function setHover(h) { var id = h ? h.id : null; if ((hover && hover.id) !== id) { hover = h; globe.setHover(id); LV.emit('hover', { hit: h, x: ptr && ptr.x, y: ptr && ptr.y }); canvas.style.cursor = h ? 'pointer' : ''; } }
  function onClick(x, y) {
    var hit = pickNow(x, y); if (hit) { LV.select(hit); return; }
    if (S.mode === 'earth') { var p = globe.rayLatLon(x, y, camera, innerWidth, innerHeight); if (p) LV.selectLatLon(p.lat, p.lon, null, false); }
    else LV.select(null);
  }
  LV.selection = null;
  LV.select = function (hit) { LV.selection = hit; globe.setSel(hit ? hit.id : null); if (place3d && place3d.setSel) place3d.setSel(hit ? hit.id : null); if (hit && hit.kind === 'sat') globe.selectSat(hit.ref); else if (!hit || hit.kind !== 'sat') globe.selectSat(null); LV.emit('select', hit); };

  /* ---------------- live data bootstrap ---------------- */
  var lastInput = 0, gov = null;
  /* Deployment gate: live public data follows the project's public-reference switch (start-windows.ps1 -PublicEarth). */
  LV.requestLive = function () {
    return fetch('/api/earth-watch/status', { cache: 'no-store' }).then(function (r) { if (r.status === 503) throw new Error('disabled'); if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .then(function (j) { if (!j || j.enabled !== true || j.display_only !== true) throw new Error('disabled'); LV.goLive(); return true; });
  };
  LV.goLive = function () {
    if (S.live) return; L.enable(); S.live = true; LV.emit('live', true); globe.loadBase();
    L.quakes('4.5_week').then(function (q) { S.data.quakes = q; globe.setQuakes(q); LV.emit('quakes'); }).catch(function () { LV.emit('quakes'); });
    L.events().then(function (e) { S.data.events = e; globe.setEvents(e); LV.emit('events'); }).catch(function () { });
    Promise.all(['weather', 'resource', 'navic', 'insat', 'sentinel'].map(function (gname) { return L.tles(gname).catch(function () { return []; }); })).then(function (arr) { var all = []; arr.forEach(function (a) { all = all.concat(a); }); globe.setSats(all); }).catch(function () { });
  };
  LV.stopLive = function () { L.disable(); S.live = false; LV.emit('live', false); LV.toast('Live data off', 'No further requests will be made. The page keeps what it already loaded.', '#ffb547', 'info'); };

  LV.selectLatLon = function (lat, lon, name, fly) {
    var P = { name: name || ('Point ' + lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°'), lat: lat, lon: lon, admin: '', country: '' }; LV.selectPlace(P, fly);
  };
  LV.selectPlace = function (P, fly) {
    S.place = P; S.board = null; S.data = { quakes: S.data.quakes, events: S.data.events }; globe.setPlace(P); LV.emit('place', P);
    if (S.mode === 'earth' && fly !== false) LV.flyEarth(P.lon, P.lat, 9.5);
    if (!S.live) return; var tk = P.lat + ',' + P.lon;
    function put(k, p) { return p.then(function (v) { if (!S.place || S.place.lat + ',' + S.place.lon !== tk) return; S.data[k] = v; recompute(); LV.emit('data', k); }).catch(function (e) { if (S.place && S.place.lat + ',' + S.place.lon === tk) { S.data[k + 'Err'] = String(e.message || e); LV.emit('data', k); } }); }
    put('forecast', L.forecast(P.lat, P.lon)); put('flood', L.flood(P.lat, P.lon)); put('archive', L.archive(P.lat, P.lon)); put('climate', L.climate(P.lat, P.lon)); put('marine', L.marine(P.lat, P.lon)); put('ensemble', L.ensemble(P.lat, P.lon));
  };
  function recompute() {
    var d = S.data; if (!d.forecast) return; var st = {};
    if (d.archive) { st.rain1d = M.gumbelFit(d.archive.maxP1); st.gust = M.gumbelFit(d.archive.maxGust.filter(function (x) { return x != null; })); st.tmaxP99 = d.archive.tmaxP99; }
    S.board = M.hazardBoard({ hours: d.forecast.hours, t0: Date.now(), stats: st, flood: d.flood ? (d.flood.fit ? d.flood : { fit: null }) : null }); S.stats = st; LV.emit('board');
  }

  /* ---------------- modes and transitions ---------------- */
  function fade(on) { var f = $('#fade'); if (f) f.classList.toggle('on', on); }
  LV.enterPlace = function (scale) {
    if (!S.place) return; if (!S.live) { LV.toast('Live data is off', 'Turn live data on to load the real map, terrain and weather.', '#ffb547', 'alert'); return; }
    fade(true); LV.emit('busy', 'Building the real ' + (scale === 'city' ? 'city map' : 'region') + '…');
    setTimeout(function () {
      if (!AX.alive) return; if (place3d && place3d.dispose) place3d.dispose(); S.scale = scale; S.mode = 'place'; S.offsetH = 0; place3d = AX.buildPlace(LV, S.place, scale); LV.place3d = place3d; LV.flyPlace(true); LV.emit('mode'); AX.root.dataset.mode = 'place';
      place3d.ready.then(function () { LV.emit('busy', null); }, function () { LV.emit('busy', null); }); setTimeout(function () { fade(false); }, 350);
    }, 650);
  };
  LV.backToEarth = function () {
    fade(true); setTimeout(function () { if (!AX.alive) return; S.mode = 'earth'; S.scale = null; if (place3d && place3d.dispose) place3d.dispose(); place3d = null; LV.place3d = null; LV.flyEarth(S.place ? S.place.lon : 80, S.place ? S.place.lat : 20, 9.5, true); LV.emit('mode'); AX.root.dataset.mode = 'earth'; LV.emit('busy', null); setTimeout(function () { fade(false); }, 300); }, 600);
  };

  /* ---------------- boot + loop ---------------- */
  function boot() {
    if (!T || !g.satellite) { LV.emit('nogl'); AX.LiveUI && AX.LiveUI.init(LV); return; }
    try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { LV.emit('nogl'); AX.LiveUI.init(LV); return; }
    var q = QUAL[LV.quality] || QUAL.high; LV.q = q; LV.reduced = !!(g.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || Q.get('rm') === '1';
    AX.disposers.push(function () { try { L.disable(); if (place3d && place3d.dispose) place3d.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* context already released */ } }); renderer.setPixelRatio(Math.min(g.devicePixelRatio || 1, q.pr)); renderer.setClearColor(0x03060f);
    gov = AX.gfx.governor(renderer, q.pr, function () { resize(); }); LV.gov = gov;
    AX.on(document, 'keydown', function (e) { if (/input|textarea|select/i.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return; var k = e.key; if (k === 'ArrowLeft' || k === 'a') cc.tth -= 0.16; else if (k === 'ArrowRight' || k === 'd') cc.tth += 0.16; else if (k === 'ArrowUp' || k === 'w') cc.tph = M.clamp(cc.tph - 0.08, 0.04, S.mode === 'earth' ? Math.PI - 0.14 : 1.48); else if (k === 'ArrowDown' || k === 's') cc.tph = M.clamp(cc.tph + 0.08, 0.04, S.mode === 'earth' ? Math.PI - 0.14 : 1.48); else if (k === '+' || k === '=') cc.tr = clampR(cc.tr * 0.85); else if (k === '-' || k === '_') cc.tr = clampR(cc.tr * 1.18); else return; lastInput = performance.now(); e.preventDefault(); });
    camera = new T.PerspectiveCamera(48, 1, 0.05, 4000); LV.camera = camera; globe = AX.buildGlobe(LV); LV.globe = globe; L.onRequest = function (e) { if (!AX.alive) return; if (S.mode === 'earth') globe.pulse(e.src, e.ok); LV.emit('tx', e); };
    resize(); AX.on(g, 'resize', resize); setupInput(); LV.flyEarth(78, 18, 17, true); AX.root.dataset.mode = 'earth';
    AX.LiveUI.init(LV); requestAnimationFrame(frame);
    if (Q.get('live') === '1') { LV.requestLive().then(function () { LV.emit('autolive'); startFromQuery(); }, function (e) { LV.emit('gate', e.message); startFromQuery(); }); } else startFromQuery();
  }
  function startFromQuery() {
    var p = Q.get('place'); if (p) { var a = p.split(','); LV.selectLatLon(parseFloat(a[0]), parseFloat(a[1]), a[2] ? decodeURIComponent(a[2]) : null, false); LV.flyEarth(parseFloat(a[1]), parseFloat(a[0]), 9.5, true); }
    var sc = Q.get('scale'); if (sc && p) setTimeout(function () { LV.enterPlace(sc); }, 1500);
    if (Q.get('tab')) LV.emit('tab', Q.get('tab'));
  }
  function resize() { if (!renderer) return; renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (innerWidth > 1100) camera.setViewOffset(innerWidth, innerHeight, 105, 0, innerWidth, innerHeight); else camera.clearViewOffset(); glowScale = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)); }
  var lastPick = 0, F = {};
  function frame(ts) {
    if (!AX.alive) return; requestAnimationFrame(frame); if (gov && !gov.shouldDraw(ts)) return; if (gov) gov.sample(Math.min(0.25, (ts - last) / 1000 || 0.016)); var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; time += dt;
    if (S.playing && S.mode === 'place') { S.offsetH = Math.min(168, S.offsetH + dt * S.speed); if (S.offsetH >= 168) S.playing = false; }
    updateCamera(dt); F.time = time; F.dt = dt; F.simMs = LV.simMs(); F.placeMs = LV.placeMs(); F.camera = camera; F.camDist = cc.r; F.W = innerWidth; F.H = innerHeight; F.glowScale = glowScale; LV.F = F;
    if (S.mode === 'earth') { if (!drag && S.motion > 0 && !LV.reduced && !LV.selection && performance.now() - lastInput > 7000) cc.tth += dt * 0.03 * S.motion; globe.update(F); renderer.render(globe.scene, camera); }
    else if (place3d) { place3d.update(F); renderer.render(place3d.scene, camera); }
    if (ptr && ptr.dirty && ts - lastPick > 60 && !drag) { ptr.dirty = false; lastPick = ts; setHover(pickNow(ptr.x, ptr.y)); }
    LV.emit('frame', F);
  }
  LV.rendererInfo = function () { return renderer ? renderer.info.render : null; };
  g.__live = LV;
  AX.bootLive = boot;
}
