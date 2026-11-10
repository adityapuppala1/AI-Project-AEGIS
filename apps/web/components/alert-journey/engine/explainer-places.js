/* AEGIS Alert Journey explainer — places: roads, city, rural, hills, coast, facilities, shelters, gauges, towers, satellites, hubs. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};
  var BCAST = [[-17.5, -16.4], [-2.4, -1.5]];

  AX.buildPlaces = function (ctx) {
    var T = ctx.T, C = ctx.C, G = ctx.G, S = ctx.S, q = ctx.q, P = { towers: {}, sats: {}, hubs: {} };
    var rnd = C.rng(11), hAt = ctx.hAt, clamp = C.clamp, lerp = C.lerp;
    ctx.BCAST = BCAST;
    function lam(color, em) { return new T.MeshLambertMaterial({ color: color, emissive: em || 0 }); }
    function box(w, h, d, color, em) { var m = new T.Mesh(new T.BoxGeometry(w, h, d), lam(color, em)); return m; }
    function at(obj, x, z, dy) { obj.position.set(x, hAt(x, z) + (dy || 0), z); return obj; }
    function hex(c) { return new T.Color(c); }

    /* ---------------- roads ---------------- */
    var GX = [-4, 2, 8, 14, 20, 26, 32], GZ = [-6, 0, 6, 12, 18, 24, 30], roads = [], tex = G.asphaltTex(), dirt = G.dirtTex();
    var roadMat = new T.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var dirtMat = new T.MeshLambertMaterial({ map: dirt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    function roadY(x, z) { return C.baseH(x, z) + 0.06; }
    function addRoad(pts, w, material, kind) {
      var P2 = pts.map(function (p) { return { x: p[0], z: p[1] }; }), geo = G.ribbon(P2, w, roadY, 1.3, 6), m = new T.Mesh(geo, material || roadMat);
      m.renderOrder = 2; ctx.add('roads', m);
      roads.push({ pts: P2, len: geo.userData.length, kind: kind || 'city', samples: geo.userData.samples });
    }
    GX.forEach(function (x) { addRoad([[x, -9], [x, 33]], 1.5, roadMat, 'city'); });
    GZ.forEach(function (z) { addRoad([[-7, z], [35, z]], 1.5, roadMat, 'city'); });
    S.ARTERIALS.forEach(function (r, i) { addRoad(r, i === 2 ? 1.0 : 1.4, i === 2 ? dirtMat : roadMat, 'arterial'); });
    ['NE', 'SW', 'NW'].forEach(function (k) { addRoad(S.ROUTES[k], 1.3, roadMat, 'evac'); });
    ctx.roads = roads;
    ctx.roadPoint = function (road, s) {      // point at distance s along a road's samples
      var sm = road.samples, acc = 0, i;
      for (i = 0; i < sm.length - 1; i++) {
        var d = Math.hypot(sm[i + 1].x - sm[i].x, sm[i + 1].z - sm[i].z);
        if (acc + d >= s) { var u = (s - acc) / (d || 1); return [lerp(sm[i].x, sm[i + 1].x, u), lerp(sm[i].z, sm[i + 1].z, u), (sm[i + 1].x - sm[i].x) / (d || 1), (sm[i + 1].z - sm[i].z) / (d || 1)]; }
        acc += d;
      }
      var l = sm[sm.length - 1]; return [l.x, l.z, 1, 0];
    };

    /* ---------------- city buildings (instanced, windows lit at night) ---------------- */
    var keep = S.FACILITIES.concat(S.TOWERS, S.SHELTERS, S.GAUGES).map(function (o) { return [o.x, o.z]; });
    var bl = [], i, j, a, b;
    for (i = 0; i < GX.length - 1; i++) for (j = 0; j < GZ.length - 1; j++) for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) {
      var cx = GX[i] + 0.95 + (a + 0.5) * 1.4, cz = GZ[j] + 0.95 + (b + 0.5) * 1.4, h0 = hAt(cx, cz);
      if (h0 < 0.95 || C.riverDist(cx, cz) < 1.9) continue;
      if (keep.some(function (k) { return Math.hypot(k[0] - cx, k[1] - cz) < 2.3; })) continue;
      var dt = Math.hypot(cx - 9, cz - 15), r = rnd(), hh = 0.35 + Math.pow(r, 2.2) * 3.0 * C.gauss(dt / 11) + rnd() * 0.8;
      bl.push({ x: cx, z: cz, h: hh, w: 0.95 + rnd() * 0.35, d: 0.95 + rnd() * 0.35, base: h0 });
    }
    ctx.buildings = bl;
    var bu = { uNight: { value: 0 }, uPower: { value: 1 } };
    var bgeo = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), bmat = new T.MeshLambertMaterial({ color: 0xffffff });
    var onA = new Float32Array(bl.length).fill(1), seedA = new Float32Array(bl.length);
    bgeo.setAttribute('aOn', new T.InstancedBufferAttribute(onA, 1)); bgeo.setAttribute('aSeed', new T.InstancedBufferAttribute(seedA, 1));
    bmat.onBeforeCompile = function (sh) {
      sh.uniforms.uNight = bu.uNight; sh.uniforms.uPower = bu.uPower;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aOn; attribute float aSeed; varying float vOn; varying float vSeed; varying vec3 vWP; varying vec3 vN0;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOn=aOn; vSeed=aSeed; vN0=normal; vWP=(instanceMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight,uPower; varying float vOn; varying float vSeed; varying vec3 vWP; varying vec3 vN0;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' +
          'float along=abs(vN0.x)>0.5?vWP.z:vWP.x; vec2 wc=vec2(along*1.25,vWP.y*1.4); vec2 cell=floor(wc); vec2 fr=fract(wc);\n' +
          'float win=step(0.18,fr.x)*step(fr.x,0.82)*step(0.2,fr.y)*step(fr.y,0.75)*(1.0-step(0.5,abs(vN0.y)));\n' +
          'float rn=fract(sin(dot(cell+vSeed*17.0,vec2(12.9898,78.233)))*43758.5453); float lit=step(0.42,rn)*vOn*uPower;\n' +
          'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.16,0.24,0.34),win*0.5*(1.0-uNight*lit));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=win*lit*uNight*vec3(1.0,0.78,0.42)*0.95;');
    };
    var bmesh = G.inst(bgeo, bmat, bl.length), pal = [0xcfd4de, 0xe3d9c6, 0xb9c4d6, 0xd8cdbb, 0xa9b3c4, 0xe9e4da];
    bl.forEach(function (o, k) { bmesh.userData.set(k, o.x, o.base - 0.05, o.z, o.w, o.h, o.d, 0); seedA[k] = rnd(); bmesh.setColorAt(k, hex(pal[(rnd() * pal.length) | 0])); });
    bmesh.instanceMatrix.needsUpdate = true; bmesh.instanceColor.needsUpdate = true; bgeo.attributes.aSeed.needsUpdate = true;
    ctx.add('buildings', bmesh); P.bu = bu;

    /* ---------------- houses (rural, hill, harbour) ---------------- */
    var houses = [];
    function cluster(cx, cz, n, rad) {
      for (var k = 0; k < n * 4 && n > 0; k++) {
        var x = cx + (rnd() - 0.5) * rad * 2, z = cz + (rnd() - 0.5) * rad * 2, h = hAt(x, z);
        if (h < 0.7 || C.riverDist(x, z) < 2 || C.H(x, z) !== h && false) continue;
        if (houses.some(function (o) { return Math.hypot(o.x - x, o.z - z) < 1.6; })) continue;
        houses.push({ x: x, z: z, y: h, r: rnd() * 3.14, s: 0.8 + rnd() * 0.5 }); n--;
      }
    }
    cluster(-22, 8, 16, 7); cluster(-26, 18, 7, 6); cluster(-14, 22, 6, 6); cluster(-34, 0, 5, 5); cluster(-40, -26, 10, 6); cluster(44, 30, 8, 5); cluster(40, 22, 7, 6); cluster(6, 34, 6, 6); cluster(-6, -12, 4, 5); cluster(30, -8, 5, 4);
    var hw = G.inst(new T.BoxGeometry(0.8, 0.5, 0.65).translate(0, 0.25, 0), lam(0xf0e6d0), houses.length);
    var hr = G.inst(new T.ConeGeometry(0.62, 0.38, 4).rotateY(Math.PI / 4).translate(0, 0.69, 0), lam(0xb5523b), houses.length);
    houses.forEach(function (o, k) { hw.userData.set(k, o.x, o.y - 0.03, o.z, o.s, o.s, o.s, o.r); hr.userData.set(k, o.x, o.y - 0.03, o.z, o.s, o.s, o.s, o.r); hw.setColorAt(k, hex([0xf0e6d0, 0xe9d7b0, 0xdfe8ef, 0xf3d0c0][k % 4])); });
    hw.instanceMatrix.needsUpdate = hr.instanceMatrix.needsUpdate = true; hw.instanceColor.needsUpdate = true;
    ctx.add('buildings', hw); ctx.add('buildings', hr); ctx.houses = houses;

    /* ---------------- trees with wind sway ---------------- */
    var tu = { uTime: { value: 0 }, uWind: { value: 0 } };
    function sway(m) {
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uTime = tu.uTime; sh.uniforms.uWind = tu.uWind;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime,uWind;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph=instanceMatrix[3].x*0.7+instanceMatrix[3].z*0.5; transformed.x+=sin(uTime*2.2+ph)*uWind*position.y*0.22; transformed.z+=cos(uTime*1.9+ph)*uWind*position.y*0.16;');
      };
      return m;
    }
    var NT = q.trees, tp = [], tries = 0;
    while (tp.length < NT && tries++ < NT * 14) {
      var x = (rnd() - 0.5) * 138, z = (rnd() - 0.5) * 138, h = hAt(x, z), dc = Math.hypot(x - C.CITY.x, z - C.CITY.z), nz = C.fbm(x * 0.07, z * 0.07, 3);
      if (h < 0.7 || C.riverDist(x, z) < 1.6 || dc < 19) continue;
      var con = h > 3.4, p = con ? (h < 12.5 ? 0.9 * (nz > 0.42 ? 1 : 0.15) : 0.05) : (nz > 0.5 ? 0.28 : 0.06);
      if (rnd() > p) continue;
      if (roads.some(function (rd) { return rd.kind !== 'city' && rd.samples.some(function (s, k) { return k % 3 === 0 && Math.hypot(s.x - x, s.z - z) < 1.3; }); })) continue;
      tp.push({ x: x, z: z, y: h, con: con, s: 0.7 + rnd() * 0.9 });
    }
    var cons = tp.filter(function (o) { return o.con; }), brd = tp.filter(function (o) { return !o.con; });
    var tcon = G.inst(new T.ConeGeometry(0.42, 1.4, 6).translate(0, 1.0, 0), sway(lam(0xffffff)), cons.length);
    var tbrd = G.inst(new T.IcosahedronGeometry(0.5, 0).translate(0, 0.95, 0), sway(lam(0xffffff)), brd.length);
    var ttrk = G.inst(new T.CylinderGeometry(0.05, 0.07, 0.6, 5).translate(0, 0.3, 0), lam(0x5a4632), tp.length);
    cons.forEach(function (o, k) { tcon.userData.set(k, o.x, o.y, o.z, o.s, o.s, o.s, rnd() * 6); tcon.setColorAt(k, hex([0x2d6a3a, 0x24592f, 0x356e3d][k % 3])); });
    brd.forEach(function (o, k) { tbrd.userData.set(k, o.x, o.y, o.z, o.s, o.s * 0.9, o.s, rnd() * 6); tbrd.setColorAt(k, hex([0x5f9a3e, 0x7aa83d, 0x4d8a37][k % 3])); });
    tp.forEach(function (o, k) { ttrk.userData.set(k, o.x, o.y, o.z, o.s, o.s, o.s, 0); });
    [tcon, tbrd, ttrk].forEach(function (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; ctx.add('buildings', m); });
    P.tu = tu;

    /* ---------------- wind turbines ---------------- */
    var turbines = [[44, -22], [38, -31], [51, -14], [46, -38]].map(function (p, k) {
      var gr = new T.Group(), mast = new T.Mesh(new T.CylinderGeometry(0.08, 0.14, 3.4, 8).translate(0, 1.7, 0), lam(0xeef2f6)), hub = new T.Group();
      hub.position.set(0, 3.4, 0.12); for (var bI = 0; bI < 3; bI++) { var bl2 = new T.Mesh(new T.BoxGeometry(0.07, 1.5, 0.03).translate(0, 0.75, 0), lam(0xffffff)); bl2.rotation.z = bI * 2.094; hub.add(bl2); }
      gr.add(mast, hub); at(gr, p[0], p[1]); ctx.add('buildings', gr); return { g: gr, hub: hub, ph: k };
    });
    P.turbines = turbines;

    /* ---------------- harbour + lighthouse ---------------- */
    var jetty = box(0.8, 0.25, 9, 0x8a7a62); jetty.position.set(49.5, 0.35, 34.5); jetty.rotation.y = -0.62; ctx.add('buildings', jetty);
    var boats = [[51, 36.5], [53.5, 31.5], [49, 39], [47.5, 28]].map(function (p, k) {
      var gb = new T.Group(); gb.add(box(0.7, 0.18, 0.28, [0xd7633b, 0x3b7bd7, 0xe7e1d0, 0x3bb07d][k], 0x080808), at2(box(0.22, 0.22, 0.22, 0xf5f5f0), 0, 0.2, -0.04)); gb.position.set(p[0], 0.1, p[1]); gb.rotation.y = k * 1.3; ctx.add('buildings', gb); return { g: gb, ph: k };
    });
    function at2(o, x, y, z) { o.position.set(x, y, z); return o; }
    P.boats = boats;
    var crane = box(0.25, 3, 0.25, 0xe8b53a); crane.position.set(44.5, 1.6, 32); var arm = box(2.4, 0.18, 0.18, 0xe8b53a); arm.position.set(1, 1.5, 0); crane.add(arm); ctx.add('buildings', crane);

    /* ---------------- facilities ---------------- */
    var fac = {};
    function reg(def, group, pick, extra) {
      ctx.add(extra && extra.layer || 'buildings', group);
      ctx.reg(Object.assign({ id: def.id, kind: def.kind || 'facility', name: def.name, color: '#e8eeff', anchor: group, lblY: 3, layer: 'buildings', pick: pick || [group], prio: 6 }, extra || {}));
    }
    S.FACILITIES.forEach(function (d) {
      var gr = new T.Group(), top = 2.4, f = { def: d, g: gr };
      if (d.kind === 'hospital') {
        gr.add(at2(box(2.8, 1.5, 1.9, 0xf3f5f8), 0, 0.75, 0), at2(box(1.3, 1.0, 1.3, 0xe6ebf2), 1.8, 0.5, 0.2));
        var cr1 = box(0.9, 0.06, 0.26, 0xe53b4b, 0x7a1018), cr2 = box(0.26, 0.06, 0.9, 0xe53b4b, 0x7a1018); cr1.position.set(0, 1.53, 0); cr2.position.set(0, 1.53, 0); gr.add(cr1, cr2); top = 2.3;
        f.lamp = [0, 1.7, 0];
      } else if (d.kind === 'eoc') {
        gr.add(at2(box(1.7, 2.1, 1.7, 0x1c5873, 0x0b3550), 0, 1.05, 0), at2(box(1.72, 0.18, 1.72, 0x7fe4ff, 0x2a6a80), 0, 1.4, 0));
        var mast = new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 1.6, 6).translate(0, 0.8, 0), lam(0xcfd8e6)); mast.position.y = 2.1; gr.add(mast);
        var dish = new T.Mesh(new T.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, 1.0), lam(0xffffff)); dish.position.set(0.25, 3.5, 0); dish.rotation.z = -0.9; gr.add(dish);
        f.lamp = [0, 3.9, 0]; top = 4.2; f.beacon = true;
      } else if (d.kind === 'substation') {
        gr.add(at2(box(3.2, 0.1, 3.2, 0x555b66), 0, 0.05, 0));
        for (var tI = 0; tI < 3; tI++) gr.add(at2(box(0.55, 0.8, 0.55, 0x8d97a8), -1 + tI, 0.5, -0.4), at2(box(0.12, 0.9, 0.12, 0x2a2f38), -1 + tI, 1.1, -0.4));
        gr.add(at2(box(3.3, 0.35, 0.04, 0x7b8190), 0, 0.2, 1.65), at2(box(3.3, 0.35, 0.04, 0x7b8190), 0, 0.2, -1.65)); f.lamp = [1.3, 1.1, 1.3]; top = 2.2;
      } else if (d.kind === 'radar') {
        gr.add(at2(new T.Mesh(new T.CylinderGeometry(0.2, 0.3, 2.2, 10).translate(0, 1.1, 0), lam(0xdfe5ee)), 0, 0, 0));
        var dome = new T.Mesh(new T.SphereGeometry(0.7, 16, 10), lam(0xffffff, 0x222a33)); dome.position.y = 2.6; gr.add(dome);
        var sw = new T.Mesh(new T.CircleGeometry(9, 20, 0, 0.55), new T.MeshBasicMaterial({ color: 0x4be3a0, transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false })); sw.rotation.x = -Math.PI / 2; sw.position.y = 2.9; gr.add(sw); f.sweep = sw; top = 3.6;
      } else if (d.kind === 'dish') {
        gr.add(at2(box(1.2, 0.7, 1.0, 0xcfd6e2), 0.9, 0.35, 0.6));
        var d2 = new T.Mesh(new T.SphereGeometry(1.4, 20, 8, 0, Math.PI * 2, 0, 1.05), lam(0xffffff, 0x1a2230)); d2.position.set(0, 1.5, 0); d2.rotation.set(-0.7, 0.6, 0); gr.add(d2, at2(new T.Mesh(new T.CylinderGeometry(0.1, 0.16, 1.5, 6).translate(0, 0.75, 0), lam(0x9aa5b8)), 0, 0, 0)); f.dish = d2; top = 3.2;
      } else if (d.kind === 'lighthouse') {
        var lh = new T.Mesh(new T.CylinderGeometry(0.28, 0.5, 4.2, 12).translate(0, 2.1, 0), lam(0xf4f1ea)); gr.add(lh);
        [0.9, 2.1, 3.3].forEach(function (yy) { var st = new T.Mesh(new T.CylinderGeometry(0.4, 0.47, 0.5, 12), lam(0xd9383a)); st.position.y = yy; gr.add(st); });
        gr.add(at2(box(0.5, 0.45, 0.5, 0xfff2b0, 0xffe27a), 0, 4.4, 0));
        var beam = new T.Mesh(new T.ConeGeometry(2.2, 14, 14, 1, true).rotateZ(-Math.PI / 2).translate(7.4, 0, 0), new T.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false }));
        beam.position.y = 4.4; gr.add(beam); f.beam = beam; f.lamp = [0, 4.4, 0]; top = 5.4;
      }
      at(gr, d.x, d.z, -0.02); fac[d.id] = f; f.top = top;
      reg(d, gr, [gr], {
        lblY: top, prio: d.kind === 'eoc' ? 9 : 6, icon: { hospital: 'hospital', eoc: 'shield', substation: 'zap', radar: 'radar', dish: 'satellite', lighthouse: 'compass' }[d.kind],
        describe: function (F) {
          var out = S.powerOutage(F.t), dep = Math.max(0, F.st.flood - C.H(d.x, d.z));
          var rows = [['Ground level', C.H(d.x, d.z).toFixed(2) + ' m'], ['Flood depth now', dep.toFixed(2) + ' m']];
          if (d.kind === 'substation') return { status: { tone: out ? 'bad' : dep > 0.1 ? 'warn' : 'ok', text: out ? 'Tripped by flooding' : 'Energised' }, rows: rows.concat([['Restores (model)', 'T' + (S.SUB_SCHED.restore >= 0 ? '+' : '−') + Math.abs(S.SUB_SCHED.restore).toFixed(1) + 'h']]), note: 'City windows go dark when this substation trips. Crews re-energise it after the water falls.' };
          if (d.kind === 'hospital') return { status: { tone: out ? 'warn' : 'ok', text: out ? 'On generator' : 'Normal power' }, rows: rows.concat([['Beds (synthetic)', '320'], ['Access road', dep > 0.3 ? 'Flooded: boats/ambulances only' : 'Open']]), note: 'AEGIS shows access risk. Patient transfer decisions belong to the hospital.' };
          if (d.kind === 'eoc') return { status: { tone: 'info', text: 'AEGIS Ops Desk' }, rows: rows.concat([['Role', 'Human commander + maker/checker'], ['AEGIS can', 'recommend, draft, record'], ['AEGIS cannot', 'send, dispatch, notify']]), note: 'Exercise-only. No live warning or dispatch path exists.' };
          if (d.kind === 'radar') return { status: { tone: 'ok', text: 'Sweeping' }, rows: rows.concat([['Rain here', F.st.rainMmh + ' mm/h (model)']]), note: 'Synthetic weather radar feeding the rain layer.' };
          if (d.kind === 'dish') return { status: { tone: 'ok', text: 'Tracking' }, rows: rows.concat([['Downlinks', 'SAR · rain-radar · weather']]), note: 'Satellite ground station feeding open data to the Ops Desk.' };
          return { status: { tone: 'info', text: 'Navigation light' }, rows: rows };
        }
      });
    });
    P.fac = fac;

    /* shelters */
    S.SHELTERS.forEach(function (d) {
      var gr = new T.Group();
      gr.add(at2(box(3.4, 0.95, 1.2, 0xf1e8d4), 0, 0.48, 0), at2(box(3.6, 0.12, 1.4, [0x2e9e6b, 0x3b7bd7, 0xd79a3b][S.SHELTERS.indexOf(d)]), 0, 1.0, 0), at2(new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 2.2, 5).translate(0, 1.1, 0), lam(0xdddddd)), 1.9, 0, 0.9));
      var flag = box(0.55, 0.32, 0.02, 0x2e9e6b, 0x0a3a24); flag.position.set(2.2, 2.0, 0.9); gr.add(flag); at(gr, d.x, d.z, -0.03); gr.rotation.y = 0.3;
      d.group = gr;
      reg(d, gr, [gr], { kind: 'shelter', lblY: 3, icon: 'home', prio: 8, describe: function (F) {
        var occ = ctx.shelterOcc ? ctx.shelterOcc[d.id] || 0 : 0;
        return { status: { tone: occ > d.cap * 0.9 ? 'warn' : 'ok', text: occ > 0 ? 'Receiving residents' : 'Open · standby' }, rows: [['Capacity', d.cap + ' people (synthetic)'], ['Sheltered now', occ.toLocaleString()], ['Ground level', C.H(d.x, d.z).toFixed(2) + ' m'], ['Margin above predicted peak', (C.H(d.x, d.z) - (F.st.pred.has ? F.st.pred.level : C.FLOOD_PEAK.level)).toFixed(2) + ' m'], ['Evacuation road', d.route]], note: 'Chosen on high ground. Occupancy is a model count.' };
      } });
    });

    /* river gauges */
    S.GAUGES.forEach(function (d) {
      var gr = new T.Group(); gr.add(new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.8, 6).translate(0, 0.9, 0), lam(0xcfd8e6)), at2(box(0.5, 0.36, 0.1, 0x14202e, 0x103040), 0, 1.7, 0));
      var led = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), new T.MeshBasicMaterial({ color: 0x4be3a0 })); led.position.set(0, 1.95, 0); gr.add(led); at(gr, d.x, d.z, -0.02); d.led = led; d.group = gr;
      reg(d, gr, [gr], { kind: 'gauge', lblY: 2.3, icon: 'gauge', prio: 5, describe: function (F) {
        var lvl = C.bedAt(C.toA(d.x, d.z)) + 0.35 + 0.95 * F.st.qn + d.bias, warn = F.st.qn > 0.45, danger = F.st.qn > 0.75;
        return { status: { tone: danger ? 'bad' : warn ? 'warn' : 'ok', text: danger ? 'Above danger mark' : warn ? 'Above warning mark' : 'Normal' },
          rows: [['Stage (synthetic)', lvl.toFixed(2) + ' m'], ['Discharge vs peak', Math.round(F.st.qn * 100) + ' %'], ['Data', 'synthetic gauge, not CWC / India-WRIS']], spark: 'qn', note: 'IMD and India-WRIS remain excluded until written terms exist, so this gauge is simulated.' };
      } });
    });

    /* staging + hotspot markers */
    P.markers = [];
    S.STAGING_SITES.forEach(function (d) {
      var gr = new T.Group(), ring = new T.Mesh(new T.RingGeometry(1.6, 1.9, 36).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false })); ring.position.y = 0.15;
      var pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 2.6, 5).translate(0, 1.3, 0), new T.MeshBasicMaterial({ color: 0x38e1ff })); gr.add(ring, pole); at(gr, d.x, d.z); ctx.add('teams', gr); P.markers.push({ g: gr, d: d, ring: ring });
      ctx.reg({ id: d.id, kind: 'staging', name: d.name, icon: 'target', color: '#38e1ff', anchor: gr, lblY: 2.8, layer: 'teams', prio: 4, pick: [ring], describe: function (F) {
        return { status: { tone: 'info', text: ctx.decision.staging ? 'Approved by commander' : 'AEGIS recommendation' }, rows: [['Ground level', C.H(d.x, d.z).toFixed(2) + ' m'], ['Above predicted peak', (C.H(d.x, d.z) - C.FLOOD_PEAK.level).toFixed(2) + ' m'], ['Chosen by', ctx.decision.staging ? 'Human commander' : 'Waiting for a human']], note: 'Pre-positioning is a recommendation. Agency commanders task the teams.' };
      } });
    });
    S.HOTSPOTS.forEach(function (d) {
      var ring = new T.Mesh(new T.RingGeometry(1.2, 1.5, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xff5d6c, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false })); at(ring, d.x, d.z, 0.2); ctx.add('risk', ring);
      ctx.reg({ id: d.id, kind: 'hotspot', name: d.name, icon: 'alert', color: '#ff5d6c', anchor: ring, lblY: 1.5, layer: 'risk', prio: 4, pick: [ring], describe: function (F) {
        var depth = Math.max(0, F.st.flood - C.H(d.x, d.z));
        return { status: { tone: depth > 0.5 ? 'bad' : depth > 0.1 ? 'warn' : 'info', text: depth > 0.05 ? 'Flooded ' + depth.toFixed(2) + ' m' : 'Predicted hotspot' }, rows: [['Predicted depth at peak', Math.max(0, (F.st.pred.has ? F.st.pred.level : C.FLOOD_PEAK.level) - C.H(d.x, d.z)).toFixed(2) + ' m'], ['Ranking factors', 'people × depth × access']], note: 'Ranked and explained by AEGIS; teams are tasked by humans.' };
      } }); d.ring = ring;
    });

    /* ---------------- cell towers ---------------- */
    var opCol = {}; S.OPERATORS.forEach(function (o) { opCol[o.id] = o.color; });
    var domeGeo = new T.SphereGeometry(17, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    S.TOWERS.forEach(function (d, ti) {
      var gr = new T.Group(), lat = new T.Mesh(new T.CylinderGeometry(0.1, 0.34, 4.2, 3, 7, true).translate(0, 2.1, 0), new T.MeshBasicMaterial({ color: 0xcfd8e6, wireframe: true }));
      gr.add(lat, at2(box(0.7, 0.4, 0.5, 0x8d97a8), 0.55, 0.2, 0.4));
      var panels = [];
      for (var sct = 0; sct < 3; sct++) d.hosts.forEach(function (hid, hi) {
        var pn = box(0.14, 0.52, 0.05, 0x333a46, 0x000000), an = sct * 2.094, rr = 0.22; pn.material.emissive.set(opCol[hid]); pn.material.emissiveIntensity = 0.7;
        pn.position.set(Math.cos(an) * rr + (hi - 1.5) * 0.12 * Math.cos(an + 1.57), 4.0 - hi * 0.1, Math.sin(an) * rr + (hi - 1.5) * 0.12 * Math.sin(an + 1.57)); pn.rotation.y = -an + Math.PI / 2; gr.add(pn); panels.push(pn);
      });
      var dishM = new T.Mesh(new T.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, 1.1), lam(0xffffff)); dishM.position.set(0.25, 3.2, 0); dishM.rotation.z = -1.2; gr.add(dishM);
      at(gr, d.x, d.z, -0.03);
      var dome = new T.Mesh(domeGeo, new T.MeshBasicMaterial({ color: 0x4be3a0, transparent: true, opacity: 0.05, depthWrite: false, side: T.DoubleSide, wireframe: false }));
      var dw = new T.Mesh(domeGeo, new T.MeshBasicMaterial({ color: 0x4be3a0, transparent: true, opacity: 0.12, depthWrite: false, wireframe: true }));
      dome.add(dw); dome.position.set(d.x, hAt(d.x, d.z) + 0.2, d.z); dome.visible = false; ctx.add('coverage', dome);
      var rings = [0, 1, 2].map(function () { var rg = new T.Mesh(new T.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })); rg.position.set(d.x, hAt(d.x, d.z) + 0.5, d.z); rg.visible = false; ctx.add('towers', rg); return rg; });
      d.group = gr; d.panels = panels; d.dome = dome; d.rings = rings; d.lat = lat; d.top = hAt(d.x, d.z) + 4.6; d.base = hAt(d.x, d.z);
      ctx.add('towers', gr); P.towers[d.id] = d;
      ctx.reg({ id: d.id, kind: 'tower', name: d.name, icon: 'tower', color: '#ff7ab0', anchor: gr, lblY: 5.3, layer: 'towers', prio: 7, pick: [lat, gr], describe: function (F) {
        var s = S.towerStatus(d, F.t), dep = Math.max(0, F.st.flood - d.h);
        var fail = isFinite(d.fail) ? C.fmtT(d.fail) : 'none in this scenario', rest = isFinite(d.restore) ? C.fmtT(d.restore) : '—';
        return { status: { tone: s === 'down' ? 'bad' : s === 'degraded' ? 'warn' : 'ok', text: s === 'down' ? 'DOWN · water at the cabinet' : s === 'degraded' ? 'Degraded' : 'In service' },
          rows: [['Hosted operators', d.hosts.map(function (h) { return S.OPERATORS.filter(function (o) { return o.id === h; })[0].name; }).join(' · ')], ['Ground level', d.h.toFixed(2) + ' m'], ['Flood depth at site', dep.toFixed(2) + ' m'], ['Battery backup', d.battery + ' h'], ['Fails (model)', fail], ['Restored (model)', rest], ['Coverage radius', '≈' + Math.round(d.radius * 1.2) + ' km (schematic)']],
          note: 'Towers are shared infrastructure; several operators mount panels. Illustrative: no tower data is real.', ev: ['tw'], actions: [{ id: 'coverage', label: 'Show coverage' }] };
      } });
    });
    S.TOWERS.forEach(function () { });
    P.coverageFor = null;

    /* ---------------- satellites + hubs ---------------- */
    function satModel(col, scale) {
      var g2 = new T.Group(); g2.add(box(0.5, 0.36, 0.36, 0xe5e9f0, 0x000000)); g2.children[0].material.emissive.set(col); g2.children[0].material.emissiveIntensity = 0.35;
      [-1, 1].forEach(function (s) { var p = box(1.25, 0.04, 0.55, 0x2a4fd6, 0x0a2a8a); p.position.x = s * 0.95; g2.add(p); });
      var dsh = new T.Mesh(new T.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, 1.1), lam(0xffffff)); dsh.position.set(0, -0.3, 0); dsh.rotation.x = Math.PI; g2.add(dsh);
      g2.scale.setScalar(scale); g2.traverse(function (o) { if (o.material) o.material.fog = false; }); return g2;
    }
    S.SATS.forEach(function (d) {
      var gr = new T.Group(), m = satModel(parseInt(d.color.slice(1), 16), d.kind === 'geo' ? 3.4 : 2.6); gr.add(m);
      var cone = new T.Mesh(new T.ConeGeometry(d.kind === 'geo' ? 14 : 4.5, 1, 20, 1, true), new T.MeshBasicMaterial({ color: parseInt(d.color.slice(1), 16), transparent: true, opacity: 0.13, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false }));
      cone.visible = false; gr.add(cone); ctx.add('satellites', gr); d.group = gr; d.cone = cone; d.model = m; P.sats[d.id] = d;
      ctx.reg({ id: d.id, kind: 'satellite', name: d.name, icon: 'satellite', color: d.color, anchor: gr, lblY: 2.4, layer: 'satellites', prio: 8, pick: [m], describe: function (F) {
        return { status: { tone: 'info', text: d.kind === 'geo' ? 'Geostationary-type · fixed in the sky' : 'Low orbit · passes every ' + Math.round(d.period * 1.5) + ' min (schematic)' },
          rows: [['What it does', d.role], ['Product', d.product], ['Used by AEGIS?', d.id === 'sat_navic' || d.id === 'sat_d2c' ? 'No: operator/agency-side service' : 'Yes, as licence-checked public data']],
          note: d.id === 'sat_navic' || d.id === 'sat_d2c' ? 'AEGIS cannot call this link; it can only be reached through the authority and operators.' : 'Illustrative class of satellite; no live feed is used.', ev: d.id === 'sat_sar' ? ['sar'] : d.id === 'sat_gpm' ? ['gpm'] : d.id === 'sat_wx' ? ['ir'] : [] };
      } });
    });
    S.HUBS.forEach(function (d) {
      var gr = new T.Group(), col = parseInt(d.color.slice(1), 16), core;
      if (d.icon === 'cloud') { core = new T.Group(); [[0, 0, 0, 1.6], [1.5, -0.2, 0.3, 1.2], [-1.4, -0.3, -0.2, 1.1]].forEach(function (c) { var s = new T.Mesh(new T.SphereGeometry(c[3], 12, 8), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, fog: false })); s.position.set(c[0], c[1], c[2]); core.add(s); }); }
      else core = new T.Mesh(new T.OctahedronGeometry(d.icon === 'server' ? 1.5 : 2.2, 0), new T.MeshBasicMaterial({ color: col, wireframe: true, fog: false }));
      var inner = new T.Mesh(new T.OctahedronGeometry(d.icon === 'server' ? 0.9 : 1.3, 0), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, fog: false }));
      var ringM = new T.Mesh(new T.RingGeometry(2.6, 2.75, 40), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: T.DoubleSide, fog: false })); ringM.rotation.x = Math.PI / 2.4;
      var pole = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, -d.y, 0)]), new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0.25, fog: false }));
      gr.add(core, inner, ringM, pole); gr.position.set(d.x, d.y, d.z); ctx.add('comms', gr); d.group = gr; d.core = core; d.ringM = ringM; P.hubs[d.id] = d;
      ctx.reg({ id: d.id, kind: 'hub', name: d.name, icon: d.icon === 'server' ? 'server' : d.icon, color: d.color, anchor: gr, lblY: 3.4, layer: 'comms', prio: 8, pick: [core, inner], describe: function (F) {
        var bc = BCAST.some(function (b) { return F.t >= b[0] && F.t <= b[1]; }), op = d.op;
        var rows = d.id === 'hub_open' ? [['Feeds', 'Open-Meteo · NASA GIBS · Copernicus (licence-checked)'], ['Rule', 'Fixed HTTPS allow-list; stale data is flagged'], ['Excluded', 'IMD · India-WRIS until written terms']]
          : d.id === 'hub_ndma' ? [['Role', 'Authority: sets area and severity, signs, transmits'], ['Protocol', 'CAP 1.2 → SACHET → operators'], ['AEGIS relation', 'Receives an approved file from a human; AEGIS never sends']]
          : [['Role', 'Cell Broadcast Centre (CBC) pushes the alert to towers in the target cells'], ['Operators act on', 'the authority’s instruction'], ['Hosted towers', S.TOWERS.filter(function (t) { return t.hosts.indexOf(op) > -1; }).length + ' in this region']];
        return { status: { tone: bc && d.id !== 'hub_open' ? 'warn' : 'info', text: bc && d.id !== 'hub_open' ? 'Pushing broadcast' : 'Standing by' }, rows: rows, note: d.id.indexOf('cbc') > 0 ? 'Operator names describe the real-world ecosystem only: no affiliation or integration.' : '', ev: d.id === 'hub_open' ? ['om', 'glofas'] : ['cbc'] };
      } });
    });
    /* place labels */
    S.PLACES.forEach(function (d) {
      var o = new T.Object3D(); at(o, d.x, d.z, 1); scene_add(o);
      ctx.reg({ id: d.id, kind: 'place', name: d.name, sub: d.sub, icon: 'pin', color: '#cfe2ff', anchor: o, lblY: 5, layer: 'labels', prio: 2, pick: [], style: 'place', describe: function () { return { status: { tone: 'info', text: d.sub }, rows: [], note: '' }; } });
    });
    function scene_add(o) { ctx.scene.add(o); }

    /* ---------------- per-frame ---------------- */
    var lampBase = [];
    roads.filter(function (r) { return r.kind === 'city'; }).forEach(function (r) { for (var s = 2; s < r.len - 2; s += 5) { var p = ctx.roadPoint(r, s); lampBase.push([p[0] + 0.5, p[1] + 0.5]); } });
    var bcOn = false;
    P.update = function (F) {
      var st = F.st, t = F.t, time = F.time, night = 1 - F.day, power = !S.powerOutage(t), dt = F.dt;
      bu.uNight.value = clamp(night * 1.15, 0, 1); bu.uPower.value = power ? 1 : 0;
      tu.uTime.value = time; tu.uWind.value = clamp(st.wind * 1.1, 0, 1);
      // street lamps + beacons via the shared glow batch
      var gl = ctx.glow;
      if (night > 0.15 && ctx.layerOn.roads) {
        for (var li = 0; li < lampBase.length; li++) {
          var L = lampBase[li]; if (Math.hypot(L[0] - F.target.x, L[1] - F.target.z) > 70) continue;
          var gh = hAt(L[0], L[1]); if (st.flood > gh + 0.3) continue;
          if (power) gl.push(L[0], gh + 0.9, L[1], 1, 0.8, 0.45, 0.9 * night); else if (li % 7 === 0) gl.push(L[0], gh + 0.9, L[1], 0.5, 0.45, 0.35, 0.5 * night);
        }
      }
      var hf = ctx.layerOn.buildings;
      for (var id in fac) {
        var f = fac[id]; f.g.visible = hf;
        if (f.lamp && hf) {
          var lp = f.lamp, base = f.g.position, d = f.def, c = [1, 0.3, 0.3];
          if (d.kind === 'eoc') { c = [0.22, 0.88, 1]; gl.push(base.x + lp[0], base.y + lp[1], base.z + lp[2], c[0], c[1], c[2], 1.2 + 0.5 * Math.sin(time * 4)); }
          else if (d.kind === 'substation') { var out = !power; gl.push(base.x + lp[0], base.y + lp[1], base.z + lp[2], out ? 1 : 0.2, out ? 0.2 : 0.9, 0.2, 0.9 + 0.4 * Math.sin(time * 6) * (out ? 1 : 0)); }
          else if (d.kind === 'hospital') gl.push(base.x + lp[0], base.y + lp[1], base.z + lp[2], 1, 0.3, 0.3, 0.6 + (power ? 0 : 0.5 * Math.sin(time * 5)));
          else if (d.kind === 'lighthouse' && (night > 0.2 || st.cloud > 0.6)) gl.push(base.x, base.y + 4.4, base.z, 1, 0.95, 0.6, 2);
        }
        if (f.sweep) f.sweep.rotation.z = -time * 1.4;
        if (f.dish) f.dish.rotation.y = 0.6 + Math.sin(time * 0.2) * 0.4;
        if (f.beam) { f.beam.rotation.y = time * 0.9; f.beam.visible = night > 0.2 || st.cloud > 0.6; }
      }
      // gauge LEDs
      S.GAUGES.forEach(function (d) { var warn = st.qn > 0.75 ? [1, 0.3, 0.3] : st.qn > 0.45 ? [1, 0.75, 0.2] : [0.3, 0.9, 0.55]; d.led.material.color.setRGB(warn[0], warn[1], warn[2]); d.group.visible = ctx.layerOn.water; });
      // turbines / boats
      P.turbines.forEach(function (tb) { var sp = st.wind > 0.8 ? 0.05 : 0.5 + st.wind * 4; tb.hub.rotation.z += dt * sp; });
      P.boats.forEach(function (b) { b.g.position.y = 0.1 + Math.sin(time * 1.4 + b.ph) * 0.05 * (1 + st.wind * 3) + st.flood * 0.0; b.g.rotation.z = Math.sin(time * 1.1 + b.ph) * 0.05 * (1 + st.wind * 3); b.g.visible = hf; });
      // towers
      var sel = F.selected, hov = F.hover, bcast = BCAST.some(function (b) { return t >= b[0] && t <= b[1]; }), bcI = -1;
      BCAST.forEach(function (b, k) { if (t >= b[0] && t <= b[1]) bcI = k; });
      var showCov = ctx.layerOn.coverage;
      S.TOWERS.forEach(function (d, ti) {
        var s = S.towerStatus(d, t), g2 = d.group, down = s === 'down', targetLean = down ? (0.22 + (ti % 3) * 0.06) : 0;
        g2.rotation.z += (targetLean - g2.rotation.z) * Math.min(1, dt * 2); g2.rotation.x += ((down ? -0.08 : 0) - g2.rotation.x) * Math.min(1, dt * 2);
        var pi = down ? 0.02 : s === 'degraded' ? 0.35 + 0.35 * Math.sin(time * 9 + ti) : 0.8; d.panels.forEach(function (pn) { pn.material.emissiveIntensity = pi; });
        d.lat.material.color.setHex(down ? 0x555c6a : 0xcfd8e6);
        var tgt = d.group.visible = ctx.layerOn.towers;
        var domeOn = showCov || sel === d.id || hov === d.id || (bcast && !down);
        var dc = down ? [1, 0.3, 0.3] : s === 'degraded' ? [1, 0.75, 0.2] : [0.3, 0.9, 0.55];
        d.dome.visible = domeOn && ctx.layerOn.towers; d.dome.material.color.setRGB(dc[0], dc[1], dc[2]); d.dome.children[0].material.color.setRGB(dc[0], dc[1], dc[2]);
        // beacon
        if (tgt) {
          var bp = d.group.position; var blink = 0.5 + 0.5 * Math.sin(time * 2 + ti);
          if (!down) gl.push(bp.x, d.top, bp.z, 1, 0.2, 0.2, 0.7 * blink + 0.2); else gl.push(bp.x + 0.6, bp.y + 3.4, bp.z, 1, 0.1, 0.1, 0.5 + 0.5 * Math.sin(time * 7));
        }
        // broadcast rings
        d.rings.forEach(function (rg, k) {
          var on = bcast && !down && ctx.layerOn.towers; rg.visible = on; if (!on) return;
          var u = ((time * 0.45 + k / 3 + ti * 0.13) % 1); rg.scale.setScalar(0.6 + u * d.radius * 1.15); rg.material.opacity = (1 - u) * 0.75;
          rg.material.color.setHex(bcI === 1 ? 0xff9d6b : 0xffd08a);
        });
      });
      // satellites
      S.SATS.forEach(function (d) {
        var gr = d.group; gr.visible = ctx.layerOn.satellites; if (!gr.visible) return;
        var x, y, z;
        if (d.kind === 'geo') { x = d.pos[0]; y = d.pos[1]; z = d.pos[2]; }
        else { var u = (time / d.period + d.ph) % 1, ang = d.inc * 1.2 + 0.9, dx = Math.cos(ang), dz = Math.sin(ang), off = d.inc * 90; x = 10 + dx * (u * 2 - 1) * 380 - dz * off; z = 10 + dz * (u * 2 - 1) * 380 + dx * off; y = d.alt; }
        gr.position.set(x, y, z); d.model.rotation.y = time * 0.15;
        var cone = d.cone, active = (d.id === 'sat_d2c' && ctx.alert2Active(F)) || (d.id === 'sat_navic' && ctx.alert2Active(F)) || d.kind === 'leo' && d.id !== 'sat_d2c' || d.id === 'sat_wx';
        var tx = d.kind === 'geo' ? C.CITY.x : x, tz = d.kind === 'geo' ? C.CITY.z : z, gy = hAt(Math.max(-69, Math.min(69, tx)), Math.max(-69, Math.min(69, tz)));
        var len = Math.hypot(tx - x, gy - y, tz - z); cone.visible = active && (d.kind === 'geo' ? (d.id === 'sat_wx' || ctx.alert2Active(F)) : Math.abs(x) < 110 && Math.abs(z) < 110);
        if (cone.visible) { cone.scale.set(1, len, 1); cone.position.set((tx - x) / 2, (gy - y) / 2, (tz - z) / 2); cone.lookAt(tx + 0 * x, gy, tz); cone.rotateX(Math.PI / 2); cone.rotateX(Math.PI); cone.material.opacity = d.kind === 'geo' ? 0.07 : 0.14; }
        gl.push(x, y + 0.5, z, 1, 1, 1, 1.3);
      });
      // hubs
      S.HUBS.forEach(function (d) {
        var hv = ctx.layerOn.comms; d.group.visible = hv; if (!hv) return;
        d.core.rotation.y = time * 0.5; d.ringM.rotation.z = time * 0.4; d.group.position.y = d.y + Math.sin(time * 0.8 + d.x) * 0.6;
        var act = d.id === 'hub_open' ? t > -66 : d.id === 'hub_ndma' ? t > -17.6 : (t > -17.4);
        var col = G.rgb(d.color); gl.push(d.x, d.group.position.y, d.z, col[0], col[1], col[2], act ? 3.2 : 1.4);
      });
      P.bcast = bcast;
    };
    P.opsPos = function () { var f = fac.fac_eoc; return f ? new T.Vector3(f.g.position.x, f.g.position.y + 3.9, f.g.position.z) : new T.Vector3(); };
    P.fac = fac;
    return P;
  };
}
