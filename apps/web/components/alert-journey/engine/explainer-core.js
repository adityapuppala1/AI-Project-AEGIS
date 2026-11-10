/* AEGIS Alert Journey explainer — terrain + simulation maths (pure functions, no DOM, no THREE).
 * Everything the 3D world shows is a deterministic function of simulated time, so the timeline can be scrubbed.
 * ALL values are synthetic and schematic: not geography, not a forecast, not an accuracy claim. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {};
  var R2 = Math.SQRT1_2, PI = Math.PI;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function gauss(x) { return Math.exp(-x * x); }
  function hash2(ix, iz) {
    var h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    var u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), u), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), u), v);
  }
  function fbm(x, z, o) {
    var s = 0, a = 0.5, f = 1; o = o || 4;
    for (var i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
    return s;
  }
  function rng(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- terrain ----------------
   * Rotated frame: a runs NW(-)→SE(+) along the river, b is across it. Sea level is y = 0. */
  var CITY = { x: 14, z: 12 };
  function toA(x, z) { return (x + z) * R2; }
  function toB(x, z) { return (x - z) * R2; }
  function fromAB(a, b) { return [(a + b) * R2, (a - b) * R2]; }
  function riverB(a) { return 3.5 * Math.sin(0.09 * a + 0.5) + 1.5 * Math.sin(0.23 * a); }
  function riverHalf(a) { return 0.9 + 1.7 * sstep(-30, 45, a); }
  function mtnAt(a) { return sstep(-8, -52, a); }
  function plainP(a) {
    if (a < 15) return 1.25 + 0.045 * (15 - a);
    if (a < 54) return 1.25 - 0.032 * (a - 15);
    return 0.002 - 0.25 * (a - 54);
  }
  function baseH(x, z) {
    var a = toA(x, z), b = toB(x, z), br = riverB(a), d = Math.abs(b - br), m = mtnAt(a);
    var h = plainP(a) + 0.058 * Math.min(d, 44) * (1 + 0.9 * m);
    var rid = 1 - Math.abs(2 * fbm(x * 0.045 + 10, z * 0.045 - 4, 5) - 1);
    h += Math.pow(m, 1.15) * (3 + 14 * rid * rid);
    var lat = sstep(18, 58, d) * sstep(60, 38, a);
    h += lat * (1.5 + 6.5 * fbm(x * 0.06 + 3, z * 0.06 + 7, 4));
    var amp = 0.1 + 0.8 * m + 0.45 * lat;
    h += (fbm(x * 0.11, z * 0.11, 3) - 0.35) * amp;
    // gentle flat floodplain under the city
    var dc = Math.hypot(x - CITY.x, z - CITY.z), w = 1 - sstep(20, 34, dc);
    if (w > 0) h = lerp(h, plainP(a) + 0.058 * Math.min(d, 44), w);
    return h;
  }
  /* river bed never dips below sea level until the estuary, so the sea does not reach the city at baseline */
  function bedFloor(a) { return lerp(0.14, -0.3, sstep(46, 57, a)); }
  function bedFrom(hc, a) { return Math.max(hc - (1.05 + 1.7 * mtnAt(a)), bedFloor(a)); }
  function H(x, z) {
    var a = toA(x, z), b = toB(x, z), br = riverB(a), d = Math.abs(b - br), hb = baseH(x, z);
    var half = riverHalf(a), bank = half + 3.4;
    if (d >= bank) return hb;
    var c = fromAB(a, br), hc = baseH(c[0], c[1]);
    var bed = bedFrom(hc, a);
    return lerp(Math.min(bed, hb), hb, sstep(half, bank, d));
  }
  function bedAt(a) {
    var c = fromAB(a, riverB(a));
    return bedFrom(baseH(c[0], c[1]), a);
  }
  function slopeAt(x, z) {
    var e = 0.8; return Math.hypot(H(x + e, z) - H(x - e, z), H(x, z + e) - H(x, z - e)) / (2 * e);
  }
  /* terrain colour (r,g,b 0..1). Rural patchwork, urban grey, forest, rock, snow, beach, river mud. */
  function pal(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
  var CROPS = [pal(0xb9a64a), pal(0x7fae45), pal(0x4f8f3a), pal(0x8a6f47), pal(0xc9b960)];
  function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function colorAt(x, z, h, slOpt) {
    var a = toA(x, z), b = toB(x, z), d = Math.abs(b - riverB(a)), sl = slOpt !== undefined ? slOpt : slopeAt(x, z), n = fbm(x * 0.35, z * 0.35, 2);
    var c;
    if (h < -0.15) c = mix3(pal(0x1b3b5a), pal(0x2d6a8a), sstep(-6, -0.15, h));
    else if (h < 0.55) c = mix3(pal(0xd9c79a), pal(0xb9aa7a), n);
    else {
      c = mix3(pal(0x6aa04a), pal(0x4c8a3c), n);
      // rural crop patchwork west of the city
      var rx = (x + 42) / 36, rz = (z + 18) / 40;
      if (rx > 0 && rx < 1 && rz > 0 && rz < 1 && a > -30 && a < 8) {
        var cell = hash2(Math.floor(x / 5.5), Math.floor(z / 4.2));
        c = mix3(c, CROPS[Math.floor(cell * 5) % 5], 0.85);
      }
      if (h > 5.5) c = mix3(c, pal(0x2f6a3a), sstep(5, 8, h) * 0.8);          // forest belt
      if (h > 9 || sl > 1.15) c = mix3(c, pal(0x7d7468), clamp((sl - 0.8) * 1.2 + sstep(8.5, 12, h), 0, 1));
      if (h > 14.2) c = mix3(c, pal(0xf1f5ff), sstep(14.2, 16.5, h));
    }
    var dc = Math.hypot(x - CITY.x, z - CITY.z);
    if (dc < 25) c = mix3(c, pal(0x7b8190), (1 - sstep(15, 25, dc)) * 0.9);          // urban ground
    if (d < riverHalf(a) + 3.2 && h > 0.0) c = mix3(c, pal(0x7a6a4f), (1 - sstep(riverHalf(a), riverHalf(a) + 3.2, d)) * 0.7); // mud banks
    return c;
  }

  /* ---------------- series ---------------- */
  function series(pts) {
    var n = pts.length, m = [];
    for (var i = 0; i < n; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
      m.push((p1[1] - p0[1]) / Math.max(1e-6, p1[0] - p0[0]));
    }
    return function (t) {
      if (t <= pts[0][0]) return pts[0][1];
      if (t >= pts[n - 1][0]) return pts[n - 1][1];
      var i = 0; while (i < n - 2 && t > pts[i + 1][0]) i++;
      var a = pts[i], b = pts[i + 1], h = b[0] - a[0], s = (t - a[0]) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * h * m[i + 1];
    };
  }

  /* ---------------- simulation ---------------- */
  var TMIN = -72, TMAX = 24, LANDFALL_CLOCK = 15.5;
  var EYE_X = series([[-80, 300], [-72, 262], [-48, 172], [-24, 104], [-12, 72], [-6, 57], [0, 44], [3, 39], [6, 38], [10, 44], [14, 56], [20, 80], [30, 130]]);
  var EYE_Z = series([[-80, 330], [-72, 292], [-48, 192], [-24, 116], [-12, 82], [-6, 65], [0, 48], [3, 33], [6, 12], [10, -14], [14, -40], [20, -80], [30, -140]]);
  var INT = series([[-80, 0.1], [-72, 0.2], [-60, 0.34], [-48, 0.52], [-36, 0.7], [-24, 0.86], [-12, 0.97], [-6, 1], [0, 1], [4, 0.88], [8, 0.62], [12, 0.42], [18, 0.25], [30, 0.1]]);
  function eyeAt(t) { return { x: EYE_X(t), z: EYE_Z(t) }; }
  function intensityAt(t) { return INT(t); }
  function radiusOf(I) { return 24 + 46 * I; }
  function weatherAt(t, x, z) {
    var e = eyeAt(t), I = INT(t), r = radiusOf(I), d = Math.hypot(x - e.x, z - e.z);
    return { rain: clamp(I * gauss(d / r) * 1.25, 0, 1), wind: clamp(I * gauss(d / (r * 1.5)), 0, 1), cloud: clamp(1.1 * gauss(d / (r * 2.2)), 0, 1), dist: d, I: I, eye: e, r: r };
  }
  var CATCH = [-18, -18];
  var HYD = (function () {
    var t0 = -110, dt = 0.05, n = Math.round((48 - t0) / dt) + 1, Q = new Float32Array(n), q = 0.02, mx = 0, i, t;
    for (i = 0; i < n; i++) {
      t = t0 + i * dt;
      var w = weatherAt(t, CATCH[0], CATCH[1]);
      q += dt * (1.2 * Math.pow(w.rain, 1.1) * (1 - 0.25 * Math.min(q, 3)) - 0.13 * q);
      Q[i] = q;
      if (t >= TMIN && t <= TMAX && q > mx) mx = q;
    }
    return { t0: t0, dt: dt, n: n, Q: Q, mx: mx };
  })();
  function qnAt(t) {
    var f = (t - HYD.t0) / HYD.dt, i = clamp(Math.floor(f), 0, HYD.n - 2), u = clamp(f - i, 0, 1);
    return lerp(HYD.Q[i], HYD.Q[i + 1], u) / HYD.mx;
  }
  function surgeAt(t) { return 0.8 * INT(t) * gauss((t - 1.4) / 2.5); }
  /* flood-plane height (sea level 0): river overbank + storm surge */
  function floodAt(t) { return 1.35 * (1.45 * Math.pow(Math.max(qnAt(t), 0), 1.25) + surgeAt(t)); }
  var FLOOD_PEAK = (function () {
    var best = 0, bt = 0;
    for (var t = TMIN; t <= TMAX; t += 0.05) { var f = floodAt(t); if (f > best) { best = f; bt = t; } }
    return { level: best, t: bt };
  })();
  /* AI flood-level forecast: wobbles, then narrows (synthetic rehearsal numbers) */
  var PRED = series([[-62, 0], [-60, 1.55], [-48, FLOOD_PEAK.level - 0.5], [-36, FLOOD_PEAK.level + 0.22], [-24, FLOOD_PEAK.level - 0.14], [-12, FLOOD_PEAK.level + 0.07], [-4, FLOOD_PEAK.level + 0.02], [0, FLOOD_PEAK.level]]);
  var SIG = series([[-62, 1.1], [-48, 0.72], [-36, 0.52], [-24, 0.38], [-12, 0.24], [-4, 0.14], [6, 0.08]]);
  function predAt(t) {
    if (t < -61) return { has: false, level: 0, sigma: 0 };
    return { has: true, level: PRED(t), sigma: SIG(t) };
  }
  /* cone of uncertainty half-width (world units) at lead tau hours */
  function trackSigma(t, tau) { return (2.2 + 0.62 * tau) * (0.32 + 0.68 * sstep(0, -56, t)); }

  function clockAt(t) { return (((LANDFALL_CLOCK + t) % 24) + 24) % 24; }
  function dayIndex(t) { return Math.floor((LANDFALL_CLOCK + t) / 24); }       // 0 = landfall day
  function sunAt(t) {
    var h = clockAt(t), ang = PI * (h - 6) / 12, ex = Math.cos(ang), ey = Math.sin(ang);
    var elev = ey;                              // positive daytime
    var day = sstep(-0.08, 0.28, elev), dusk = 1 - Math.abs(clamp(elev * 4, -1, 1));
    return { dir: [ex * 0.82, elev, -0.45], elev: elev, day: day, dusk: dusk * (elev > -0.3 ? 1 : 0), hour: h };
  }
  function fmtClock(t) {
    var h = clockAt(t), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function fmtT(t) {
    var s = t < 0 ? '−' : '+', a = Math.abs(t), h = Math.floor(a), m = Math.floor((a - h) * 60);
    return 'T' + s + h + 'h' + (m < 10 ? '0' : '') + m;
  }
  function dayLabel(t) {
    var d = dayIndex(t); return d === 0 ? 'Landfall day' : d < 0 ? 'Day ' + d : 'Day +' + d;
  }
  function category(I) {
    return I < 0.3 ? 'Depression' : I < 0.5 ? 'Cyclonic storm' : I < 0.72 ? 'Severe cyclonic storm' : I < 0.92 ? 'Very severe cyclonic storm' : 'Extremely severe cyclonic storm';
  }
  /* full state at time t (cheap enough to call every frame) */
  function stateAt(t) {
    var I = INT(t), e = eyeAt(t), wc = weatherAt(t, CITY.x, CITY.z), wh = weatherAt(t, CATCH[0], CATCH[1]);
    var sun = sunAt(t), qn = qnAt(t), F = floodAt(t), pr = predAt(t);
    return {
      t: t, I: I, eye: e, radius: radiusOf(I), category: category(I),
      rain: wc.rain, wind: wc.wind, cloud: wc.cloud, hillRain: wh.rain, dist: wc.dist,
      qn: qn, flood: F, surge: surgeAt(t), pred: pr, sun: sun, clock: fmtClock(t), tLabel: fmtT(t),
      windKmh: Math.round(wc.wind * 150), rainMmh: Math.round(wc.rain * 85),
      pressure: Math.round(1008 - 70 * I), maxWindKmh: Math.round(35 + 125 * I)
    };
  }

  /* road/river helpers for the world builder */
  function riverPoints(step) {
    var pts = [], a;
    for (a = -86; a <= 74; a += step || 1.5) { var c = fromAB(a, riverB(a)); pts.push({ a: a, x: c[0], z: c[1], bed: bedAt(a), half: riverHalf(a) }); }
    return pts;
  }
  function riverDist(x, z) { var a = toA(x, z); return Math.abs(toB(x, z) - riverB(a)) - riverHalf(a); }

  AX.core = {
    clamp: clamp, lerp: lerp, sstep: sstep, gauss: gauss, hash2: hash2, vnoise: vnoise, fbm: fbm, rng: rng, series: series,
    CITY: CITY, H: H, baseH: baseH, colorAt: colorAt, slopeAt: slopeAt, toA: toA, toB: toB, fromAB: fromAB, riverB: riverB, riverHalf: riverHalf,
    riverPoints: riverPoints, riverDist: riverDist, bedAt: bedAt, mtnAt: mtnAt,
    TMIN: TMIN, TMAX: TMAX, LANDFALL_CLOCK: LANDFALL_CLOCK,
    eyeAt: eyeAt, intensityAt: intensityAt, radiusOf: radiusOf, weatherAt: weatherAt, qnAt: qnAt, surgeAt: surgeAt, floodAt: floodAt,
    FLOOD_PEAK: FLOOD_PEAK, predAt: predAt, trackSigma: trackSigma, clockAt: clockAt, sunAt: sunAt, dayIndex: dayIndex, dayLabel: dayLabel,
    fmtClock: fmtClock, fmtT: fmtT, category: category, stateAt: stateAt
  };
}
