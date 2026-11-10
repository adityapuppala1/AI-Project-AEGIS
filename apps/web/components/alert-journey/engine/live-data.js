/* AEGIS Live Earth — read-only public data clients (fixed HTTPS allow-list, caching, backoff, per-source status).
 * Display only. Nothing here writes anywhere, creates cases/warnings, or sends messages. Off until the user opts in. */
export default function install(g) {
  'use strict';
  var AX = g.AX = g.AX || {}, L = AX.live = {}, M = AX.model;
  var ALLOW = { 'api.open-meteo.com': 3, 'marine-api.open-meteo.com': 3, 'flood-api.open-meteo.com': 3, 'archive-api.open-meteo.com': 2, 'climate-api.open-meteo.com': 1, 'geocoding-api.open-meteo.com': 2, 'earthquake.usgs.gov': 2, 'eonet.gsfc.nasa.gov': 2, 'gibs.earthdata.nasa.gov': 3, 'tile.openstreetmap.org': 2, 'overpass-api.de': 1, 'overpass.kumi.systems': 1, 's3.amazonaws.com': 3, 'tiles.maps.eox.at': 3, 'ensemble-api.open-meteo.com': 2, self: 2 };
  var SELF = typeof location !== 'undefined' ? location.origin : '';
  var PATHS = { 's3.amazonaws.com': '/elevation-tiles-prod/' };   // only the open terrain-tile bucket, never other S3 buckets
  var DAY = 86400000;
  L.enabled = false;
  L.SOURCES = {
    meteo: { name: 'Open-Meteo forecast', attr: 'Weather data by Open-Meteo.com (CC BY 4.0)', licence: 'CC BY 4.0 · free for non-commercial use', url: 'https://open-meteo.com/en/terms' },
    flood: { name: 'Open-Meteo Flood (GloFAS-derived)', attr: 'River discharge: GloFAS model via Open-Meteo.com (model output, not gauge data)', licence: 'CC BY 4.0 · non-commercial', url: 'https://open-meteo.com/en/docs/flood-api' },
    archive: { name: 'ERA5 history via Open-Meteo', attr: 'Contains modified Copernicus Climate Change Service information; via Open-Meteo.com', licence: 'CC BY 4.0 · non-commercial', url: 'https://open-meteo.com/en/docs/historical-weather-api' },
    climate: { name: 'CMIP6 projection via Open-Meteo', attr: 'Climate projections: CMIP6 (MRI-AGCM3-2-S) via Open-Meteo.com', licence: 'CC BY 4.0 · non-commercial', url: 'https://open-meteo.com/en/docs/climate-api' },
    marine: { name: 'Open-Meteo Marine', attr: 'Marine data by Open-Meteo.com', licence: 'CC BY 4.0 · non-commercial', url: 'https://open-meteo.com/en/docs/marine-weather-api' },
    terrain: { name: 'Terrain tiles (SRTM / GMTED2010 / ETOPO1) via AWS', attr: 'Terrain data: SRTM and GMTED2010 courtesy of the U.S. Geological Survey; ETOPO1 U.S. NOAA; AWS Terrain Tiles (Tilezen)', licence: 'US-government public data · attribution required', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' },
    elev: { name: 'Elevation point lookup via Open-Meteo', attr: 'Elevation: Copernicus DEM GLO-90 via Open-Meteo.com', licence: 'CC BY 4.0 · non-commercial', url: 'https://open-meteo.com/en/docs/elevation-api' },
    geocode: { name: 'Open-Meteo Geocoding', attr: 'Geocoding: GeoNames via Open-Meteo.com', licence: 'CC BY 4.0', url: 'https://open-meteo.com/en/docs/geocoding-api' },
    usgs: { name: 'USGS earthquakes', attr: 'Earthquake data compiled by the U.S. Geological Survey', licence: 'US public domain · credit USGS', url: 'https://earthquake.usgs.gov/fdsnws/event/1/' },
    eonet: { name: 'NASA EONET natural events', attr: 'Event data: NASA EONET (events link third-party sources)', licence: 'NASA content · acknowledge NASA', url: 'https://eonet.gsfc.nasa.gov/docs/v3' },
    gibs: { name: 'NASA GIBS satellite imagery', attr: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).", licence: 'NASA data · acknowledge GIBS · no endorsement', url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance' },
    osm: { name: 'OpenStreetMap map tiles', attr: '© OpenStreetMap contributors', licence: 'Live viewing only; tile usage policy; no prefetch/offline', url: 'https://operations.osmfoundation.org/policies/tiles/' },
    overpass: { name: 'OpenStreetMap data (Overpass)', attr: '© OpenStreetMap contributors (ODbL)', licence: 'ODbL 1.0 · public instance for human-operated tools', url: 'https://wiki.openstreetmap.org/wiki/Overpass_API' },
    s2: { name: 'Sentinel-2 cloudless imagery (EOX)', attr: 'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)', licence: 'CC BY-NC-SA 4.0 · non-commercial · attribution', url: 'https://s2maps.eu/' },
    ensemble: { name: 'Open-Meteo Ensemble (GFS 31 members)', attr: 'Ensemble forecast: NOAA GEFS via Open-Meteo.com', licence: 'CC BY 4.0 · non-commercial', url: 'https://open-meteo.com/en/docs/ensemble-api' },
    tle: { name: 'CelesTrak orbital elements (via AEGIS relay, cached 3 h)', attr: 'Orbital elements: CelesTrak (T. S. Kelso), or SatNOGS DB (CC BY-SA 4.0) when CelesTrak is unavailable', licence: 'Public; cache and do not poll more than needed', url: 'https://celestrak.org/webmaster.php' }
  };
  L.status = {}; L.onStatus = null;
  function emit() { if (L.onStatus) try { L.onStatus(L.status); } catch (e) { /* UI listener must not break fetches */ } }
  function setS(id, state, note, ms) { var o = L.status[id] = L.status[id] || {}; o.state = state; o.note = note || ''; if (ms != null) o.ms = ms; if (state === 'ok' || state === 'cached') o.updated = Date.now(); emit(); }
  L.reset = function () { L.status = {}; emit(); };
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function host(u) { try { var x = new URL(u); if (SELF && x.origin === SELF) return x.pathname.indexOf('/api/alert-journey/') === 0 ? 'self' : null; return x.protocol === 'https:' ? x.hostname : null; } catch (e) { return null; } }
  L.log = []; L.onRequest = null;
  /* Privacy: every third-party request goes through the AEGIS relay, so sources never see the viewer's address. */
  L.relay = !!SELF;
  function via(url) { return L.relay && host(url) !== 'self' ? SELF + '/api/alert-journey/relay?u=' + encodeURIComponent(url) : url; }
  function logTx(src, url, ok, ms, what) { var h = host(url), e = { t: Date.now(), src: src, host: h === 'self' ? 'AEGIS server relay' : h, ok: ok, ms: ms || 0, what: what || '' }; L.log.push(e); if (L.log.length > 80) L.log.shift(); if (L.onRequest) try { L.onRequest(e); } catch (x) { /* listeners must not break fetches */ } }
  function allowed(u) { var h = host(u); if (!(h && ALLOW[h])) return false; var p = PATHS[h]; return !p || new URL(u).pathname.indexOf(p) === 0; }
  L.allowed = allowed;

  /* per-host concurrency */
  var slots = {};
  function acquire(h) { var s = slots[h] = slots[h] || { n: 0, q: [] }; return new Promise(function (res) { if (s.n < (ALLOW[h] || 1)) { s.n++; res(); } else s.q.push(res); }); }
  function release(h) { var s = slots[h]; if (s.q.length) s.q.shift()(); else s.n--; }

  /* caches: memory + localStorage (derived values only, kept small) */
  var mem = {}, PFX = 'aegis.live1:';
  function lsGet(k) { try { var s = localStorage.getItem(PFX + k); if (!s) return null; var o = JSON.parse(s); return { v: o.v, age: Date.now() - o.t }; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* quota or private mode: caching is optional */ } }
  L.clearCache = function () { mem = {}; try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(PFX) === 0) localStorage.removeItem(k); }); } catch (e) { /* ignore */ } };

  /* core request: allow-list, timeout, backoff on 429/5xx, stale-cache fallback, final-URL host check */
  async function req(src, url, o) {
    o = o || {};
    if (!L.enabled) throw new Error('Live data is off');
    if (!allowed(url)) throw new Error('Blocked: host not in the allow-list');
    var key = o.key || url, ttl = o.ttl == null ? 600000 : o.ttl, hit = mem[key];
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    if (o.persist) { var p = lsGet(key); if (p && p.age < ttl) { mem[key] = { t: Date.now() - p.age, v: p.v }; setS(src, 'cached', 'cached ' + Math.round(p.age / 60000) + ' min ago'); return p.v; } }
    setS(src, 'loading', o.label || 'loading…');
    var h = host(url), t0 = performance.now(), tries = o.retries == null ? 2 : o.retries, delay = 1500, lastErr, a;
    await acquire(h);
    try {
      for (a = 0; a <= tries; a++) {
        var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, o.timeout || 25000);
        try {
          var r = await fetch(via(url), { signal: ctl.signal, method: o.method || 'GET', body: o.body, headers: o.headers, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' });
          clearTimeout(to);
          if (r.url && !allowed(r.url)) throw new Error('Blocked: redirected outside the allow-list');
          if (!r.ok) { if ([429, 502, 503, 504].indexOf(r.status) > -1 && a < tries) { await sleep(delay); delay *= 2; continue; } throw new Error('HTTP ' + r.status); }
          var v = o.type === 'text' ? await r.text() : await r.json();
          if (o.derive) v = o.derive(v);
          mem[key] = { t: Date.now(), v: v }; if (o.persist) lsSet(key, v);
          setS(src, 'ok', o.note ? o.note(v) : '', Math.round(performance.now() - t0)); logTx(src, url, true, Math.round(performance.now() - t0), o.label || '');
          return v;
        } catch (e) { clearTimeout(to); lastErr = e; if (a < tries && (e.name === 'AbortError' || /network|fetch|Failed/i.test(String(e.message)))) { await sleep(delay); delay *= 2; continue; } break; }
      }
    } finally { release(h); }
    var stale = o.persist ? lsGet(key) : null;
    if (stale) { setS(src, 'cached', 'stale cache (' + Math.round(stale.age / 3600000) + ' h old) — live call failed'); return stale.v; }
    setS(src, 'error', String(lastErr && lastErr.message || lastErr).slice(0, 120)); logTx(src, url, false, 0, o.label || '');
    throw lastErr;
  }
  L.req = req;
  function n4(x) { return Number(x).toFixed(4); }
  function days(v, k) { return (v || []).map(function (x, i) { return { d: v[i], i: i }; }); }

  /* ---------------- geocoding ---------------- */
  L.geocode = async function (q) {
    var j = await req('geocode', 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=6&language=en&format=json', { ttl: 7 * DAY, persist: true, note: function (v) { return (v.results || []).length + ' matches'; } });
    return (j.results || []).map(function (r) { return { name: r.name, admin: r.admin1 || '', country: r.country || '', cc: r.country_code, lat: r.latitude, lon: r.longitude, elev: r.elevation, tz: r.timezone, pop: r.population || 0 }; });
  };

  /* ---------------- weather ---------------- */
  L.forecast = async function (lat, lon) {
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + n4(lat) + '&longitude=' + n4(lon) + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day' +
      '&hourly=temperature_2m,precipitation,rain,snowfall,snow_depth,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cape,precipitation_probability&daily=precipitation_sum,snowfall_sum,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min' +
      '&timezone=auto&timeformat=unixtime&past_days=2&forecast_days=7&wind_speed_unit=kmh';
    var j = await req('meteo', u, { ttl: 20 * 60000, note: function (v) { return 'hourly to +' + Math.round((v.hourly.time[v.hourly.time.length - 1] * 1000 - Date.now()) / 3600000) + ' h'; } });
    var h = j.hourly, hours = h.time.map(function (t, i) {
      return { t: t * 1000, temp: h.temperature_2m[i], precip: h.precipitation[i], rain: h.rain[i], snowfall: h.snowfall[i], snowDepth: h.snow_depth[i], code: h.weather_code[i], cloud: h.cloud_cover[i], vis: h.visibility[i], wind: h.wind_speed_10m[i], windDir: h.wind_direction_10m[i], gust: h.wind_gusts_10m[i], cape: h.cape[i], pop: h.precipitation_probability[i] };
    });
    var d = j.daily, dly = d.time.map(function (t, i) { return { t: t * 1000, rain: d.precipitation_sum[i], snow: d.snowfall_sum[i], gust: d.wind_gusts_10m_max[i], tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i] }; });
    var c = j.current;
    return { lat: j.latitude, lon: j.longitude, elev: j.elevation, tz: j.timezone, utcOffset: j.utc_offset_seconds * 1000, hours: hours, days: dly, current: { t: c.time * 1000, temp: c.temperature_2m, feels: c.apparent_temperature, rh: c.relative_humidity_2m, precip: c.precipitation, snowfall: c.snowfall, code: c.weather_code, cloud: c.cloud_cover, pressure: c.pressure_msl, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m, isDay: c.is_day } };
  };

  /* ---------------- river discharge (GloFAS-derived) with a Gumbel fit to annual maxima ---------------- */
  L.flood = async function (lat, lon) {
    var near = await req('flood', 'https://flood-api.open-meteo.com/v1/flood?latitude=' + n4(lat) + '&longitude=' + n4(lon) + '&daily=river_discharge&past_days=30&forecast_days=30&timeformat=unixtime', { ttl: 3 * 3600000, note: function (v) { return 'grid ' + n4(v.latitude) + ',' + n4(v.longitude); } });
    var q = (near.daily && near.daily.river_discharge) || [], t = (near.daily && near.daily.time) || [];
    if (!q.length || q.every(function (x) { return x == null; })) return { days: [], fit: null, abstain: 'no river cell at this location', grid: [near.latitude, near.longitude] };
    var days = t.map(function (tt, i) { return { t: tt * 1000, q: q[i] }; }).filter(function (x) { return x.q != null; });
    var hist = await req('flood', 'https://flood-api.open-meteo.com/v1/flood?latitude=' + n4(lat) + '&longitude=' + n4(lon) + '&daily=river_discharge&start_date=2010-01-01&end_date=2024-12-31', {
      key: 'floodhist:' + n4(lat) + ',' + n4(lon), ttl: 14 * DAY, persist: true, label: 'fetching 15-year discharge history…',
      derive: function (v) { var dd = v.daily.time, qq = v.daily.river_discharge, by = M.annual(dd, { q: qq }), yrs = Object.keys(by).map(Number).sort(), mx = yrs.map(function (y) { return by[y].q ? Math.max.apply(null, by[y].q) : null; }); return { years: yrs, max: mx }; }
    });
    var clean = hist.max.filter(function (x) { return x != null; }), fit = M.gumbelFit(clean), nowMs = Date.now();
    var fut = days.filter(function (x) { return x.t >= nowMs - DAY; }), fmax = fut.length ? Math.max.apply(null, fut.map(function (x) { return x.q; })) : null;
    return { days: days, hist: hist, fit: fit, forecastMax: fmax, grid: [near.latitude, near.longitude], q2: fit ? M.gumbelQ(fit, 2) : null, q5: fit ? M.gumbelQ(fit, 5) : null, q20: fit ? M.gumbelQ(fit, 20) : null };
  };

  /* ---------------- rainfall / gust / heat statistics from ERA5 (annual maxima + trends) ---------------- */
  L.archive = async function (lat, lon) {
    return req('archive', 'https://archive-api.open-meteo.com/v1/archive?latitude=' + n4(lat) + '&longitude=' + n4(lon) + '&start_date=1991-01-01&end_date=2024-12-31&daily=precipitation_sum,temperature_2m_max,wind_gusts_10m_max&timezone=auto', {
      key: 'archive:' + n4(lat) + ',' + n4(lon), ttl: 30 * DAY, persist: true, label: 'fetching 34 years of ERA5…',
      derive: function (v) {
        var dd = v.daily.time, p = v.daily.precipitation_sum, tx = v.daily.temperature_2m_max, gu = v.daily.wind_gusts_10m_max, i;
        var p3 = []; for (i = 0; i < p.length; i++) p3.push((p[i] || 0) + (p[i - 1] || 0) + (p[i - 2] || 0));
        var by = M.annual(dd, { p: p, p3: p3, tx: tx, gu: gu }), yrs = Object.keys(by).map(Number).sort(), out = { years: [], maxP1: [], maxP3: [], maxGust: [], tmaxMean: [], hot40: [], p50: [], total: [], tmax: tx.filter(function (x) { return x != null; }) };
        yrs.forEach(function (y) { var o = by[y]; if (!o.p || o.n < 300) return; out.years.push(y); out.maxP1.push(Math.max.apply(null, o.p)); out.maxP3.push(Math.max.apply(null, o.p3 || [0])); out.maxGust.push(o.gu ? Math.max.apply(null, o.gu) : null); out.tmaxMean.push(o.tx ? M.mean(o.tx) : null); out.hot40.push(o.tx ? o.tx.filter(function (x) { return x >= 40; }).length : 0); out.p50.push(o.p.filter(function (x) { return x >= 50; }).length); out.total.push(o.p.reduce(function (a, b) { return a + b; }, 0)); });
        out.tmaxP99 = M.percentile(out.tmax, 99); out.tmax = null; return out;
      }, note: function (v) { return v.years.length + ' years'; }
    });
  };
  L.climate = async function (lat, lon) {
    return req('climate', 'https://climate-api.open-meteo.com/v1/climate?latitude=' + n4(lat) + '&longitude=' + n4(lon) + '&start_date=1985-01-01&end_date=2050-12-31&models=MRI_AGCM3_2_S&daily=temperature_2m_mean,precipitation_sum', {
      key: 'climate:' + n4(lat) + ',' + n4(lon), ttl: 30 * DAY, persist: true, label: 'fetching CMIP6 projection…', timeout: 40000,
      derive: function (v) { var dd = v.daily.time, t = v.daily.temperature_2m_mean, p = v.daily.precipitation_sum, by = M.annual(dd, { t: t, p: p }), yrs = Object.keys(by).map(Number).sort(), o = { years: [], tmean: [], precip: [] }; yrs.forEach(function (y) { if (by[y].n < 300) return; o.years.push(y); o.tmean.push(by[y].t ? M.mean(by[y].t) : null); o.precip.push(by[y].p ? by[y].p.reduce(function (a, b) { return a + b; }, 0) : null); }); return o; },
      note: function (v) { return v.years.length + ' years, single model'; }
    });
  };
  L.marine = async function (lat, lon) {
    var j = await req('marine', 'https://marine-api.open-meteo.com/v1/marine?latitude=' + n4(lat) + '&longitude=' + n4(lon) + '&hourly=wave_height,wave_period,sea_level_height_msl&past_days=1&forecast_days=3&timeformat=unixtime', { ttl: 3600000, retries: 1 });
    var h = j.hourly; if (!h || !h.wave_height || h.wave_height.every(function (x) { return x == null; })) return null;
    return h.time.map(function (t, i) { return { t: t * 1000, wave: h.wave_height[i], period: h.wave_period[i], sea: h.sea_level_height_msl[i] }; });
  };

  /* ---------------- terrain: AWS Terrain Tiles (Terrarium PNG) sampled onto an n x n grid (row 0 = north) ---------------- */
  function terrUrl(z, x, y) { return 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + z + '/' + x + '/' + y + '.png'; }
  L.elevationGrid = async function (lat, lon, spanKm, n, onProgress) {
    var bb = M.bbox(lat, lon, spanKm), z = spanKm > 50 ? 9 : 13, key = 'dem2:' + n4(lat) + ',' + n4(lon) + ',' + spanKm + ',' + n, i, j;
    function pack(arr) { var f = new Float32Array(arr.length), mn = Infinity, mx = -Infinity; arr.forEach(function (e, q) { f[q] = e; if (e < mn) mn = e; if (e > mx) mx = e; }); return { n: n, bb: bb, elev: f, min: mn, max: mx, spanKm: spanKm, zoom: z }; }
    var cached = lsGet(key); if (cached && cached.v && cached.v.length === n * n) { setS('terrain', 'cached', n + '×' + n + ' grid from cache'); return pack(cached.v); }
    var tx0 = Math.floor(M.tileX(bb.lonMin, z)), tx1 = Math.floor(M.tileX(bb.lonMax, z)), ty0 = Math.floor(M.tileY(bb.latMax, z)), ty1 = Math.floor(M.tileY(bb.latMin, z)), tiles = {}, jobs = [], done = 0, total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
    for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) (function (X, Y) {
      jobs.push(L.loadImage('terrain', terrUrl(z, X, Y), 'terrain tiles').then(function (im) {
        var c = document.createElement('canvas'); c.width = c.height = 256; var x2 = c.getContext('2d'); x2.drawImage(im, 0, 0); var d = x2.getImageData(0, 0, 256, 256).data, e = new Float32Array(65536);
        for (var q = 0; q < 65536; q++) e[q] = d[q * 4] * 256 + d[q * 4 + 1] + d[q * 4 + 2] / 256 - 32768;
        tiles[X + ',' + Y] = e; done++; if (onProgress) onProgress(done / total);
      }));
    })(tx, ty);
    await Promise.all(jobs);
    function px(gx, gy) {
      var X = Math.floor(gx / 256), Y = Math.floor(gy / 256), t = tiles[X + ',' + Y];
      if (!t) { X = Math.min(tx1, Math.max(tx0, X)); Y = Math.min(ty1, Math.max(ty0, Y)); t = tiles[X + ',' + Y]; if (!t) return 0; gx = Math.max(X * 256, Math.min(X * 256 + 255, gx)); gy = Math.max(Y * 256, Math.min(Y * 256 + 255, gy)); }
      return t[(Math.floor(gy) - Y * 256) * 256 + (Math.floor(gx) - X * 256)];
    }
    function samp(la, lo) { var gx = M.tileX(lo, z) * 256 - 0.5, gy = M.tileY(la, z) * 256 - 0.5, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; return (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy) + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy; }
    var out = new Array(n * n);
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) { var la = bb.latMax - (bb.latMax - bb.latMin) * j / (n - 1), lo = bb.lonMin + (bb.lonMax - bb.lonMin) * i / (n - 1); out[j * n + i] = Math.max(0, Math.round(samp(la, lo) * 10) / 10); }
    lsSet(key, out); setS('terrain', 'ok', n + '×' + n + ' grid from ' + total + ' tiles (z' + z + ')'); return pack(out);
  };

  /* ---------------- incidents ---------------- */
  function quakeRow(f) { var p = f.properties, c = f.geometry.coordinates; return { id: f.id, mag: p.mag, place: p.place, t: p.time, lat: c[1], lon: c[0], depth: c[2], tsunami: p.tsunami, sig: p.sig, url: p.url, alert: p.alert, felt: p.felt, mmi: p.mmi, cdi: p.cdi, title: p.title }; }
  L.quakes = async function (feed) {
    var j = await req('usgs', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/' + (feed || '4.5_week') + '.geojson', { ttl: 5 * 60000, note: function (v) { return v.features.length + ' events'; } });
    return j.features.map(quakeRow).filter(function (q) { return q.mag != null; }).sort(function (a, b) { return b.t - a.t; });
  };
  L.quakeById = async function (id) { var j = await req('usgs', 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=' + encodeURIComponent(id) + '&format=geojson', { ttl: 30 * DAY, persist: true, retries: 1 }); return quakeRow({ id: j.id, properties: j.properties, geometry: j.geometry }); };
  var CAT = { severeStorms: 'storm', floods: 'flood', snow: 'snow', wildfires: 'fire', volcanoes: 'volcano', tempExtremes: 'heat', dustHaze: 'dust', drought: 'drought', landslides: 'landslide', seaLakeIce: 'ice', earthquakes: 'quake', waterColor: 'water', manmade: 'manmade' };
  L.events = async function () {
    var j = await req('eonet', 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=150&days=45', { ttl: 15 * 60000, note: function (v) { return v.events.length + ' open events'; } });
    return j.events.map(function (e) {
      var geo = (e.geometry || []).map(function (g2) { var c = g2.coordinates; if (g2.type === 'Polygon') { var ring = c[0], sx = 0, sy = 0; ring.forEach(function (p) { sx += p[0]; sy += p[1]; }); c = [sx / ring.length, sy / ring.length]; } return { t: Date.parse(g2.date), lon: c[0], lat: c[1], mag: g2.magnitudeValue, unit: g2.magnitudeUnit }; }).filter(function (p) { return isFinite(p.lat) && isFinite(p.lon); });
      var cat = (e.categories && e.categories[0]) || {}; return { id: e.id, title: e.title, cat: CAT[cat.id] || 'other', catTitle: cat.title || 'Event', link: e.link, src: (e.sources || []).map(function (s) { return { id: s.id, url: s.url }; }), geo: geo, last: geo[geo.length - 1] };
    }).filter(function (e) { return e.last; });
  };

  /* ---------------- satellites (TLE) ---------------- */
  var TLE_Q = { weather: 'GROUP=weather', resource: 'GROUP=resource', noaa: 'GROUP=noaa', navic: 'NAME=IRNSS', insat: 'NAME=INSAT', cartosat: 'NAME=CARTOSAT', sentinel: 'NAME=SENTINEL' };
  L.tles = async function (group) {
    if (!TLE_Q[group]) throw new Error('Unknown satellite group');
    var txt = await req('tle', SELF + '/api/alert-journey/tle?group=' + group, { type: 'text', ttl: 6 * 3600000, persist: true, retries: 1, key: 'tle:' + group, note: function (v) { return Math.floor(v.trim().split(/\r?\n/).length / 3) + ' objects (' + group + ')'; } });
    var ln = txt.split(/\r?\n/).map(function (s) { return s.trimEnd(); }).filter(Boolean), out = [], i;
    for (i = 0; i + 2 < ln.length; i += 3) if (ln[i + 1][0] === '1' && ln[i + 2][0] === '2') out.push({ name: ln[i].trim(), l1: ln[i + 1], l2: ln[i + 2], group: group });
    return out;
  };

  /* ---------------- imagery URLs (images are loaded by the caller; status tracked here) ---------------- */
  L.s2Url = function (z, x, y) { return 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/' + z + '/' + y + '/' + x + '.jpg'; };
  /* 31-member ensemble → per-day percentiles and the share of members reaching IMD heavy-rain classes */
  L.ensemble = async function (lat, lon) {
    return req('ensemble', 'https://ensemble-api.open-meteo.com/v1/ensemble?latitude=' + n4(lat) + '&longitude=' + n4(lon) + '&hourly=precipitation,wind_gusts_10m&models=gfs025&forecast_days=7&timeformat=unixtime&timezone=auto', {
      ttl: 3 * 3600000, label: 'ensemble forecast', note: function (v) { return v.members + ' members'; },
      derive: function (v) {
        var h = v.hourly, T = h.time, off = v.utc_offset_seconds || 0, pk = Object.keys(h).filter(function (k) { return /^precipitation(_member\d+)?$/.test(k); }), gk = Object.keys(h).filter(function (k) { return /^wind_gusts_10m(_member\d+)?$/.test(k); }), byDay = {}, order = [];
        T.forEach(function (t, i) { var d = Math.floor((t + off) / 86400); if (!byDay[d]) { byDay[d] = { n: 0, p: pk.map(function () { return 0; }), g: gk.map(function () { return 0; }) }; order.push(d); } var o = byDay[d]; o.n++; pk.forEach(function (k, m) { o.p[m] += h[k][i] || 0; }); gk.forEach(function (k, m) { o.g[m] = Math.max(o.g[m], h[k][i] || 0); }); });
        var days = order.filter(function (d) { return byDay[d].n >= 20; }).map(function (d) { var o = byDay[d], n = o.p.length || 1; return { t: d * 86400000, p10: M.percentile(o.p, 10), p50: M.percentile(o.p, 50), p90: M.percentile(o.p, 90), pmax: Math.max.apply(null, o.p), probHeavy: o.p.filter(function (x) { return x >= 64.5; }).length / n, probVery: o.p.filter(function (x) { return x >= 115.6; }).length / n, g50: M.percentile(o.g, 50), g90: M.percentile(o.g, 90) }; });
        return { members: pk.length, days: days };
      }
    });
  };
  L.gibsUrl = function (o) {
    var bb = o.bbox || [-90, -180, 90, 180];
    var u = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=' + o.layer + '&STYLES=&FORMAT=' + (o.fmt || 'image/jpeg') + (o.transparent ? '&TRANSPARENT=TRUE' : '') + '&CRS=EPSG:4326&BBOX=' + bb.join(',') + '&WIDTH=' + o.w + '&HEIGHT=' + o.h + (o.time ? '&TIME=' + o.time : '');
    return u;
  };
  L.osmUrl = function (z, x, y) { return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png'; };
  L.loadImage = function (src, url, label) {
    if (!L.enabled) return Promise.reject(new Error('Live data is off'));
    if (!allowed(url)) return Promise.reject(new Error('Blocked: host not in the allow-list'));
    var h = host(url), t0 = performance.now(), cnt = (L.status[src] && L.status[src].count) || 0;
    setS(src, 'loading', label || 'image…');
    return acquire(h).then(function () {
      return new Promise(function (res, rej) {
        var im = new Image(); im.crossOrigin = 'anonymous'; var to = setTimeout(function () { im.src = ''; rej(new Error('timeout')); }, 60000);
        im.onload = function () { clearTimeout(to); res(im); }; im.onerror = function () { clearTimeout(to); rej(new Error('image failed')); }; im.referrerPolicy = 'strict-origin-when-cross-origin'; im.src = via(url);
      });
    }).then(function (im) { release(h); logTx(src, url, true, Math.round(performance.now() - t0), label || 'image'); L.status[src].count = cnt + 1; setS(src, 'ok', (label || 'image') + ' · ' + (cnt + 1) + ' loaded', Math.round(performance.now() - t0)); return im; }, function (e) { release(h); logTx(src, url, false, 0, label || 'image'); setS(src, 'error', (label || 'image') + ': ' + e.message); throw e; });
  };

  /* ---------------- OSM data via Overpass (optional, user-triggered, human-operated use) ---------------- */
  var OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  L.overpass = async function (query, label) {
    var lastErr;
    for (var k = 0; k < OVP.length; k++) {
      try { return await req('overpass', OVP[k], { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, key: 'ovp:' + query, ttl: 3600000, retries: 2, timeout: 45000, label: label || 'querying OpenStreetMap…', note: function (v) { return v.elements.length + ' elements'; } }); }
      catch (e) { lastErr = e; }
    }
    throw lastErr;
  };

  L.enable = function () { L.enabled = true; }; L.disable = function () { L.enabled = false; };
}
