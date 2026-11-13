/* IndTrana Live Earth — the real Earth: NASA GIBS imagery, real day/night terminator, real satellites (TLE + SGP4),
 * USGS earthquakes, NASA EONET events and storm tracks, tsunami wavefront. Display only. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};
  var INDIA = [[74.5, 37], [77, 35.5], [79, 34], [78.9, 32.5], [80.2, 30.5], [81, 30], [80, 28.8], [84, 27.4], [88, 27.2], [89, 26.8], [92, 26.9], [95, 28.3], [97, 28.2], [96, 27], [95, 26], [94.5, 24], [93.4, 22.9], [92, 24.5], [91.5, 25.2], [90, 25.2], [89, 26], [88.5, 24.5], [89, 22], [88.8, 21.6], [87, 21.5], [86.9, 20.5], [85, 19.5], [83, 17.5], [82, 16.5], [80.3, 15.5], [80.1, 13.5], [80.3, 12], [79.8, 10.3], [78.8, 9.3], [77.5, 8.1], [76.5, 9], [75.5, 11.5], [74.8, 13], [74, 15], [73, 17.5], [72.8, 19.5], [72.7, 21], [70.5, 20.8], [69, 22.3], [70.5, 23], [68.2, 23.7], [68.5, 24.3], [70.5, 25.7], [71.5, 27.8], [70, 28], [69.5, 29.5], [71.5, 30], [73.5, 32], [74.5, 34.5]];
  var EMOJI = { storm: '🌀', flood: '🌊', snow: '❄️', fire: '🔥', volcano: '🌋', heat: '🌡️', dust: '🌫️', drought: '☀️', landslide: '⛰️', ice: '🧊', quake: '💥', water: '💧', manmade: '⚠️', other: '•' };
  var CATCOL = { weather: [1, 0.72, 0.28], eo: [0.22, 0.88, 1], nav: [0.7, 0.5, 1], other: [0.85, 0.9, 1] };

  AX.buildGlobe = function (LV) {
    var T = THREE, M = AX.model, L = AX.live, G = AX.gfx, R = 5, K = R / 6371, out = {}, scene = new T.Scene(), globe = new T.Group();
    scene.add(globe); out.scene = scene; out.R = R;
    function ll(lon, lat, r) { var p = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180; return new T.Vector3(-r * Math.sin(p) * Math.cos(th), r * Math.cos(p), r * Math.sin(p) * Math.sin(th)); }
    out.ll = ll;
    out.fromPoint = function (p) { var lat = Math.asin(M.clamp(p.y / p.length(), -1, 1)) * 180 / Math.PI, lon = Math.atan2(p.z, -p.x) * 180 / Math.PI - 180; return { lat: lat, lon: ((lon + 540) % 360) - 180 }; };

    /* stars */
    var sp = [], i; for (i = 0; i < 2200; i++) { var v = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(300 + Math.random() * 300); sp.push(v.x, v.y, v.z); }
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false })));

    /* Earth */
    function dtex(r, gg, b) { var t = new T.DataTexture(new Uint8Array([r, gg, b, 255]), 1, 1, T.RGBAFormat); t.needsUpdate = true; return t; }
    var U = { uBase: { value: dtex(8, 22, 50) }, uDay: { value: dtex(0, 0, 0) }, uNight: { value: dtex(0, 0, 0) }, uOver: { value: dtex(0, 0, 0) }, uSun: { value: new T.Vector3(1, 0.2, 0.4) }, uDayOn: { value: 0 }, uNightOn: { value: 0 }, uOverOn: { value: 0 } };
    var earth = new T.Mesh(new T.SphereGeometry(R, 128, 96), new T.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform sampler2D uBase,uDay,uNight,uOver; uniform vec3 uSun; uniform float uDayOn,uNightOn,uOverOn; varying vec2 vUv; varying vec3 vN;\n' +
        'void main(){ vec3 base=texture2D(uBase,vUv).rgb; vec4 d=texture2D(uDay,vUv); float has=smoothstep(0.02,0.12,max(d.r,max(d.g,d.b)))*uDayOn; base=pow(base,vec3(0.78))*1.3; vec3 day=mix(base,d.rgb,has);\n' +
        ' float ndl=dot(normalize(vN),normalize(uSun)); float lit=smoothstep(-0.10,0.22,ndl); vec3 night=texture2D(uNight,vUv).rgb;\n' +
        ' vec3 col=day*(0.09+1.02*lit); col+=night*vec3(1.0,0.78,0.45)*(1.0-lit)*uNightOn*1.7;\n' +
        ' vec4 o=texture2D(uOver,vUv); col=mix(col,o.rgb,o.a*uOverOn*0.93);\n' +
        ' float tw=exp(-pow(ndl/0.12,2.0)); col+=vec3(0.95,0.4,0.12)*tw*0.07; gl_FragColor=vec4(col,1.0); }'
    }));
    globe.add(earth); out.earth = earth;
    var ov = G.canvas(2048, 1024, function (x) {
      x.strokeStyle = 'rgba(160,200,255,.12)'; x.lineWidth = 1;
      for (var lo = -180; lo <= 180; lo += 30) { x.beginPath(); x.moveTo((lo + 180) / 360 * 2048, 0); x.lineTo((lo + 180) / 360 * 2048, 1024); x.stroke(); }
      for (var la = -90; la <= 90; la += 30) { x.beginPath(); x.moveTo(0, (90 - la) / 180 * 1024); x.lineTo(2048, (90 - la) / 180 * 1024); x.stroke(); }
      x.beginPath(); INDIA.forEach(function (p, k) { var px = (p[0] + 180) / 360 * 2048, py = (90 - p[1]) / 180 * 1024; k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.strokeStyle = 'rgba(255,205,120,.9)'; x.lineWidth = 2.2; x.shadowColor = '#ffb547'; x.shadowBlur = 8; x.stroke();
    });
    var grat = new T.Mesh(new T.SphereGeometry(R * 1.0015, 96, 64), new T.MeshBasicMaterial({ map: new T.CanvasTexture(ov), transparent: true, depthWrite: false })); globe.add(grat); out.grat = grat;
    globe.add(new T.Mesh(new T.SphereGeometry(R * 1.12, 48, 32), new T.ShaderMaterial({ transparent: true, side: T.BackSide, blending: T.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 n; void main(){ n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 n; void main(){ float i=pow(max(0.72-dot(n,vec3(0.,0.,1.)),0.),3.); gl_FragColor=vec4(0.25,0.7,1.,1.)*i; }' })));
    var glow = G.glowBatch(1500, true); scene.add(glow.obj); out.glow = glow;

    /* ---------------- imagery (NASA GIBS) ---------------- */
    var ytd = new Date(Date.now() - 86400000).toISOString().slice(0, 10); out.imageryDate = ytd;
    function tex(img) { var t = new T.Texture(img); t.needsUpdate = true; t.anisotropy = 8; t.minFilter = T.LinearMipmapLinearFilter; return t; }
    function loadInto(uni, src, url, label, then) { return L.loadImage(src, url, label).then(function (im) { var old = U[uni].value; U[uni].value = tex(im); if (old && old.dispose) old.dispose(); if (then) then(); }).catch(function () { }); }
    var overCache = {};
    out.loadBase = function () {
      var hd = LV.quality !== 'low';
      var a = loadInto('uBase', 'gibs', L.gibsUrl({ layer: 'BlueMarble_NextGeneration', w: 2048, h: 1024 }), 'Blue Marble', function () { LV.emit('imagery'); });
      var b = loadInto('uDay', 'gibs', L.gibsUrl({ layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', w: 2048, h: 1024, time: ytd }), 'MODIS true colour ' + ytd, function () { U.uDayOn.value = 1; LV.emit('imagery'); });
      var c = loadInto('uNight', 'gibs', L.gibsUrl({ layer: 'VIIRS_Black_Marble', w: 2048, h: 1024 }), 'VIIRS night lights', function () { U.uNightOn.value = 1; LV.emit('imagery'); });
      Promise.all([a, b, c]).then(function () { if (hd) loadInto('uDay', 'gibs', L.gibsUrl({ layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', w: 4096, h: 2048, time: ytd }), 'MODIS true colour (HD)', function () { U.uDayOn.value = 1; }); }).catch(function () { });
    };
    out.setImagery = function (mode) {
      LV.state.imagery = mode;
      if (mode === 'none') { U.uDayOn.value = 0; U.uOverOn.value = 0; return; }
      U.uDayOn.value = 1;
      if (mode === 'truecolor') { U.uOverOn.value = 0; return; }
      var defs = { rain: { layer: 'IMERG_Precipitation_Rate', fmt: 'image/png', time: null, label: 'IMERG rain rate (latest)' }, snow: { layer: 'MODIS_Terra_NDSI_Snow_Cover', fmt: 'image/png', time: ytd, label: 'MODIS snow cover ' + ytd }, sst: { layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', fmt: 'image/png', time: ytd, label: 'Sea-surface temperature ' + ytd } };
      var d = defs[mode]; if (!d) return;
      if (overCache[mode]) { U.uOver.value = overCache[mode]; U.uOverOn.value = 1; return; }
      L.loadImage('gibs', L.gibsUrl({ layer: d.layer, fmt: d.fmt, transparent: true, w: 1024, h: 512, time: d.time }), d.label).then(function (im) { overCache[mode] = tex(im); if (LV.state.imagery === mode) { U.uOver.value = overCache[mode]; U.uOverOn.value = 1; } }).catch(function () { });
    };

    /* ---------------- satellites (CelesTrak TLE + SGP4) ---------------- */
    var sats = [], selSat = null, orbitLine = null, footLine = null;
    function epochMs(l1) { var yy = +l1.slice(18, 20), d = parseFloat(l1.slice(20, 32)); return Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (d - 1) * 86400000; }
    function catOf(n) { return /NOAA|METEOSAT|GOES|HIMAWARI|FENGYUN|FY-|METOP|DMSP|INSAT|MSG|ELEKTRO|GEO-KOMPSAT|JPSS|SUOMI|NPP|METEOR|MTG/i.test(n) ? 'weather' : /SENTINEL|LANDSAT|TERRA|AQUA|CARTOSAT|RISAT|RESOURCESAT|OCEANSAT|SCATSAT|EOS|SMOS|WORLDVIEW|PLEIADES|SPOT|ALOS|RADARSAT|CBERS|HJ-/i.test(n) ? 'eo' : /IRNSS|NAVIC|GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU/i.test(n) ? 'nav' : 'other'; }
    out.setSats = function (tles) {
      var seen = {}, now = Date.now(); sats = [];
      tles.forEach(function (t) {
        if (seen[t.name] || now - epochMs(t.l1) > 25 * 86400000) return; seen[t.name] = 1;
        var rec; try { rec = satellite.twoline2satrec(t.l1, t.l2); } catch (e) { return; }
        var cat = catOf(t.name), periodMin = 2 * Math.PI / rec.no;
        sats.push({ id: 'sat:' + t.name, name: t.name.replace(/\s*\(.*\)$/, '').trim(), full: t.name, rec: rec, cat: cat, col: CATCOL[cat], periodMin: periodMin, geo: periodMin > 1300 && periodMin < 1600, group: t.group, pos: new T.Vector3(), alt: 0, vis: false, ok: false, epoch: epochMs(t.l1) });
      });
      LV.emit('sats');
    };
    out.sats = function () { return sats; };
    function propagate(s, date, gmst) { var pv = satellite.propagate(s.rec, date); if (!pv || !pv.position) { s.ok = false; return false; } var e = satellite.eciToEcf(pv.position, gmst); s.pos.set(e.x * K, e.z * K, -e.y * K); s.alt = Math.hypot(pv.position.x, pv.position.y, pv.position.z) - 6371; s.ok = true; s.vel = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0; return true; }
    out.selectSat = function (s) {
      selSat = s; if (orbitLine) { scene.remove(orbitLine); orbitLine = null; } if (footLine) { scene.remove(footLine); footLine = null; }
      if (!s) return;
      var t0 = new Date(LV.simMs()), pts = [], n = 180, N = s.geo ? 120 : n;
      for (var q = 0; q <= N; q++) { var d = new Date(t0.getTime() + (q / N) * s.periodMin * 60000), pv = satellite.propagate(s.rec, d); if (!pv.position) continue; var p = pv.position; pts.push(new T.Vector3(p.x * K, p.z * K, -p.y * K)); }   // inertial ring (gmst=0), rotated each frame
      orbitLine = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: new T.Color(s.col[0], s.col[1], s.col[2]), transparent: true, opacity: 0.8 })); orbitLine.userData.g0 = satellite.gstime(t0); scene.add(orbitLine);
      var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.BufferAttribute(new Float32Array(73 * 3), 3));
      footLine = new T.Line(fg, new T.LineBasicMaterial({ color: new T.Color(s.col[0], s.col[1], s.col[2]), transparent: true, opacity: 0.9 })); footLine.frustumCulled = false; scene.add(footLine);
    };
    /* look angles from the selected place: used for 'visible now' counts and next passes */
    out.lookAngles = function (s, lat, lon, date) {
      var pv = satellite.propagate(s.rec, date); if (!pv || !pv.position) return null; var gmst = satellite.gstime(date), e = satellite.eciToEcf(pv.position, gmst);
      var la = satellite.ecfToLookAngles({ longitude: lon * Math.PI / 180, latitude: lat * Math.PI / 180, height: 0 }, e);
      return { el: la.elevation * 180 / Math.PI, az: la.azimuth * 180 / Math.PI, range: la.rangeSat };
    };
    out.nextPasses = function (s, lat, lon, hours, minEl) {
      var t0 = LV.simMs(), step = s.geo ? 600000 : 30000, passes = [], cur = null, steps = Math.round(hours * 3600000 / step);
      for (var q = 0; q <= steps; q++) {
        var la = out.lookAngles(s, lat, lon, new Date(t0 + q * step)); if (!la) continue;
        if (la.el >= (minEl || 10)) { if (!cur) cur = { start: t0 + q * step, max: la.el, maxT: t0 + q * step }; if (la.el > cur.max) { cur.max = la.el; cur.maxT = t0 + q * step; } cur.end = t0 + q * step; }
        else if (cur) { passes.push(cur); cur = null; if (passes.length >= 4) break; }
      }
      if (cur) passes.push(cur); return passes;
    };

    /* ---------------- quakes, events, storm tracks ---------------- */
    var quakes = [], events = [], eventSprites = [], trackLines = null, swirls = [];
    out.setQuakes = function (list) { quakes = list; quakes.forEach(function (q) { q.pos = ll(q.lon, q.lat, R * 1.004); q.id = 'quake:' + q.id; }); };
    out.quakes = function () { return quakes; };
    var iconCache = {};
    function icon(cat) { if (iconCache[cat]) return iconCache[cat]; var c = G.canvas(96, 96, function (x) { x.fillStyle = 'rgba(8,14,34,.82)'; x.beginPath(); x.arc(48, 48, 40, 0, 7); x.fill(); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 3; x.stroke(); x.font = '44px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(EMOJI[cat] || '•', 48, 52); }); return (iconCache[cat] = new T.CanvasTexture(c)); }
    out.setEvents = function (list) {
      eventSprites.forEach(function (s) { globe.remove(s); }); swirls.forEach(function (s) { globe.remove(s); }); if (trackLines) globe.remove(trackLines);
      events = list; eventSprites = []; swirls = []; var segs = [];
      list.forEach(function (e) {
        e.pid = 'event:' + e.id; e.pos = ll(e.last.lon, e.last.lat, R * 1.035);
        var sp2 = new T.Sprite(new T.SpriteMaterial({ map: icon(e.cat), transparent: true, depthWrite: false, depthTest: true })); sp2.position.copy(e.pos); sp2.userData.ev = e; globe.add(sp2); eventSprites.push(sp2);
        if (e.cat === 'storm') {
          for (var k = 1; k < e.geo.length; k++) { var a = ll(e.geo[k - 1].lon, e.geo[k - 1].lat, R * 1.012), b = ll(e.geo[k].lon, e.geo[k].lat, R * 1.012); segs.push(a.x, a.y, a.z, b.x, b.y, b.z); }
          var kt = e.last.mag || 35, size = 0.22 + Math.min(kt, 150) / 150 * 0.55, sw = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: G.spiralTex(512), color: 0xf4f8ff, transparent: true, depthWrite: false, opacity: 0.92, side: T.DoubleSide }));
          var pp = ll(e.last.lon, e.last.lat, R * 1.016); sw.position.copy(pp); sw.lookAt(pp.clone().multiplyScalar(2)); sw.scale.set(size, size, 1); sw.userData.ev = e; globe.add(sw); swirls.push(sw);
        }
      });
      if (segs.length) { var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(segs, 3)); trackLines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })); globe.add(trackLines); }
      LV.emit('events');
    };
    out.events = function () { return events; };

    /* ---------------- place pin, selection ring, tsunami wavefront ---------------- */
    var pin = new T.Group(), pinRing = new T.Mesh(new T.RingGeometry(0.1, 0.125, 40), new T.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, side: T.DoubleSide, depthWrite: false })), pinBeam = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.9, 6, 1, true).translate(0, 0.45, 0), new T.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.55, depthWrite: false }));
    pin.add(pinRing, pinBeam); pin.visible = false; globe.add(pin);
    out.setPlace = function (p) { if (!p) { pin.visible = false; return; } var pos = ll(p.lon, p.lat, R * 1.006); pin.position.copy(pos); pin.lookAt(pos.clone().multiplyScalar(2)); pinBeam.rotation.x = Math.PI / 2; pin.visible = true; };
    var tsu = null, tsuLine = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.95 })), tsuLine2 = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.5 }));
    globe.add(tsuLine, tsuLine2); tsuLine.visible = tsuLine2.visible = false;
    out.setTsunami = function (t) { tsu = t; tsuLine.visible = tsuLine2.visible = !!t; };
    function ring(lat, lon, km, line) {
      var pts = [], b; for (b = 0; b <= 120; b++) { var d = M.destination(lat, lon, b * 3, Math.min(km, 20015)); pts.push(ll(d.lon, d.lat, R * 1.012)); }
      line.geometry.setFromPoints(pts);
    }
    var epiMark = new T.Mesh(new T.RingGeometry(0.05, 0.075, 28), new T.MeshBasicMaterial({ color: 0xff6a5d, transparent: true, side: T.DoubleSide, depthWrite: false })); epiMark.visible = false; globe.add(epiMark);

    /* ---------------- per-frame ---------------- */
    var selId = null, hovId = null; out.setSel = function (id) { selId = id; }; out.setHover = function (id) { hovId = id; };
    /* Symbolic origins (each provider's home region, not the actual network route) for the data-transmission pulses. */
    var HUBPOS = { meteo: [47.5, 9.1], flood: [47.5, 9.1], archive: [47.5, 9.1], climate: [47.5, 9.1], marine: [47.5, 9.1], elev: [47.5, 9.1], geocode: [47.5, 9.1], ensemble: [47.5, 9.1], gibs: [39.0, -76.85], eonet: [39.0, -76.85], usgs: [39.75, -105.2], tle: [38.83, -104.82], osm: [52.37, 4.9], overpass: [50.11, 8.68], terrain: [39.04, -77.49], s2: [48.21, 16.37] };
    var HUBS = [], seenHub = {}, pulses = []; Object.keys(HUBPOS).forEach(function (k) { var h = HUBPOS[k], key = h.join(','); if (seenHub[key]) return; seenHub[key] = 1; HUBS.push({ p: ll(h[1], h[0], R * 1.006) }); });
    out.pulse = function (src, ok) { var h = HUBPOS[src]; if (!h || pulses.length > 36) return; var to = LV.state.place || { lat: 20, lon: 78 }; pulses.push({ a: ll(h[1], h[0], R), b: ll(to.lon, to.lat, R), t: 0, ok: ok }); };
    out.tsunamiRadiusKm = function () { return tsu ? (tsu.radius || (tsu.replay != null ? Math.max(0, tsu.replay) * M.tsunamiSpeedKmh(4000) : 0)) : 0; };
    out.setTsunamiHours = function (h) { if (tsu) tsu.replay = h; };
    var camP = new T.Vector3(), _v = new T.Vector3();
    out.update = function (F) {
      var date = new Date(F.simMs), sub = M.subsolar(date), s = ll(sub.lon, sub.lat, 1); U.uSun.value.copy(s);
      var gmst = satellite.gstime(date), cam = F.camera.position, t = F.time, i2;
      glow.begin();
      var showS = LV.state.layers.sats, showQ = LV.state.layers.quakes;
      sats.forEach(function (sa) {
        if (!showS && sa !== selSat) { sa.shown = false; return; }
        if (!propagate(sa, date, gmst)) { sa.shown = false; return; }
        sa.shown = true; var hi = (sa === selSat || sa.id === selId || sa.id === hovId), c = sa.col;
        glow.push(sa.pos.x, sa.pos.y, sa.pos.z, c[0], c[1], c[2], hi ? 0.34 : sa.cat === 'other' ? 0.07 : 0.12);
      });
      if (selSat && selSat.ok) {
        if (orbitLine) orbitLine.rotation.y = -(gmst - orbitLine.userData.g0);
        if (footLine) { var h = selSat.alt, ang = Math.acos(R / (R + h * K)) * 6371 / K * K, dist = Math.acos(6371 / (6371 + h)) * 6371, p = out.fromPoint(selSat.pos), fa = footLine.geometry.attributes.position.array; for (var b = 0; b <= 72; b++) { var d = M.destination(p.lat, p.lon, b * 5, dist), v = ll(d.lon, d.lat, R * 1.008); fa[b * 3] = v.x; fa[b * 3 + 1] = v.y; fa[b * 3 + 2] = v.z; } footLine.geometry.attributes.position.needsUpdate = true; }
      }
      if (showQ) quakes.forEach(function (q) {
        var age = (F.simMs - q.t) / 3600000, c = q.depth < 70 ? [1, 0.45, 0.25] : q.depth < 300 ? [1, 0.85, 0.3] : [0.4, 0.7, 1], hi = q.id === selId || q.id === hovId, sz = (0.045 + 0.028 * Math.max(0, q.mag - 4.2)) * (hi ? 1.7 : 1);
        if (age < 24 && age >= 0) sz *= 1 + 0.35 * Math.sin(t * 5 + q.lat);
        glow.push(q.pos.x, q.pos.y, q.pos.z, c[0], c[1], c[2], sz * 2.4); if (q.tsunami) glow.push(q.pos.x, q.pos.y, q.pos.z, 0.2, 0.9, 1, sz * 3.4);
      });
      var sc = M.clamp(F.camDist * 0.034, 0.2, 0.85); eventSprites.forEach(function (sp2) { var e = sp2.userData.ev, on = LV.state.layers.events && LV.state.filters[e.cat] !== false; sp2.visible = on; sp2.scale.setScalar(sc * (e.pid === selId || e.pid === hovId ? 1.35 : 1)); });
      swirls.forEach(function (sw) { sw.visible = LV.state.layers.events && LV.state.filters.storm !== false; sw.rotation.z = -t * 0.35; });
      if (trackLines) trackLines.visible = LV.state.layers.events && LV.state.filters.storm !== false;
      if (pin.visible) { pinRing.scale.setScalar(1 + 0.25 * Math.sin(t * 4)); }
      if (tsu) {
        var hrs = tsu.replay != null ? tsu.replay : (F.simMs - tsu.t0) / 3600000; tsu.radius = Math.max(0, hrs) * M.tsunamiSpeedKmh(4000);
        if (tsu.radius > 5 && tsu.radius < 20015) { ring(tsu.lat, tsu.lon, tsu.radius, tsuLine); ring(tsu.lat, tsu.lon, Math.max(0, tsu.radius - 450), tsuLine2); tsuLine.visible = tsuLine2.visible = true; } else tsuLine.visible = tsuLine2.visible = false;
        var ep = ll(tsu.lon, tsu.lat, R * 1.008); epiMark.position.copy(ep); epiMark.lookAt(ep.clone().multiplyScalar(2)); epiMark.scale.setScalar(1 + 0.5 * Math.sin(t * 6)); epiMark.visible = true;
      } else epiMark.visible = false;
      if (LV.state.live) HUBS.forEach(function (hb) { glow.push(hb.p.x, hb.p.y, hb.p.z, 0.3, 1, 0.75, 0.1 + 0.03 * Math.sin(t * 3 + hb.p.x)); });
      for (var pi = pulses.length - 1; pi >= 0; pi--) {
        var pu = pulses[pi]; pu.t += F.dt / 1.5; if (pu.t >= 1) { pulses.splice(pi, 1); continue; }
        for (var tr = 0; tr < 7; tr++) { var uu = pu.t - tr * 0.035; if (uu < 0) break; _v.copy(pu.a).lerp(pu.b, uu).setLength(R * (1.012 + 0.3 * Math.sin(Math.PI * uu))); glow.push(_v.x, _v.y, _v.z, pu.ok ? 0.3 : 1, pu.ok ? 1 : 0.3, pu.ok ? 0.85 : 0.3, 0.2 - tr * 0.022); }
      }
      glow.end(); glow.setScale(F.glowScale);
      earth.material.uniforms.uNightOn.value = LV.state.layers.night ? (U.uNight.value.image ? 1 : 0) : 0;
      grat.visible = LV.state.layers.borders;
    };

    /* ---------------- picking (screen-space) ---------------- */
    function occluded(cam, p) { var d = p.clone().sub(cam), len = d.length(); d.divideScalar(len); var b = cam.dot(d), c = cam.lengthSq() - R * R * 0.995, disc = b * b - c; if (disc < 0) return false; var tt = -b - Math.sqrt(disc); return tt > 0 && tt < len; }
    out.pick = function (mx, my, camera, W, H) {
      var best = null, bd = 18, cam = camera.position, v = new T.Vector3();
      function test(id, p, surf, kind, ref, extra) {
        if (occluded(cam, p)) return; v.copy(p).project(camera); if (v.z > 1) return; var sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H, d = Math.hypot(sx - mx, sy - my) - (extra || 0); if (d < bd) { bd = d; best = { id: id, kind: kind, ref: ref }; }
      }
      if (LV.state.layers.events) events.forEach(function (e) { if (LV.state.filters[e.cat] !== false) test(e.pid, e.pos, true, 'event', e, 6); });
      if (LV.state.layers.quakes) quakes.forEach(function (q) { test(q.id, q.pos, true, 'quake', q, q.mag > 6 ? 5 : 0); });
      sats.forEach(function (s) { if (s.shown && s.ok && (LV.state.layers.sats || s === selSat)) test(s.id, s.pos, false, 'sat', s, s.cat === 'other' ? -4 : 0); });
      return best;
    };
    out.rayLatLon = function (mx, my, camera, W, H) {
      var ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(mx / W * 2 - 1, -(my / H) * 2 + 1), camera); var hit = new T.Vector3();
      return ray.ray.intersectSphere(new T.Sphere(new T.Vector3(), R), hit) ? out.fromPoint(hit) : null;
    };
    out.screen = function (lat, lon, camera, W, H) { var p = ll(lon, lat, R); if (occluded(camera.position, p)) return null; var v = p.clone().project(camera); return v.z > 1 ? null : { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
    return out;
  };
}
