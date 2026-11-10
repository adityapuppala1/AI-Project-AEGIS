/* AEGIS Live Earth — statistics, hazard screening, geodesy, sun position and DEM hydrology (pure functions, Node-testable).
 * Everything here is a SCREENING aid computed from public data. It is not an official warning or a forecast of record. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {}, M = AX.model = {};
  var PI = Math.PI, RAD = PI / 180, EARTH_R = 6371.0088, EULER = 0.5772156649;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  M.clamp = clamp; M.lerp = lerp;

  /* ---------------- geodesy ---------------- */
  M.haversine = function (la1, lo1, la2, lo2) {
    var dLa = (la2 - la1) * RAD, dLo = (lo2 - lo1) * RAD, a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  M.mPerDeg = function (lat) { var p = lat * RAD; return { lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p), lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) }; };
  M.toLocal = function (lat0, lon0, lat, lon) { var m = M.mPerDeg(lat0); return { x: (lon - lon0) * m.lon, z: -(lat - lat0) * m.lat }; };
  M.fromLocal = function (lat0, lon0, x, z) { var m = M.mPerDeg(lat0); return { lat: lat0 - z / m.lat, lon: lon0 + x / m.lon }; };
  M.bbox = function (lat, lon, spanKm) { var m = M.mPerDeg(lat), h = spanKm * 500; return { latMin: lat - h / m.lat, latMax: lat + h / m.lat, lonMin: lon - h / m.lon, lonMax: lon + h / m.lon }; };
  M.tileX = function (lon, z) { return (lon + 180) / 360 * Math.pow(2, z); };
  M.tileY = function (lat, z) { var p = lat * RAD; return (1 - Math.log(Math.tan(p) + 1 / Math.cos(p)) / PI) / 2 * Math.pow(2, z); };
  M.tileLon = function (x, z) { return x / Math.pow(2, z) * 360 - 180; };
  M.tileLat = function (y, z) { var n = PI - 2 * PI * y / Math.pow(2, z); return Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) / RAD; };
  M.destination = function (lat, lon, bearingDeg, distKm) {
    var d = distKm / EARTH_R, b = bearingDeg * RAD, p1 = lat * RAD, l1 = lon * RAD;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / RAD, lon: ((l2 / RAD + 540) % 360) - 180 };
  };

  /* ---------------- sun (SunCalc-style astronomy) ---------------- */
  var DAY_MS = 86400000, J1970 = 2440588, J2000 = 2451545, OBL = RAD * 23.4397;
  function toDays(date) { return date.valueOf() / DAY_MS - 0.5 + J1970 - J2000; }
  function sunCoords(d) {
    var Mn = RAD * (357.5291 + 0.98560028 * d), C = RAD * (1.9148 * Math.sin(Mn) + 0.02 * Math.sin(2 * Mn) + 0.0003 * Math.sin(3 * Mn)), L = Mn + C + RAD * 102.9372 + PI;
    return { dec: Math.asin(Math.sin(OBL) * Math.sin(L)), ra: Math.atan2(Math.sin(L) * Math.cos(OBL), Math.cos(L)) };
  }
  M.sunPos = function (date, lat, lon) {
    var d = toDays(date), c = sunCoords(d), lw = -lon * RAD, phi = lat * RAD, H = RAD * (280.16 + 360.9856235 * d) - lw - c.ra;
    return { azimuth: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) + PI, altitude: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)) };
  };
  M.subsolar = function (date) {
    var d = toDays(date), c = sunCoords(d), lon = (c.ra - RAD * (280.16 + 360.9856235 * d)) / RAD;
    lon = ((lon % 360) + 540) % 360 - 180; return { lat: c.dec / RAD, lon: lon };
  };

  /* ---------------- statistics ---------------- */
  M.mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; };
  M.std = function (a) { var m = M.mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : NaN; };
  M.percentile = function (arr, p) { var a = arr.slice().sort(function (x, y) { return x - y; }); if (!a.length) return NaN; var i = clamp(p / 100 * (a.length - 1), 0, a.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return lerp(a[lo], a[hi], i - lo); };
  M.linreg = function (xs, ys) {
    var n = xs.length, mx = M.mean(xs), my = M.mean(ys), sxy = 0, sxx = 0, syy = 0, i;
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    var slope = sxx ? sxy / sxx : 0; return { slope: slope, intercept: my - slope * mx, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : 0, n: n };
  };
  /* Gumbel (EV1) by L-moments: robust for the short annual-maxima samples we have */
  M.gumbelFit = function (vals) {
    var x = vals.filter(function (v) { return isFinite(v); }).sort(function (a, b) { return a - b; }), n = x.length;
    if (n < 8) return null;
    var b0 = M.mean(x), b1 = 0, i; for (i = 0; i < n; i++) b1 += (i / (n - 1)) * x[i]; b1 /= n;
    var l2 = 2 * b1 - b0, beta = l2 / Math.LN2; if (!(beta > 1e-9)) return null;
    return { mu: b0 - EULER * beta, beta: beta, n: n };
  };
  M.gumbelQ = function (f, T) { return f.mu - f.beta * Math.log(-Math.log(1 - 1 / Math.max(T, 1.0001))); };
  M.gumbelRP = function (f, x) { var F = Math.exp(-Math.exp(-(x - f.mu) / f.beta)); return F >= 1 - 1e-9 ? 1e9 : 1 / (1 - F); };
  M.bootstrapRP = function (f, x, B, seed) {
    var rng = (AX.core && AX.core.rng) ? AX.core.rng(seed || 7) : Math.random, out = [], b, i, s;
    for (b = 0; b < (B || 400); b++) { s = []; for (i = 0; i < f.n; i++) s.push(f.mu - f.beta * Math.log(-Math.log(Math.min(0.999999, Math.max(1e-6, rng()))))); var ff = M.gumbelFit(s); if (ff) out.push(Math.min(M.gumbelRP(ff, x), 1e4)); }
    return out.length ? { lo: M.percentile(out, 5), mid: M.percentile(out, 50), hi: M.percentile(out, 95) } : null;
  };
  M.rpText = function (T) { return T >= 1000 ? '> 1-in-1000 yr' : T < 1.5 ? 'within the normal annual range' : '1-in-' + (T < 10 ? T.toFixed(1) : Math.round(T)) + ' yr'; };
  M.rpLevel = function (T) { return T < 2 ? 0 : T < 5 ? 1 : T < 20 ? 2 : T < 100 ? 3 : 4; };

  /* annual aggregates from a daily series; dates are 'YYYY-MM-DD' */
  M.annual = function (dates, series) {
    var by = {}, i, k;
    for (i = 0; i < dates.length; i++) {
      var y = +dates[i].slice(0, 4); by[y] = by[y] || { n: 0 };
      for (k in series) { var v = series[k][i]; if (v == null || !isFinite(v)) continue; var o = by[y]; (o[k] = o[k] || []).push(v); }
      by[y].n++;
    }
    return by;
  };
  M.maxRolling = function (a, w) { var best = -Infinity, s = 0, i; for (i = 0; i < a.length; i++) { s += a[i] || 0; if (i >= w) s -= a[i - w] || 0; if (i >= w - 1 && s > best) best = s; } return best; };

  /* ---------------- classification (screening thresholds; NOT official warnings) ---------------- */
  M.LEVELS = ['Normal', 'Watch', 'Heightened', 'High', 'Extreme'];
  M.rainClass = function (mm) {   // IMD 24 h rainfall classes
    var t = [[204.5, 'Extremely heavy', 4], [115.6, 'Very heavy', 3], [64.5, 'Heavy', 2], [15.6, 'Moderate', 1], [2.5, 'Light', 0], [0.1, 'Very light', 0]];
    for (var i = 0; i < t.length; i++) if (mm >= t[i][0]) return { label: t[i][1], level: t[i][2] };
    return { label: 'None', level: 0 };
  };
  M.beaufort = function (kmh) {
    var t = [[118, 12, 'Hurricane force'], [103, 11, 'Violent storm'], [89, 10, 'Storm'], [75, 9, 'Strong gale'], [62, 8, 'Gale'], [50, 7, 'Near gale'], [39, 6, 'Strong breeze'], [29, 5, 'Fresh breeze'], [20, 4, 'Moderate breeze'], [12, 3, 'Gentle breeze'], [6, 2, 'Light breeze'], [1, 1, 'Light air']];
    for (var i = 0; i < t.length; i++) if (kmh >= t[i][0]) return { force: t[i][1], label: t[i][2], level: t[i][1] >= 12 ? 4 : t[i][1] >= 10 ? 3 : t[i][1] >= 8 ? 2 : t[i][1] >= 7 ? 1 : 0 };
    return { force: 0, label: 'Calm', level: 0 };
  };
  M.heatLevel = function (tmax) { return tmax >= 48 ? 4 : tmax >= 45 ? 3 : tmax >= 40 ? 2 : tmax >= 37 ? 1 : 0; };
  M.coldLevel = function (tmin) { return tmin <= -20 ? 4 : tmin <= -10 ? 3 : tmin <= 0 ? 2 : tmin <= 4 ? 1 : 0; };
  M.snowLevel = function (cm) { return cm >= 40 ? 4 : cm >= 20 ? 3 : cm >= 10 ? 2 : cm >= 1 ? 1 : 0; };
  M.visLevel = function (m) { return m < 50 ? 3 : m < 200 ? 2 : m < 1000 ? 1 : 0; };
  var WMO = { 0: ['Clear sky', 'sun'], 1: ['Mainly clear', 'sun'], 2: ['Partly cloudy', 'cloud'], 3: ['Overcast', 'cloud'], 45: ['Fog', 'cloud'], 48: ['Rime fog', 'cloud'], 51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Dense drizzle', 'rain'], 56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'], 61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 66: ['Freezing rain', 'rain'], 67: ['Heavy freezing rain', 'rain'], 71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'], 80: ['Rain showers', 'rain'], 81: ['Heavy showers', 'rain'], 82: ['Violent showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Heavy snow showers', 'snow'], 95: ['Thunderstorm', 'zap'], 96: ['Thunderstorm with hail', 'zap'], 99: ['Severe thunderstorm with hail', 'zap'] };
  M.wmo = function (c) { return WMO[c] || ['—', 'cloud']; };
  M.windDir = function (deg) { return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; };

  /* hourly forecast helpers: hours = [{t:ms, ...}] */
  M.interp = function (hours, t) {
    if (!hours.length) return null; if (t <= hours[0].t) return hours[0]; if (t >= hours[hours.length - 1].t) return hours[hours.length - 1];
    var lo = 0, hi = hours.length - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (hours[mid].t <= t) lo = mid; else hi = mid; }
    var a = hours[lo], b = hours[hi], u = (t - a.t) / (b.t - a.t), o = { t: t, code: u < 0.5 ? a.code : b.code };
    ['temp', 'precip', 'rain', 'snowfall', 'snowDepth', 'cloud', 'vis', 'wind', 'gust', 'cape', 'pop', 'windDir'].forEach(function (k) { o[k] = (a[k] == null || b[k] == null) ? (a[k] == null ? b[k] : a[k]) : lerp(a[k], b[k], u); });
    return o;
  };
  M.windowSum = function (hours, tFrom, key, hoursSpan) { var s = 0; for (var i = 0; i < hours.length; i++) if (hours[i].t > tFrom && hours[i].t <= tFrom + hoursSpan * 3600000) s += hours[i][key] || 0; return s; };
  M.windowMax = function (hours, tFrom, key, hoursSpan) { var m = -Infinity; for (var i = 0; i < hours.length; i++) if (hours[i].t > tFrom && hours[i].t <= tFrom + hoursSpan * 3600000 && hours[i][key] != null) m = Math.max(m, hours[i][key]); return m === -Infinity ? null : m; };
  M.windowMin = function (hours, tFrom, key, hoursSpan) { var m = Infinity; for (var i = 0; i < hours.length; i++) if (hours[i].t > tFrom && hours[i].t <= tFrom + hoursSpan * 3600000 && hours[i][key] != null) m = Math.min(m, hours[i][key]); return m === Infinity ? null : m; };

  /* Hazard board from a forecast + (optional) stats. Every row says what it used, so nothing is a black box. */
  M.hazardBoard = function (inp) {
    var rows = [], f = inp.hours || [], t0 = inp.t0, st = inp.stats || {};
    if (f.length) {
      var r24 = M.windowSum(f, t0, 'precip', 24), r72 = M.windowSum(f, t0, 'precip', 72), rpk = M.windowMax(f, t0, 'precip', 72), rc = M.rainClass(r24), rp = null, why = 'Forecast 24 h rain vs IMD classes';
      if (st.rain1d) { var T = M.gumbelRP(st.rain1d, Math.max(r24, 0.1)); rp = { T: T, ci: M.bootstrapRP(st.rain1d, Math.max(r24, 0.1), 300, 11) }; why += '; vs ERA5 annual maxima (' + st.rain1d.n + ' yr, Gumbel)'; }
      rows.push({ id: 'rain', icon: 'rain', title: 'Heavy rain', value: r24.toFixed(0) + ' mm / 24 h', sub: '72 h: ' + r72.toFixed(0) + ' mm · peak ' + (rpk == null ? '—' : rpk.toFixed(1)) + ' mm/h', level: Math.max(rc.level, rp ? M.rpLevel(rp.T) : 0), cls: rc.label, rp: rp, why: why });
      var gmax = M.windowMax(f, t0, 'gust', 72), bf = M.beaufort(gmax || 0), wrp = null; if (st.gust && gmax != null) wrp = { T: M.gumbelRP(st.gust, gmax) };
      rows.push({ id: 'wind', icon: 'wind', title: 'Damaging wind', value: gmax == null ? '—' : gmax.toFixed(0) + ' km/h gust', sub: bf.label + ' (Beaufort ' + bf.force + ')', level: bf.level, rp: wrp, why: 'Max forecast gust next 72 h vs Beaufort scale' + (wrp ? ' and ERA5 gust maxima' : '') });
      var tmax = M.windowMax(f, t0, 'temp', 72), tmin = M.windowMin(f, t0, 'temp', 72);
      if (tmax != null) rows.push({ id: 'heat', icon: 'sun', title: 'Extreme heat', value: tmax.toFixed(1) + ' °C max', sub: st.tmaxP99 != null ? 'local 99th percentile ' + st.tmaxP99.toFixed(1) + ' °C' : '', level: M.heatLevel(tmax), why: 'Forecast hourly max next 72 h vs fixed thresholds (37/40/45/48 °C)' });
      if (tmin != null) rows.push({ id: 'cold', icon: 'snow', title: 'Extreme cold', value: tmin.toFixed(1) + ' °C min', sub: '', level: M.coldLevel(tmin), why: 'Forecast hourly min next 72 h vs fixed thresholds (4/0/−10/−20 °C)' });
      var sn = M.windowSum(f, t0, 'snowfall', 24), sd = M.windowMax(f, t0, 'snowDepth', 72);
      rows.push({ id: 'snow', icon: 'snow', title: 'Snowfall', value: sn.toFixed(1) + ' cm / 24 h', sub: sd != null ? 'depth up to ' + (sd * 100).toFixed(0) + ' cm' : '', level: M.snowLevel(sn), why: 'Forecast snowfall vs fixed thresholds (1/10/20/40 cm per 24 h)' });
      var vis = M.windowMin(f, t0, 'vis', 24);
      if (vis != null) rows.push({ id: 'vis', icon: 'cloud', title: 'Low visibility', value: (vis / 1000).toFixed(1) + ' km min', sub: '', level: M.visLevel(vis), why: 'Lowest forecast visibility next 24 h' });
      var ts = f.filter(function (h) { return h.t > t0 && h.t <= t0 + 24 * 3600000 && h.code >= 95; }).length;
      rows.push({ id: 'storm', icon: 'zap', title: 'Thunderstorms', value: ts ? ts + ' h of storm codes' : 'none forecast', sub: '', level: ts ? (ts >= 6 ? 3 : 2) : 0, why: 'WMO weather codes 95–99 in the next 24 h' });
    }
    if (inp.flood && inp.flood.fit) {
      var fl = inp.flood, fq = fl.forecastMax, T2 = M.gumbelRP(fl.fit, fq);
      rows.push({ id: 'flood', icon: 'waves', title: 'River flood', value: fq.toFixed(0) + ' m³/s peak', sub: 'return levels: 2 yr ' + M.gumbelQ(fl.fit, 2).toFixed(0) + ' · 5 yr ' + M.gumbelQ(fl.fit, 5).toFixed(0) + ' · 20 yr ' + M.gumbelQ(fl.fit, 20).toFixed(0), level: M.rpLevel(T2), rp: { T: T2, ci: M.bootstrapRP(fl.fit, fq, 300, 5) }, why: 'GloFAS-derived forecast discharge vs ' + fl.fit.n + '-yr annual maxima (Gumbel), 2/5/20-yr thresholds' });
    } else if (inp.flood) rows.push({ id: 'flood', icon: 'waves', title: 'River flood', value: 'no estimate', sub: 'no river cell or too little history', level: 0, why: 'Abstains: the flood model has no usable river grid cell here', abstain: true });
    var lv = 0; rows.forEach(function (r) { lv = Math.max(lv, r.level || 0); });
    return { rows: rows, level: lv, label: M.LEVELS[lv] };
  };

  /* ---------------- tsunami (geometry only) ---------------- */
  M.tsunamiSpeedKmh = function (depthM) { return Math.sqrt(9.81 * depthM) * 3.6; };
  M.tsunamiEtaHours = function (distKm, depthM) { return distKm / M.tsunamiSpeedKmh(depthM || 4000); };

  /* ---------------- hydrology on a regular DEM grid (n x n, row-major, row 0 = north) ---------------- */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) { var a = this.a, i = a.length; a.push([k, v]); while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
  Heap.prototype.pop = function () { var a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; var i = 0, n = a.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && a[l][0] < a[m][0]) m = l; if (r < n && a[r][0] < a[m][0]) m = r; if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } } return top; };
  Heap.prototype.size = function () { return this.a.length; };
  M.Heap = Heap;
  var DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1], DD = [1, 1.4142, 1, 1.4142, 1, 1.4142, 1, 1.4142];
  M.fillPits = function (elev, n) {                      // priority-flood: every cell gets a monotone path to the border
    var out = new Float32Array(n * n).fill(Infinity), seen = new Uint8Array(n * n), h = new Heap(), i, j, k;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (i === 0 || j === 0 || i === n - 1 || j === n - 1) { k = j * n + i; out[k] = elev[k]; seen[k] = 1; h.push(out[k], k); }
    while (h.size()) {
      var c = h.pop()[1], cx = c % n, cy = (c / n) | 0;
      for (var d = 0; d < 8; d++) { var x = cx + DX[d], y = cy + DY[d]; if (x < 0 || y < 0 || x >= n || y >= n) continue; var q = y * n + x; if (seen[q]) continue; seen[q] = 1; out[q] = Math.max(elev[q], out[c] + 1e-4); h.push(out[q], q); }
    }
    return out;
  };
  M.flowDir = function (z, n) {
    var dir = new Int8Array(n * n).fill(-1), x, y, d;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      var k = y * n + x, best = 0, bd = -1;
      for (d = 0; d < 8; d++) { var xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; var s = (z[k] - z[yy * n + xx]) / DD[d]; if (s > best) { best = s; bd = d; } }
      dir[k] = bd;
    }
    return dir;
  };
  M.accumulate = function (z, dir, n) {
    var order = new Array(n * n), i; for (i = 0; i < n * n; i++) order[i] = i; order.sort(function (a, b) { return z[b] - z[a]; });
    var acc = new Float32Array(n * n).fill(1);
    for (i = 0; i < order.length; i++) { var k = order[i], d = dir[k]; if (d < 0) continue; var x = k % n + DX[d], y = ((k / n) | 0) + DY[d]; if (x >= 0 && y >= 0 && x < n && y < n) acc[y * n + x] += acc[k]; }
    return acc;
  };
  /* HAND: height above the nearest downstream channel / sea cell. opts.extra[k]=1 marks extra water cells. */
  M.hand = function (elev, n, opts) {
    opts = opts || {}; var z = M.fillPits(elev, n), dir = M.flowDir(z, n), acc = M.accumulate(z, dir, n), thr = opts.threshold || Math.max(10, 0.008 * n * n), i;
    var seed = new Uint8Array(n * n), ocean = opts.ocean == null ? 0.5 : opts.ocean;
    for (i = 0; i < n * n; i++) if (acc[i] >= thr || elev[i] <= ocean || (opts.extra && opts.extra[i])) seed[i] = 1;
    var order = new Array(n * n); for (i = 0; i < n * n; i++) order[i] = i; order.sort(function (a, b) { return z[a] - z[b]; });
    var ref = new Float32Array(n * n), hand = new Float32Array(n * n);
    for (i = 0; i < order.length; i++) {
      var k = order[i], d = dir[k];
      if (seed[k] || d < 0) { ref[k] = elev[k]; hand[k] = 0; continue; }
      var x = k % n + DX[d], y = ((k / n) | 0) + DY[d]; var dn = y * n + x; ref[k] = ref[dn]; hand[k] = Math.max(0, elev[k] - ref[k]);
    }
    return { hand: hand, seed: seed, acc: acc, thr: thr };
  };
}
