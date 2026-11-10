/* AEGIS Alert Journey explainer — actors: residents (alert reception, evacuation, rescue), traffic, response teams, communication streams, KPIs. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};

  AX.buildActors = function (ctx, P) {
    var T = ctx.T, C = ctx.C, G = ctx.G, S = ctx.S, q = ctx.q, A = {}, rnd = C.rng(77), hAt = ctx.hAt, clamp = C.clamp, lerp = C.lerp, sstep = C.sstep;
    var gl = ctx.glow, lines = G.lineBatch(3400); ctx.add('comms', lines.obj);
    function lam(c, e) { return new T.MeshLambertMaterial({ color: c, emissive: e || 0 }); }
    function hex(c) { return new T.Color(c); }

    /* ---- flood table for fast scans ---- */
    var T0 = C.TMIN, DT = 0.05, NF = Math.round((C.TMAX - C.TMIN) / DT) + 1, Fg = new Float32Array(NF), i, j, k;
    for (i = 0; i < NF; i++) Fg[i] = C.floodAt(T0 + i * DT);
    function Fq(t) { var f = clamp((t - T0) / DT, 0, NF - 1.001), a = f | 0; return lerp(Fg[a], Fg[a + 1], f - a); }
    function firstAbove(h, from) { for (var n = Math.max(0, Math.floor((from - T0) / DT)); n < NF; n++) if (Fg[n] > h) return T0 + n * DT; return Infinity; }
    ctx.Fq = Fq;
    var T1 = -17.0, T2 = -2.2;
    ctx.alert2Active = function (F) { return F.t > -2.45 && F.t < 3.5; };

    /* ---- teams: waypoint interpolation ---- */
    function ease(u) { return u * u * (3 - 2 * u); }
    function teamAt(team, t, plan) {
      var w = plan === 'A' ? team.wpA : team.wpB, n = w.length, a, b, u;
      if (t <= w[0][0]) return { x: w[0][1], z: w[0][2], status: w[0][3], moving: false, next: w[1] };
      if (t >= w[n - 1][0]) return { x: w[n - 1][1], z: w[n - 1][2], status: w[n - 1][3], moving: false, next: null };
      for (i = 0; i < n - 1; i++) if (t < w[i + 1][0]) break;
      a = w[i]; b = w[i + 1]; u = ease((t - a[0]) / (b[0] - a[0]));
      var mv = Math.hypot(b[1] - a[1], b[2] - a[2]) > 0.3;
      return { x: lerp(a[1], b[1], u), z: lerp(a[2], b[2], u), status: mv ? (b[3] === 'Deployed' ? 'Moving to hotspot' : b[3] === 'Returning' ? 'Returning' : b[3] === 'Cut off' ? 'Cut off' : 'En route') : a[3], moving: mv, next: b, dx: b[1] - a[1], dz: b[2] - a[2] };
    }
    A.teamAt = teamAt;
    function firstDeployed(id, plan) { var tm = S.TEAMS.filter(function (x) { return x.id === id; })[0], w = plan === 'A' ? tm.wpA : tm.wpB; for (var n = 0; n < w.length; n++) if (w[n][3] === 'Deployed') return w[n][0]; return Infinity; }
    function rescueTimes(plan) { return [firstDeployed('R1', plan), firstDeployed('R2', plan), firstDeployed('F1', plan), (S.TEAMS.filter(function (x) { return x.id === 'A1'; })[0].wpB.filter(function (w) { return Math.abs(w[1] - 42) < 1 && w[2] === 31; })[0] || [5])[0]]; }
    ctx.rescueTimes = rescueTimes;

    /* ---- residents ---- */
    var NP = q.people, ppl = [], cityRoads = ctx.roads.filter(function (r) { return r.kind === 'city'; });
    function pickHome(cat) {
      for (var tr = 0; tr < 40; tr++) {
        var x, z;
        if (cat === 'city') { var rd = cityRoads[(rnd() * cityRoads.length) | 0], p = ctx.roadPoint(rd, rnd() * rd.len), sd = (rnd() < 0.5 ? -1 : 1) * (0.95 + rnd() * 0.3); x = p[0] - p[3] * sd; z = p[1] + p[2] * sd; }
        else if (cat === 'rural') { x = -22 + (rnd() - 0.5) * 16; z = 10 + (rnd() - 0.5) * 18; }
        else if (cat === 'coast') { x = 43 + (rnd() - 0.5) * 9; z = 28 + (rnd() - 0.5) * 9; }
        else { x = -40 + (rnd() - 0.5) * 9; z = -26 + (rnd() - 0.5) * 9; }
        var h = hAt(x, z); if (h < (cat === 'coast' ? 0.3 : 0.95) || C.riverDist(x, z) < 1.8) continue;
        return [x, z, h];
      }
      return [14, 0, 2];
    }
    var shelBy = {}; S.SHELTERS.forEach(function (s) { shelBy[s.route] = s; });
    function routeFor(x, z, cat) { if (cat === 'hill') return null; if (cat === 'rural') return 'NW'; if (cat === 'coast') return 'NE'; return C.toB(x, z) - C.riverB(C.toA(x, z)) > 0 ? 'NE' : (z > 14 ? 'SW' : 'NW'); }
    for (i = 0; i < NP; i++) {
      var r0 = rnd(), cat = i === 0 ? 'city' : r0 < 0.64 ? 'city' : r0 < 0.80 ? 'rural' : r0 < 0.93 ? 'coast' : 'hill';
      var hm = i === 0 ? [8, 19, hAt(8, 19)] : pickHome(cat), route = routeFor(hm[0], hm[1], cat), sh = route ? shelBy[route] : null, path = null, cum = null, L = 0;
      if (route) {
        var pts = [[hm[0], hm[1]]].concat(S.ROUTES[route]).concat([[sh.x + (rnd() - 0.5) * 3.2, sh.z + (rnd() - 0.5) * 3.2]]);
        cum = [0]; for (j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1])); L = cum[cum.length - 1]; path = pts;
      }
      var tw = null, best = 1e9; S.TOWERS.forEach(function (t) { var d = Math.hypot(t.x - hm[0], t.z - hm[1]); if (d < best) { best = d; tw = t; } });
      var dev = i === 0 ? 'cb' : rnd() < 0.72 ? 'cb' : rnd() < 0.64 ? 'sms' : 'none', cov = best <= tw.radius, d2c = i === 0 ? false : rnd() < 0.36;
      var recv1 = Infinity, via1 = 'none';
      if (cov) {
        if (dev === 'cb') { recv1 = T1 + 0.02 + rnd() * 0.18; via1 = 'cb'; } else if (dev === 'sms') { recv1 = T1 + 0.1 + rnd() * 0.7; via1 = 'sms'; }
        else if (rnd() < 0.75) { recv1 = T1 + 1.2 + rnd() * 1.8; via1 = 'volunteer'; }
      } else if (rnd() < 0.7) { recv1 = T1 + 2 + rnd() * 2; via1 = 'volunteer'; }
      var recv2 = Infinity, via2 = 'none', down2 = S.towerStatus(tw, T2 + 0.02) === 'down';
      if (cov && !down2 && dev !== 'none') { recv2 = T2 + 0.02 + rnd() * (dev === 'cb' ? 0.14 : 0.6); via2 = dev === 'cb' ? 'cb' : 'sms'; }
      else if (d2c) { recv2 = T2 + 0.15 + rnd() * 0.5; via2 = 'sat'; }
      var stay = i !== 0 && route && rnd() < 0.07, start = recv1 < 1e8 && !stay && route ? recv1 + 0.25 + rnd() * 1.1 : Infinity, dur = route ? 0.8 + L * 0.07 : 1;
      var tDanger = firstAbove(hm[2] + 0.25, -30), hsI = -1, hb = 12; S.HOTSPOTS.forEach(function (hs, n2) { var dd = Math.hypot(hs.x - hm[0], hs.z - hm[1]); if (dd < hb) { hb = dd; hsI = n2; } });
      ppl.push({ hx: hm[0], hz: hm[1], hy: hm[2], cat: cat, route: route, sh: sh, path: path, cum: cum, L: L, tw: tw, twd: best, cov: cov, dev: dev, d2c: d2c, recv1: recv1, via1: via1, recv2: recv2, via2: via2, stay: stay, start: start, dur: dur, tDanger: tDanger, hs: hsI, rank: rnd(), seed: rnd() * 6.28, spot: sh ? [sh.x + (rnd() - 0.5) * 4.2, sh.z + (rnd() - 0.5) * 4.2] : null, x: hm[0], y: hm[2], z: hm[1], lit: 0, litC: [1, 0.75, 0.25], mode: 'home' });
    }
    ppl[0].isPersona = true; ppl[0].name = 'Lakshmi';
    var bodyG = new T.CylinderGeometry(0.05, 0.065, 0.26, 6).translate(0, 0.17, 0), headG = new T.SphereGeometry(0.055, 8, 6).translate(0, 0.36, 0);
    var bodies = G.inst(bodyG, lam(0xffffff), NP), heads = G.inst(headG, lam(0xf0c9a0), NP), cloth = [0x4e79c4, 0xc45454, 0x4ea36b, 0xd9b04a, 0x8a5cc4, 0xe8e8e8, 0x4cb7c4];
    for (i = 0; i < NP; i++) bodies.setColorAt(i, hex(cloth[i % cloth.length]));
    bodies.instanceColor.needsUpdate = true; ctx.add('people', bodies); ctx.add('people', heads);
    var personaRing = new T.Mesh(new T.RingGeometry(0.35, 0.42, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false })); ctx.add('people', personaRing);
    var personaPick = new T.Mesh(new T.SphereGeometry(0.55, 8, 6), new T.MeshBasicMaterial({ visible: false })); ctx.scene.add(personaPick);
    ctx.reg({ id: 'person_lakshmi', kind: 'person', name: 'Lakshmi · resident, Zone B', icon: 'users', color: '#ffffff', anchor: personaPick, lblY: 1.2, layer: 'people', prio: 6, pick: [personaPick], describe: function (F) {
      var p = ppl[0], k2 = F.kpiP;
      return { status: { tone: p.mode === 'sheltered' ? 'ok' : p.mode === 'walk' ? 'info' : 'warn', text: p.mode === 'sheltered' ? 'At shelter S2' : p.mode === 'walk' ? 'Walking to shelter' : p.recv1 > F.t ? 'Has not been alerted yet' : 'Alerted · preparing' },
        rows: [['Alert received', isFinite(p.recv1) ? C.fmtT(p.recv1) + ' via cell broadcast' : '—'], ['Leaves home', isFinite(p.start) ? C.fmtT(p.start) : '—'], ['Reaches shelter', isFinite(p.start) ? C.fmtT(p.start + p.dur) : '—'], ['Network', k2 ? k2.net : '4G'], ['Language shown', 'Telugu / Hindi / English (illustrative)']],
        note: 'A synthetic resident. Click “Follow Lakshmi” to see the alert from her phone.', actions: [{ id: 'followPerson', label: 'Follow Lakshmi' }] };
    } });

    /* ---- traffic ---- */
    var NC = q.cars, NEV = Math.round(NC * 0.55), cars = [], carGeo = new T.BoxGeometry(0.56, 0.2, 0.26).translate(0, 0.14, 0), cabG = new T.BoxGeometry(0.3, 0.13, 0.22).translate(-0.02, 0.28, 0);
    var carM = G.inst(carGeo, lam(0xffffff), NC + NEV), cabM = G.inst(cabG, lam(0x1b2330, 0x080c14), NC + NEV), ccol = [0xd04040, 0x3a6fd0, 0xe8e8e8, 0x2a2f38, 0xe0b030, 0x3aa070, 0xb0b8c4];
    ctx.add('roads', carM); ctx.add('roads', cabM);
    var Tc = new Float32Array(Math.round((C.TMAX - C.TMIN) / 0.1) + 2), acc = 0;
    for (i = 0; i < Tc.length; i++) { var tt = C.TMIN + i * 0.1, sn = C.sunAt(tt), wr = C.weatherAt(tt, C.CITY.x, C.CITY.z).rain; Tc[i] = acc; acc += 0.1 * clamp(0.3 + 0.7 * sn.day - 0.75 * wr, 0.05, 1); }
    function tcum(t) { var f = clamp((t - C.TMIN) / 0.1, 0, Tc.length - 1.001), a = f | 0; return lerp(Tc[a], Tc[a + 1], f - a); }
    function pingpong(s, L) { var m = s % (2 * L); if (m < 0) m += 2 * L; return m < L ? [m, 1] : [2 * L - m, -1]; }
    for (i = 0; i < NC; i++) {
      var rd2 = cityRoads[i % cityRoads.length], car = { road: rd2, s0: rnd() * rd2.len * 2, v: 2.2 + rnd() * 1.6, lane: (rnd() < 0.5 ? -1 : 1) * 0.3, stall: Infinity, recover: Infinity, evac: false };
      carM.setColorAt(i, hex(ccol[i % ccol.length])); cars.push(car);
      for (var tg = C.TMIN; tg < C.TMAX; tg += 0.1) { var pp = pingpong(car.s0 + car.v * tcum(tg), rd2.len), p2 = ctx.roadPoint(rd2, pp[0]); if (Fq(tg) > C.baseH(p2[0], p2[1]) + 0.2) { car.stall = tg; break; } }
      if (isFinite(car.stall)) { var ps = pingpong(car.s0 + car.v * tcum(car.stall), rd2.len), pq = ctx.roadPoint(rd2, ps[0]), yq = C.baseH(pq[0], pq[1]); car.recover = firstAbove(-9, 0) && (function () { for (var tr = car.stall; tr < C.TMAX; tr += 0.1) if (Fq(tr) < yq) return tr + 0.4; return Infinity; })(); }
    }
    var evacRoads = ctx.roads.filter(function (r) { return r.kind === 'evac'; });
    for (i = 0; i < NEV; i++) {
      var er = evacRoads[i % 3]; cars.push({ road: er, evac: true, t0: -16.2 + rnd() * 4.6, dur: 1.0 + rnd() * 0.6, lane: (rnd() < 0.5 ? -1 : 1) * 0.3, slot: i, stall: Infinity, recover: Infinity });
      carM.setColorAt(NC + i, hex(ccol[(i + 2) % ccol.length]));
    }
    carM.instanceColor.needsUpdate = true;
    var dum = new T.Object3D();
    function setCar(idx, x, y, z, hd, tilt) { dum.position.set(x, y, z); dum.rotation.set(0, -hd, tilt || 0); dum.updateMatrix(); carM.setMatrixAt(idx, dum.matrix); cabM.setMatrixAt(idx, dum.matrix); }

    /* ---- response teams ---- */
    var teams = [];
    function tmesh(kind, col) {
      var gr = new T.Group(), c = parseInt(col.slice(1), 16);
      function bx(w, h, d, cc, ee, x, y, z) { var m = new T.Mesh(new T.BoxGeometry(w, h, d), lam(cc, ee)); m.position.set(x, y, z); gr.add(m); return m; }
      if (kind === 'boat') { var hull = bx(1.2, 0.2, 0.5, c, 0x221100, 0, 0.12, 0); bx(0.4, 0.26, 0.36, 0xffffff, 0, -0.1, 0.34, 0); hull.userData.hull = true; var wh = bx(0.9, 0.06, 0.4, 0x555a66, 0, 0, -0.08, 0); gr.userData.trailer = wh; }
      else if (kind === 'heli') { bx(0.9, 0.38, 0.4, 0xf4f4f4, 0x222222, 0, 0, 0); bx(1.1, 0.08, 0.08, 0xf4f4f4, 0, -0.9, 0.05, 0); var rot = bx(2.2, 0.02, 0.1, 0x222222, 0, 0, 0.25, 0); var rot2 = bx(0.1, 0.02, 2.2, 0x222222, 0, 0, 0.25, 0); gr.userData.rot = [rot, rot2]; bx(0.4, 0.2, 0.36, c, 0x331100, 0.38, 0, 0); }
      else if (kind === 'drone') { bx(0.32, 0.08, 0.32, 0x20242c, 0x111111, 0, 0, 0); var rs = []; [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (s) { var r = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.01, 12), new T.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.45 })); r.position.set(s[0] * 0.3, 0.06, s[1] * 0.3); gr.add(r); rs.push(r); }); gr.userData.rot = rs; }
      else if (kind === 'truck' || kind === 'firetruck') { bx(0.95, 0.38, 0.36, c, 0x110000, -0.1, 0.3, 0); bx(0.3, 0.32, 0.34, 0xffffff, 0, 0.52, 0.26, 0); if (kind === 'firetruck') bx(0.5, 0.04, 0.06, 0xdddddd, 0, -0.1, 0.53, 0); }
      else { bx(0.66, 0.24, 0.3, kind === 'ambulance' ? 0xffffff : kind === 'police' ? 0x1d3a8a : c, kind === 'van' ? 0x221100 : 0, 0, 0.2, 0); bx(0.3, 0.14, 0.26, 0x1b2330, 0, 0.0, 0.38, 0); if (kind === 'ambulance') bx(0.67, 0.06, 0.31, 0xe53b4b, 0x500000, 0, 0.22, 0); }
      return gr;
    }
    S.TEAMS.forEach(function (d) {
      var gr = tmesh(d.kind, d.color), root = new T.Group(); root.add(gr); ctx.add('teams', root);
      var t2 = { d: d, root: root, body: gr, hd: 0, last: null };
      if (d.kind === 'drone') { var cn = new T.Mesh(new T.ConeGeometry(1.4, 4, 14, 1, true), new T.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending })); cn.position.y = -2; root.add(cn); t2.scan = cn; }
      teams.push(t2); root.scale.setScalar(d.kind === 'drone' ? 1.3 : 1.15);
      ctx.reg({ id: d.id, kind: 'team', name: d.name, icon: { boat: 'ship', ambulance: 'ambulance', truck: 'truck', firetruck: 'flame', van: 'wrench', police: 'shield', heli: 'heli', drone: 'drone' }[d.kind], color: d.color, anchor: root, lblY: d.kind === 'heli' ? 2.2 : 1.4, layer: 'teams', prio: 7, pick: [gr], describe: function (F) {
        var s = teamAt(d, F.t, F.plan), nx = s.next, eta = nx && s.moving ? Math.max(0, nx[0] - F.t) : 0;
        var tone = s.status === 'Cut off' ? 'bad' : s.status === 'Deployed' || s.status === 'Moving to hotspot' ? 'ok' : 'info';
        return { status: { tone: tone, text: s.status }, rows: [['Crew', d.info.crew + ' people (synthetic)'], ['Mission', d.info.mission], ['Hotspot', d.info.hotspot], ['Staging plan', F.plan === 'B' ? 'Plan B · AI high-ground sites' : 'Plan A · central yard'], ['Next step', nx ? (nx[3] + (eta ? ' in ' + eta.toFixed(1) + ' h' : '')) : 'Mission complete']],
          note: 'Tasked by the agency commander. AEGIS records the exercise and never dispatches.', actions: [{ id: 'follow', label: 'Follow this team' }, { id: 'route', label: 'Show planned route' }] };
      } });
    });
    var routeLines = [];
    function buildRoutes() {
      routeLines.forEach(function (l) { ctx.scene.remove(l); l.geometry.dispose(); }); routeLines.length = 0;
      S.TEAMS.forEach(function (d, n) {
        var w = ctx.F && ctx.F.plan === 'A' ? d.wpA : d.wpB, pts = [];
        for (var a = 0; a < w.length - 1; a++) if (Math.hypot(w[a + 1][1] - w[a][1], w[a + 1][2] - w[a][2]) > 0.3) for (var s2 = 0; s2 <= 12; s2++) { var u = s2 / 12, x = lerp(w[a][1], w[a + 1][1], u), z = lerp(w[a][2], w[a + 1][2], u); pts.push(new T.Vector3(x, (d.kind === 'heli' ? hAt(x, z) + 6 : hAt(x, z) + 0.5), z)); }
        var ln = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: parseInt(d.color.slice(1), 16), transparent: true, opacity: 0.2 })); ln.visible = false; ln.userData.team = d.id; ctx.scene.add(ln); routeLines.push(ln);
      });
      A.routeLines = routeLines; A.routePlan = ctx.F ? ctx.F.plan : 'B';
    }
    A.buildRoutes = buildRoutes;

    /* ---- links (communication streams) ---- */
    var LK = [], pv = new T.Vector3(), tmpA = new T.Vector3(), tmpB = new T.Vector3();
    function ep(id, dy) { var e = ctx.byId[id], v = new T.Vector3(); return function () { e.anchor.getWorldPosition(v); v.y += (dy === undefined ? (e.lblY || 0) * 0.8 : dy); return v; }; }
    function link(a, b, col, act, n, lift, spd) { LK.push({ a: a, b: b, col: G.rgb(col), act: act, n: n || 5, lift: lift === undefined ? 0.16 : lift, spd: spd || 0.45 }); }
    A.makeLinks = function () {
      var inB = function (F) { return F.bc; };
      link(ep('sat_wx'), ep('fac_gs'), '#ffb547', function (F) { return 0.8; }, 4, 0.05);
      link(ep('sat_sar'), ep('fac_gs'), '#38e1ff', function (F) { return 0.55; }, 4, 0.05);
      link(ep('sat_gpm'), ep('fac_gs'), '#4be3a0', function (F) { return 0.55; }, 4, 0.05);
      link(ep('fac_gs'), ep('fac_eoc'), '#38e1ff', function (F) { return 0.8; }, 6, 0.3);
      link(ep('hub_open'), ep('fac_eoc'), '#38e1ff', function (F) { return F.t > -66 ? 0.8 : 0; }, 6, 0.2);
      link(ep('fac_eoc'), ep('hub_ndma'), '#ffb547', function (F) { return F.t > -17.6 && F.t < -16.9 || F.t > -2.45 && F.t < -1.9 ? 1 : F.t > -17.6 ? 0.1 : 0; }, 7, 0.25, 0.7);
      S.HUBS.filter(function (h) { return h.op; }).forEach(function (h) {
        link(ep('hub_ndma'), ep(h.id), '#ffb547', function (F) { return F.bc ? 1 : F.t > -17.4 ? 0.08 : 0; }, 5, 0.18, 0.8);
        S.TOWERS.filter(function (tw) { return tw.hosts.indexOf(h.op) > -1; }).forEach(function (tw) {
          link(ep(h.id), ep(tw.id, 4.6), h.color, function (F) { return F.bc && S.towerStatus(tw, F.t) !== 'down' ? 1 : 0; }, 3, 0.1, 0.9);
        });
      });
      link(ep('hub_ndma'), ep('sat_navic'), '#9b7bff', function (F) { return ctx.alert2Active(F) ? 0.9 : 0; }, 5, 0.1, 0.6);
      S.TEAMS.forEach(function (d) {
        var tm = teams.filter(function (x) { return x.d.id === d.id; })[0];
        link(function () { return tmpA.copy(tm.root.position).setY(tm.root.position.y + 1); }, ep('fac_eoc'), d.kind === 'drone' ? '#8fe9ff' : '#4be3a0', function (F) { var s = teamAt(d, F.t, F.plan).status; return s === 'Deployed' || s === 'Moving to hotspot' ? 0.7 : s === 'Staged' || s === 'En route' ? 0.18 : 0; }, 3, 0.2, 0.5);
      });
    };

    /* ---- per-frame ---- */
    var kpi = { reached1: 0, reached2: 0, sheltered: 0, danger: 0, rescued: 0, unreached: 0, walking: 0, total: NP }, shOcc = {};
    ctx.shelterOcc = {};
    var SCALE = 82;
    var lastPlan = null;
    A.update = function (F) {
      var t = F.t, st = F.st, time = F.time, dt = F.dt, night = 1 - F.day, fl = st.flood, plan = F.plan;
      if (lastPlan !== plan) { lastPlan = plan; buildRoutes(); }
      var resc = rescueTimes(plan);
      var show = ctx.layerOn.people;
      bodies.visible = heads.visible = show;
      var r1 = 0, r2 = 0, shl = 0, dgr = 0, rcd = 0, wk = 0, un = 0; for (var s0 in shOcc) shOcc[s0] = 0;
      for (var n = 0; n < NP; n++) {
        var p = ppl[n], mode = 'home', x = p.hx, z = p.hz, y;
        var rescued = p.hs >= 0 && p.stay !== undefined && p.tDanger < 1e8 && !(isFinite(p.start) && p.start + p.dur < p.tDanger) ? Math.max(p.tDanger + 0.3, resc[p.hs] + p.rank * 1.4) : Infinity;
        var evacDone = isFinite(p.start) && t >= p.start + p.dur;
        if (isFinite(p.start) && t >= p.start && !evacDone) {
          var u = ease((t - p.start) / p.dur) * p.L, c = p.cum, a = 0; while (a < c.length - 2 && u > c[a + 1]) a++;
          var f2 = (u - c[a]) / ((c[a + 1] - c[a]) || 1); x = lerp(p.path[a][0], p.path[a + 1][0], f2); z = lerp(p.path[a][1], p.path[a + 1][1], f2); mode = 'walk'; wk++;
        } else if (evacDone) { x = p.spot[0]; z = p.spot[1]; mode = 'sheltered'; shl++; shOcc[p.sh.id] = (shOcc[p.sh.id] || 0) + 1; }
        else if (isFinite(rescued) && t >= p.tDanger && t < rescued) { mode = 'danger'; dgr++; }
        else if (isFinite(rescued) && t >= rescued && p.sh) { x = p.spot ? p.spot[0] : x; z = p.spot ? p.spot[1] : z; mode = 'sheltered'; shl++; rcd++; shOcc[p.sh.id] = (shOcc[p.sh.id] || 0) + 1; }
        p.mode = mode;
        var bob = mode === 'walk' ? Math.abs(Math.sin(time * 9 + p.seed * 5)) * 0.03 : mode === 'danger' ? Math.abs(Math.sin(time * 5 + p.seed)) * 0.06 : 0;
        y = Math.max(hAt(x, z), mode === 'danger' ? Math.min(fl - 0.12, p.hy + 0.5) : -9) + bob;
        if (mode === 'home' && x === p.hx) { x += Math.sin(time * 0.4 + p.seed) * 0.12; z += Math.cos(time * 0.37 + p.seed) * 0.12; }
        p.x = x; p.y = y; p.z = z;
        var sc = mode === 'danger' ? 0.85 : 1; dum.position.set(x, y, z); dum.scale.set(1, sc * (1 + (mode === 'danger' ? 0.1 * Math.sin(time * 6 + p.seed) : 0)), 1); dum.rotation.set(0, mode === 'walk' ? Math.atan2(0, 1) : 0, 0); dum.updateMatrix();
        bodies.setMatrixAt(n, dum.matrix); heads.setMatrixAt(n, dum.matrix);
        // alert reception visuals
        var ag1 = t - p.recv1, ag2 = t - p.recv2, lit = 0, lc = p.litC;
        if (ag1 >= 0) r1++; if (ag2 >= 0) r2++; if (!isFinite(p.recv1) && t > T1 + 3.5 && mode !== 'sheltered') un++;
        if (ag1 >= 0 && ag1 < 0.45) { lit = 1 - ag1 / 0.45; lc = p.via1 === 'cb' ? [1, 0.75, 0.25] : p.via1 === 'sms' ? [0.95, 0.95, 0.35] : [0.3, 1, 0.6]; }
        if (ag2 >= 0 && ag2 < 0.4) { lit = Math.max(lit, 1 - ag2 / 0.4); lc = p.via2 === 'sat' ? [0.72, 0.5, 1] : [1, 0.6, 0.3]; }
        if (mode === 'danger') { lit = 0.6 + 0.4 * Math.sin(time * 7 + p.seed); lc = [1, 0.25, 0.25]; }
        if (show && lit > 0.02 && Math.abs(x - F.target.x) < 120) gl.push(x, y + 0.46, z, lc[0], lc[1], lc[2], 0.3 + 0.55 * lit);
        // tower -> phone beam + satellite beam
        if (ctx.layerOn.comms && show) {
          if (ag1 >= 0 && ag1 < 0.12 && (p.via1 === 'cb' || p.via1 === 'sms')) { var k1 = 1 - ag1 / 0.12; lines.seg(p.tw.group.position.x, p.tw.top, p.tw.group.position.z, x, y + 0.45, z, [1, 0.8, 0.35], k1 * 0.8); }
          if (ag2 >= 0 && ag2 < 0.14) { var k2 = 1 - ag2 / 0.14; if (p.via2 === 'sat') { var sp = P.sats.sat_d2c.group.position; lines.seg(sp.x, sp.y, sp.z, x, y + 0.45, z, [0.72, 0.5, 1], k2 * 0.9); } else if (p.via2 !== 'none') lines.seg(p.tw.group.position.x, p.tw.top, p.tw.group.position.z, x, y + 0.45, z, [1, 0.6, 0.3], k2 * 0.7); }
        }
        if (n === 0) {
          personaPick.position.set(x, y + 0.3, z); personaRing.position.set(x, y + 0.04, z); personaRing.scale.setScalar(1 + 0.2 * Math.sin(time * 4));
          var down2 = S.towerStatus(p.tw, t) === 'down', netTxt = down2 ? (p.d2c ? 'Satellite' : 'No service') : '4G';
          F.kpiP = { net: netTxt, mode: mode, ag1: ag1, ag2: ag2, recv1: p.recv1, recv2: p.recv2, via2: p.via2 };
        }
      }
      bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true; personaRing.visible = show;
      for (var sid in shOcc) ctx.shelterOcc[sid] = Math.round(shOcc[sid] * SCALE);
      // traffic
      var tcv = tcum(t), vis = ctx.layerOn.roads;
      carM.visible = cabM.visible = vis;
      for (n = 0; n < cars.length; n++) {
        var cr = cars[n], cx2, cz2, hd2 = 0, tilt = 0, hide = false, ps2;
        if (cr.evac) {
          var uu = (t - cr.t0) / cr.dur;
          if (uu <= 0) { ps2 = ctx.roadPoint(cr.road, 0.5 + (cr.slot % 5) * 0.9); } else if (uu >= 1) { ps2 = ctx.roadPoint(cr.road, cr.road.len - 0.5 - (cr.slot % 6) * 0.7); } else ps2 = ctx.roadPoint(cr.road, ease(uu) * cr.road.len);
          cx2 = ps2[0] - ps2[3] * cr.lane; cz2 = ps2[1] + ps2[2] * cr.lane; hd2 = Math.atan2(ps2[3], ps2[2]);
        } else {
          var tq = t >= cr.stall && t < cr.recover ? cr.stall : t, pp2 = pingpong(cr.s0 + cr.v * tcum(tq), cr.road.len); ps2 = ctx.roadPoint(cr.road, pp2[0]);
          cx2 = ps2[0] - ps2[3] * cr.lane * pp2[1]; cz2 = ps2[1] + ps2[2] * cr.lane * pp2[1]; hd2 = Math.atan2(ps2[3] * pp2[1], ps2[2] * pp2[1]) + (pp2[1] < 0 ? 0 : 0);
          if (tq === cr.stall && t > cr.stall) tilt = 0.12;
        }
        var cy2 = C.baseH(cx2, cz2) + 0.08; setCar(n, cx2, cy2, cz2, hd2, tilt);
        if (vis && Math.abs(cx2 - F.target.x) < 110) {
          var moving = !(cr.stall <= t && t < cr.recover) && !(cr.evac && (t - cr.t0 <= 0 || t - cr.t0 >= cr.dur));
          if (night > 0.2 && moving) { var fx = Math.cos(hd2) * 0.3, fz = Math.sin(hd2) * 0.3; gl.push(cx2 + fx, cy2 + 0.15, cz2 + fz, 1, 0.95, 0.7, 0.5 * night + 0.1); gl.push(cx2 - fx, cy2 + 0.15, cz2 - fz, 1, 0.1, 0.1, 0.22 * night); }
          if (!moving && cr.stall <= t && t < cr.recover) gl.push(cx2, cy2 + 0.35, cz2, 1, 0.65, 0.1, 0.5 + 0.5 * Math.sin(time * 8 + n));
        }
      }
      carM.instanceMatrix.needsUpdate = cabM.instanceMatrix.needsUpdate = true;
      // closed-road markers
      var closed = 0;
      if (vis) cityRoads.forEach(function (rd, ri) { for (var sI = 2; sI < rd.samples.length; sI += 5) { var sm = rd.samples[sI], by = C.baseH(sm.x, sm.z); if (fl > by + 0.3) { closed++; if (sI % 10 === 2 && Math.abs(sm.x - F.target.x) < 80) gl.push(sm.x, by + 0.5, sm.z, 1, 0.2, 0.25, 0.4 + 0.2 * Math.sin(time * 5 + sI)); } } });
      // teams
      var deployed = 0, tgt = F.followTeam;
      teams.forEach(function (tm, ti) {
        var d = tm.d, s = teamAt(d, t, plan), x = s.x, z = s.z, onWater = fl > hAt(x, z) + 0.05, y;
        if (d.kind === 'heli') y = hAt(x, z) + 6.5 + Math.sin(time * 1.3) * 0.3; else if (d.kind === 'drone') y = hAt(x, z) + 3.6 + Math.sin(time * 2 + ti) * 0.25; else if (d.kind === 'boat') y = Math.max(hAt(x, z), fl) + (onWater ? 0.02 : 0.12); else y = hAt(x, z) + 0.1;
        tm.root.position.set(x, y, z);
        if (s.moving && (s.dx || s.dz)) tm.hd = Math.atan2(s.dz, s.dx); else if (!tm.hd) tm.hd = 0;
        tm.root.rotation.y = -tm.hd; tm.root.visible = ctx.layerOn.teams && !(s.status === 'Depot' && Math.hypot(x - S.DEPOT[0], z - S.DEPOT[1]) < 3 && Math.abs(F.target.x - x) > 70 && d.kind !== 'heli' && false);
        var bd = tm.body.userData; if (bd.rot) bd.rot.forEach(function (r, ri) { if (d.kind === 'heli') r.rotation.y += dt * 30 * (ri ? -1 : 1); else r.rotation.y += dt * 40; });
        if (bd.trailer) bd.trailer.visible = !onWater;
        if (tm.scan) { tm.scan.visible = s.status === 'Deployed' || s.status === 'Moving to hotspot'; tm.scan.position.y = -1.8; }
        if (s.status === 'Deployed' || s.status === 'Moving to hotspot') deployed++;
        if (tm.root.visible) {
          var fl2 = Math.sin(time * 9 + ti) > 0; var base = tm.root.position;
          if (d.kind === 'ambulance' || d.kind === 'police' || d.kind === 'firetruck' || d.kind === 'boat' || d.kind === 'heli') gl.push(base.x, base.y + (d.kind === 'heli' ? 0.45 : 0.62), base.z, fl2 ? 1 : 0.15, 0.2, fl2 ? 0.2 : 1, 0.55);
          else if (d.kind === 'drone') gl.push(base.x, base.y + 0.1, base.z, 0.3, 0.95, 1, 0.45);
          else gl.push(base.x, base.y + 0.7, base.z, 1, 0.7, 0.2, 0.35);
          if (d.kind === 'heli' && (night > 0.3 || st.cloud > 0.7) && (s.status === 'Deployed' || s.moving)) gl.push(base.x, Math.max(hAt(base.x, base.z), fl) + 0.2, base.z, 1, 1, 0.85, 2.4);
        }
        var rl = routeLines[ti]; if (rl) { rl.visible = ctx.layerOn.teams && (F.showRoutes || F.selected === d.id); rl.material.opacity = F.selected === d.id ? 0.95 : 0.22; }
      });
      kpi.reached1 = r1; kpi.reached2 = r2; kpi.sheltered = shl; kpi.danger = dgr; kpi.rescued = rcd; kpi.unreached = un; kpi.walking = wk;
      F.kpi = { pop: Math.round(NP * SCALE), reached1: r1 / NP, reached2: r2 / NP, sheltered: shl * SCALE, danger: dgr * SCALE, rescued: rcd * SCALE, walking: wk * SCALE, unreached: un * SCALE, teamsDeployed: deployed, teamsTotal: teams.length, closed: closed,
        towersUp: S.TOWERS.filter(function (tw) { return S.towerStatus(tw, t) !== 'down'; }).length, towersTotal: S.TOWERS.length, power: !S.powerOutage(t), flooded: Math.round(Math.max(0, fl) * 10) / 10 };
      // links
      if (!LK.length && ctx.byId.sat_wx) A.makeLinks();
      lines.begin();
      if (ctx.layerOn.comms) {
        var Fb = { t: t, bc: F.bc, plan: plan };
        LK.forEach(function (lk) {
          var act = lk.act(Fb); if (act <= 0.01) return; var a = lk.a(), b = lk.b(); tmpA.copy(a); tmpB.copy(b);
          var len = tmpA.distanceTo(tmpB), mx = (tmpA.x + tmpB.x) / 2, my = (tmpA.y + tmpB.y) / 2 + len * lk.lift, mz = (tmpA.z + tmpB.z) / 2, px = tmpA.x, py = tmpA.y, pz = tmpA.z, N = 12, s3;
          for (s3 = 1; s3 <= N; s3++) {
            var u = s3 / N, w = 1 - u, qx = w * w * tmpA.x + 2 * w * u * mx + u * u * tmpB.x, qy = w * w * tmpA.y + 2 * w * u * my + u * u * tmpB.y, qz = w * w * tmpA.z + 2 * w * u * mz + u * u * tmpB.z;
            lines.seg(px, py, pz, qx, qy, qz, lk.col, 0.3 * act); px = qx; py = qy; pz = qz;
          }
          for (var pk = 0; pk < lk.n; pk++) {
            var uu2 = ((time * lk.spd * (0.5 + act) + pk / lk.n) % 1), w2 = 1 - uu2;
            gl.push(w2 * w2 * tmpA.x + 2 * w2 * uu2 * mx + uu2 * uu2 * tmpB.x, w2 * w2 * tmpA.y + 2 * w2 * uu2 * my + uu2 * uu2 * tmpB.y, w2 * w2 * tmpA.z + 2 * w2 * uu2 * mz + uu2 * uu2 * tmpB.z, lk.col[0], lk.col[1], lk.col[2], 0.45 + 0.4 * act);
          }
        });
      }
      lines.end();
    };
    A.people = ppl; A.teams = teams; A.kpi = kpi; A.personaIdx = 0;
    A.personaPos = function () { return new T.Vector3(ppl[0].x, ppl[0].y + 0.4, ppl[0].z); };
    return A;
  };
}
