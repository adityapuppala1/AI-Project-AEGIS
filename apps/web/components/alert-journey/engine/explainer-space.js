/* AEGIS Alert Journey explainer — orbital scene: globe, India, cyclone seen from space, satellites and ground links. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};

  AX.buildSpace = function (ctx) {
    var T = ctx.T, C = ctx.C, G = ctx.G, S = ctx.S, scene = new T.Scene(), R = 5, SP = { scene: scene };
    function ll(lon, lat, r) { var p = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180; return new T.Vector3(-r * Math.sin(p) * Math.cos(th), r * Math.cos(p), r * Math.sin(p) * Math.sin(th)); }
    SP.ll = ll;
    function w2ll(x, z) { return [82 + (x - 14) * 0.045, 16.7 - (z - 12) * 0.045]; }
    scene.add(new T.AmbientLight(0x4a5f90, 0.7));
    var sun = new T.DirectionalLight(0xfff1d6, 1.25); scene.add(sun);

    // stars
    var sp = [], i;
    for (i = 0; i < 1800; i++) { var v = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(300 + Math.random() * 300); sp.push(v.x, v.y, v.z); }
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false })));

    // earth
    var globe = new T.Group(); scene.add(globe);
    var base = new T.Mesh(new T.SphereGeometry(R, 72, 54), new T.MeshPhongMaterial({ color: 0x0f2a5c, emissive: 0x050b1c, shininess: 12 })); globe.add(base);
    try {
      var tl = new T.TextureLoader(); tl.setCrossOrigin('anonymous');
      fetch('/api/earth-watch/status', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!j || j.enabled !== true || !AX.alive) return; tl.load('/api/alert-journey/relay?u=' + encodeURIComponent('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024'), function (tx) { base.material.map = tx; base.material.color.setRGB(1.7, 1.7, 1.7); base.material.needsUpdate = true; }, undefined, function () { }); }).catch(function () { /* stay on the built-in globe */ });
    } catch (e) { }
    var INDIA = [[74.5, 37], [77, 35.5], [79, 34], [78.9, 32.5], [80.2, 30.5], [81, 30], [80, 28.8], [84, 27.4], [88, 27.2], [89, 26.8], [92, 26.9], [95, 28.3], [97, 28.2], [96, 27], [95, 26], [94.5, 24], [93.4, 22.9], [92, 24.5], [91.5, 25.2], [90, 25.2], [89, 26], [88.5, 24.5], [89, 22], [88.8, 21.6], [87, 21.5], [86.9, 20.5], [85, 19.5], [83, 17.5], [82, 16.5], [80.3, 15.5], [80.1, 13.5], [80.3, 12], [79.8, 10.3], [78.8, 9.3], [77.5, 8.1], [76.5, 9], [75.5, 11.5], [74.8, 13], [74, 15], [73, 17.5], [72.8, 19.5], [72.7, 21], [70.5, 20.8], [69, 22.3], [70.5, 23], [68.2, 23.7], [68.5, 24.3], [70.5, 25.7], [71.5, 27.8], [70, 28], [69.5, 29.5], [71.5, 30], [73.5, 32], [74.5, 34.5]];
    var ov = G.canvas(2048, 1024, function (x) {
      x.strokeStyle = 'rgba(120,170,255,.14)'; x.lineWidth = 1;
      for (var lo = -180; lo <= 180; lo += 15) { x.beginPath(); x.moveTo((lo + 180) / 360 * 2048, 0); x.lineTo((lo + 180) / 360 * 2048, 1024); x.stroke(); }
      for (var la = -90; la <= 90; la += 15) { x.beginPath(); x.moveTo(0, (90 - la) / 180 * 1024); x.lineTo(2048, (90 - la) / 180 * 1024); x.stroke(); }
      x.beginPath(); INDIA.forEach(function (p, k) { var px = (p[0] + 180) / 360 * 2048, py = (90 - p[1]) / 180 * 1024; k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath();
      x.fillStyle = 'rgba(255,181,71,.2)'; x.fill(); x.strokeStyle = 'rgba(255,200,110,.95)'; x.lineWidth = 3; x.shadowColor = '#ffb547'; x.shadowBlur = 14; x.stroke();
    });
    globe.add(new T.Mesh(new T.SphereGeometry(R * 1.003, 72, 54), new T.MeshBasicMaterial({ map: new T.CanvasTexture(ov), transparent: true, depthWrite: false })));
    var cloudTex = new T.CanvasTexture(G.canvas(1024, 512, function (x, w, h) {
      var im = x.createImageData(w, h), d = im.data, a, b;
      for (b = 0; b < h; b++) for (a = 0; a < w; a++) { var n = C.fbm(a / 70, b / 70, 5), al = C.clamp((n - 0.5) * 3.2, 0, 1) * 0.65, o = (b * w + a) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = al * 255; }
      x.putImageData(im, 0, 0);
    }));
    var clouds = new T.Mesh(new T.SphereGeometry(R * 1.012, 56, 40), new T.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.8 })); globe.add(clouds);
    globe.add(new T.Mesh(new T.SphereGeometry(R * 1.13, 48, 32), new T.ShaderMaterial({ transparent: true, side: T.BackSide, blending: T.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 n; void main(){ n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 n; void main(){ float i=pow(max(0.72-dot(n,vec3(0.,0.,1.)),0.),3.); gl_FragColor=vec4(0.25,0.7,1.,1.)*i; }' })));

    // cyclone on the globe
    var cyc = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: G.spiralTex(512), color: 0xf4f8ff, transparent: true, depthWrite: false, opacity: 0.95, side: T.DoubleSide }));
    globe.add(cyc);
    // markers
    function marker(lon, lat, col, size) {
      var m = new T.Mesh(new T.SphereGeometry(size, 12, 12), new T.MeshBasicMaterial({ color: col })); m.position.copy(ll(lon, lat, R * 1.01)); globe.add(m);
      var ring = new T.Mesh(new T.RingGeometry(0.1, 0.12, 32), new T.MeshBasicMaterial({ color: col, transparent: true, side: T.DoubleSide, depthWrite: false })); ring.position.copy(m.position); ring.lookAt(0, 0, 0); ring.rotateY(Math.PI); globe.add(ring); m.userData.ring = ring; return m;
    }
    var REG = marker(82, 16.7, 0x38e1ff, 0.07), DEL = marker(77.2, 28.6, 0xffb547, 0.07);
    var cities = [[72.8, 19.1], [88.4, 22.6], [80.3, 13.1], [73.9, 18.5], [85.1, 25.6], [91.7, 26.2], [75.8, 26.9]].map(function (c) { return marker(c[0], c[1], 0xff5d6c, 0.045); });

    // satellites
    var sats = [];
    function satObj(col) {
      var g2 = new T.Group(); g2.add(new T.Mesh(new T.BoxGeometry(0.16, 0.11, 0.11), new T.MeshPhongMaterial({ color: 0xe5e9f0, emissive: col, emissiveIntensity: 0.4 })));
      [-1, 1].forEach(function (s) { var p = new T.Mesh(new T.BoxGeometry(0.34, 0.012, 0.15), new T.MeshPhongMaterial({ color: 0x2a4fd6, emissive: 0x0a2a8a })); p.position.x = s * 0.25; g2.add(p); }); return g2;
    }
    var defs = [{ id: 'sat_sar', r: 6.2, inc: 0.55, sp: 0.5, ph: 0.4 }, { id: 'sat_gpm', r: 6.8, inc: -0.6, sp: 0.38, ph: 2.2 }, { id: 'sat_d2c', r: 6.0, inc: 0.2, sp: 0.62, ph: 4.0 }, { id: 'sat_wx', geo: [58, 0], r: 8.6 }, { id: 'sat_navic', geo: [83, 10], r: 8.6 }];
    defs.forEach(function (d) {
      var sd = S.SATS.filter(function (x) { return x.id === d.id; })[0], ob = satObj(parseInt(sd.color.slice(1), 16)); ob.scale.setScalar(1.5); globe.add(ob);
      var ring = null;
      if (!d.geo) { var pts = []; for (var a = 0; a <= 64; a++) { var an = a / 64 * Math.PI * 2; pts.push(new T.Vector3(Math.cos(an) * d.r, 0, Math.sin(an) * d.r)); } ring = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: parseInt(sd.color.slice(1), 16), transparent: true, opacity: 0.22 })); ring.rotation.set(d.inc, 0.3, d.inc * 0.5); globe.add(ring); }
      var ln = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: parseInt(sd.color.slice(1), 16), transparent: true, opacity: 0.5 })); globe.add(ln);
      sats.push({ d: d, ob: ob, ring: ring, ln: ln, sd: sd });
      ctx.reg({ id: 'sp_' + d.id, kind: 'satellite', space: true, name: sd.name, icon: 'satellite', color: sd.color, anchor: ob, lblY: 0.45, layer: 'satellites', prio: 8, pick: [ob], describe: function () { return { status: { tone: 'info', text: d.geo ? 'Geostationary-type' : 'Low orbit' }, rows: [['What it does', sd.role], ['Product', sd.product]], note: 'Illustrative class of satellite; no live feed is used.' }; } });
    });
    ctx.reg({ id: 'sp_region', kind: 'place', space: true, name: 'Nadipur basin (synthetic)', sub: 'AEGIS exercise region', icon: 'pin', color: '#38e1ff', anchor: REG, lblY: 0.4, layer: 'labels', prio: 9, pick: [REG], style: 'place', describe: function () { return { status: { tone: 'info', text: 'Exercise region' }, rows: [['Dive in', 'Use “Dive to region” to descend to ground level']], note: 'Fictional basin on a coastal east-India style coastline.' }; } });
    ctx.reg({ id: 'sp_delhi', kind: 'place', space: true, name: 'New Delhi · NDMA / SACHET', sub: 'authority', icon: 'building', color: '#ffb547', anchor: DEL, lblY: 0.4, layer: 'labels', prio: 9, pick: [DEL], style: 'place', describe: function () { return { status: { tone: 'info', text: 'Authority' }, rows: [['Role', 'Receives an approved CAP draft from a human; sets area and severity; transmits via operators']], note: 'AEGIS never sends. This is the official channel.' }; } });

    // hand-over arcs from Delhi
    var arcs = cities.concat([REG]).map(function (c) {
      var from = DEL.position, to = c.position, mid = from.clone().add(to).multiplyScalar(0.5).setLength(R * 1.35), cv = new T.QuadraticBezierCurve3(from, mid, to);
      var ln = new T.Line(new T.BufferGeometry().setFromPoints(cv.getPoints(40)), new T.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.0 })); globe.add(ln);
      var dots = G.glowBatch(40, true); globe.add(dots.obj); return { ln: ln, cv: cv, dots: dots };
    });
    SP.glow = G.glowBatch(300, true); globe.add(SP.glow.obj);

    SP.update = function (F) {
      var st = F.st, t = F.t, time = F.time, gl = SP.glow;
      var hr = st.sun.hour, sl = 82 + (12 - hr) * 15; sun.position.copy(ll(sl, 8, 40));
      clouds.rotation.y = time * 0.006;
      var e = w2ll(st.eye.x, st.eye.z), pos = ll(e[0], e[1], R * 1.02), sc = Math.max(0.3, st.radius * 0.045 * 0.0872 * 3.2);
      cyc.position.copy(pos); cyc.lookAt(pos.clone().multiplyScalar(2)); cyc.scale.set(sc, sc, 1); cyc.rotation.z = -time * (0.12 + 0.18 * st.I); cyc.material.opacity = 0.85;
      cyc.visible = ctx.layerOn.cyclone;
      [REG, DEL].concat(cities).forEach(function (m, k) { var s = 1 + 0.5 * Math.sin(time * 3 + k); m.userData.ring.scale.setScalar(s * 1.4); m.userData.ring.material.opacity = 0.9 - 0.35 * s; });
      gl.begin();
      sats.forEach(function (s) {
        var p;
        if (s.d.geo) p = ll(s.d.geo[0], s.d.geo[1], s.d.r); else { var a = time * s.d.sp * 0.25 + s.d.ph; p = new T.Vector3(Math.cos(a) * s.d.r, 0, Math.sin(a) * s.d.r); p.applyEuler(s.ring.rotation); }
        s.ob.position.copy(p); s.ob.lookAt(0, 0, 0); s.ob.rotateX(Math.PI / 2);
        var dir = p.clone().normalize(), reg = REG.position.clone(), vis = dir.dot(reg.clone().normalize()) > 0.3;
        var geo = s.ln.geometry.attributes.position; geo.setXYZ(0, p.x, p.y, p.z); geo.setXYZ(1, reg.x, reg.y, reg.z); geo.needsUpdate = true;
        var on = vis && (s.d.id !== 'sat_navic' && s.d.id !== 'sat_d2c' || ctx.alert2Active(F)); s.ln.material.opacity = on ? 0.55 : 0.0;
        if (on) for (var k = 0; k < 5; k++) { var u = (time * 0.4 + k / 5) % 1; gl.push(lerp3(p.x, reg.x, u), lerp3(p.y, reg.y, u), lerp3(p.z, reg.z, u), 0.7, 0.9, 1, 0.14); }
        gl.push(p.x, p.y, p.z, 1, 1, 1, 0.3);
      });
      var ho = t > -17.6;
      arcs.forEach(function (a, k) {
        var act = ho && (F.bc || t < -16.4 && t > -17.6 ? 1 : 0.12); a.ln.material.opacity = ho ? (F.bc ? 0.8 : 0.15) : 0;
        a.dots.begin(); if (ho && F.bc) for (var n = 0; n < 8; n++) { var p3 = a.cv.getPoint((time * 0.5 + n / 8 + k * 0.1) % 1); a.dots.push(p3.x, p3.y, p3.z, 1, 0.82, 0.4, 0.12); } a.dots.end();
      });
      gl.end();
    };
    function lerp3(a, b, u) { return a + (b - a) * u; }
    SP.regPos = REG.position;
    SP.glows = [SP.glow].concat(arcs.map(function (a) { return a.dots; }));
    return SP;
  };
}
