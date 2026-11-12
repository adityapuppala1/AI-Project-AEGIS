// Alert Journey: screening maths, the client host allow-list, the orbit relay and the Content-Security-Policy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Engine modules are ES-module installers: `export default function install(g) { ... }`.
function installEngine(names, g = {}) {
  for (const name of names) {
    const source = read('components/alert-journey/engine/' + name).replace('export default function install(g) {', 'module.exports = function install(g) {');
    const mod = { exports: null };
    new Function('module', source)(mod);
    mod.exports(g);
  }
  return g.AX;
}
function loadTs(file, requireMap = {}) {
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => requireMap[name] ?? require(name), mod, mod.exports, { env: { NODE_ENV: 'production' } });
  return mod.exports;
}

const AX = installEngine(['explainer-core.js', 'live-model.js', 'live-data.js'], { AX: { alive: true } });
const M = AX.model, L = AX.live;

test('Gumbel fit recovers known parameters and abstains on short records', () => {
  const rng = AX.core.rng(42), sample = [];
  for (let i = 0; i < 4000; i++) sample.push(50 - 20 * Math.log(-Math.log(rng())));
  const fit = M.gumbelFit(sample);
  assert.ok(Math.abs(fit.mu - 50) < 2 && Math.abs(fit.beta - 20) < 1.2, JSON.stringify(fit));
  assert.ok(Math.abs(M.gumbelRP(fit, M.gumbelQ(fit, 20)) - 20) < 0.01);
  assert.equal(M.gumbelFit([1, 2, 3]), null, 'fewer than 8 annual maxima must not produce a return period');
});

test('rain and wind classes follow the fixed IMD and Beaufort thresholds', () => {
  assert.equal(M.rainClass(64.4).label, 'Moderate');
  assert.equal(M.rainClass(64.5).label, 'Heavy');
  assert.equal(M.rainClass(115.6).label, 'Very heavy');
  assert.equal(M.rainClass(204.5).level, 4);
  assert.equal(M.beaufort(95).force, 10);
  assert.equal(M.beaufort(120).level, 4);
});

test('hazard board flags heavy rain, explains itself and abstains on river flood without history', () => {
  const t0 = Date.parse('2026-11-10T00:00:00Z'), hours = [];
  for (let i = 0; i < 96; i++) hours.push({ t: t0 + i * 3600000, precip: i >= 6 && i < 18 ? 10 : 0, snowfall: 0, temp: 28, gust: 30, vis: 20000, code: 3, snowDepth: 0 });
  const board = M.hazardBoard({ hours, t0, stats: {}, flood: { fit: null } });
  const by = Object.fromEntries(board.rows.map(row => [row.id, row]));
  assert.ok(by.rain.level >= 3, by.rain.value);
  assert.equal(by.flood.abstain, true);
  for (const row of board.rows) assert.ok(row.why && row.why.length > 10, 'every row states how it was computed: ' + row.id);
  assert.equal(board.label, M.LEVELS[board.level]);
});

test('height above nearest drainage is zero in the channel and rises on the valley side', () => {
  const n = 25, elevation = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) elevation[y * n + x] = 5 + Math.abs(x - 12) * 0.8 + (n - 1 - y) * 0.15;
  const result = M.hand(elevation, n, { threshold: 80 });
  assert.ok(result.hand[10 * n + 12] < 0.3);
  assert.ok(result.hand[10 * n + 20] > 4);
});

test('client allow-list accepts only the reviewed HTTPS hosts and the one S3 bucket path', () => {
  for (const url of ['https://api.open-meteo.com/v1/forecast', 'https://gibs.earthdata.nasa.gov/wms/x', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/9/1/1.png', 'https://tiles.maps.eox.at/wmts/x.jpg'])
    assert.equal(L.allowed(url), true, url);
  for (const url of ['http://api.open-meteo.com/v1/forecast', 'https://example.com/', 'https://s3.amazonaws.com/another-bucket/x.png', 'https://api.open-meteo.com.evil.test/x', 'javascript:alert(1)', 'https://celestrak.org/NORAD/elements/gp.php', ''])
    assert.equal(L.allowed(url), false, url);
});

test('no request leaves the page while live data is off', async () => {
  const before = global.fetch; let calls = 0;
  global.fetch = async () => { calls += 1; return new Response('{}'); };
  try {
    L.disable();
    await assert.rejects(L.req('meteo', 'https://api.open-meteo.com/v1/forecast'), /Live data is off/);
    await assert.rejects(L.loadImage('gibs', 'https://gibs.earthdata.nasa.gov/x'), /Live data is off/);
    assert.equal(calls, 0);
  } finally { global.fetch = before; }
});

test('page policy: scripts need the per-request nonce and the browser may contact this site only', async () => {
  const { buildCsp } = loadTs('lib/csp.ts');
  const csp = buildCsp('TESTNONCE');
  const directive = name => csp.split(';').map(part => part.trim()).find(part => part.startsWith(name + ' '));
  assert.equal(directive('script-src'), "script-src 'self' 'nonce-TESTNONCE' 'strict-dynamic'");
  assert.ok(!directive('script-src').includes("'unsafe-inline'") && !csp.includes("'unsafe-eval'"), 'no inline or eval scripts in production');
  assert.equal(directive('connect-src'), "connect-src 'self'");
  assert.equal(directive('img-src'), "img-src 'self' data: blob:");
  for (const fixed of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(csp.includes(fixed), fixed);
  assert.ok(!/https?:\/\//.test(csp), 'no third-party origin anywhere in the page policy');
  assert.ok(buildCsp('N', true).includes("'unsafe-eval'"), 'development build may use eval for fast refresh only');
  assert.notEqual(buildCsp('A'), buildCsp('B'));
  const middleware = read('middleware.ts');
  assert.ok(/crypto\.randomUUID\(\)/.test(middleware) && middleware.includes('x-nonce'), 'a fresh nonce per request');
  const headers = (await loadTs('next.config.ts').default.headers());
  assert.ok(headers[0].headers.some(header => header.key === 'Strict-Transport-Security'));
  assert.ok(headers.some(block => block.source === '/api/:path*' && block.headers[0].value.startsWith("default-src 'none'")));
});

test('every host the client may request is one the server relay knows, and nothing else', () => {
  const allowBlock = read('components/alert-journey/engine/live-data.js').match(/var ALLOW = \{([^}]+)\}/)[1];
  const clientHosts = [...allowBlock.matchAll(/'([a-z0-9.-]+\.[a-z]+)'\s*:/g)].map(match => match[1]).sort();
  const relay = read('app/api/alert-journey/relay/route.ts');
  const relayHosts = [...relay.slice(relay.indexOf('const RULES'), relay.indexOf('const MAX_URL')).matchAll(/"([a-z0-9.-]+\.[a-z]+)":/g)].map(match => match[1]).sort();
  assert.ok(clientHosts.length >= 10, 'parsed ' + clientHosts.length + ' hosts');
  assert.deepEqual(clientHosts, relayHosts);
});

test('maps on every page load their tiles through the relay', () => {
  for (const file of ['components/geo-map.tsx', 'components/hazard-watch-map.tsx', 'components/earth-watch.tsx']) assert.ok(read(file).includes('transformRequest: relayTileRequest'), file);
  const { relayTileRequest } = loadTs('lib/tile-relay.ts');
  assert.deepEqual(relayTileRequest('https://tile.openstreetmap.org/1/1/1.png'), { url: 'https://tile.openstreetmap.org/1/1/1.png' }, 'unchanged outside a browser');
});

test('sign-in page never collects a password and only starts the provider flow', () => {
  const page = read('components/sign-in-experience.tsx');
  assert.ok(!/<input|type="password"|<form/i.test(page), 'no credential fields in AEGIS');
  assert.ok(page.includes('"/api/auth/login"') && page.includes('href={loginHref}'), 'the only action is a link to the sign-in endpoint');
  const callback = read('app/api/auth/callback/route.ts');
  assert.ok(callback.includes('"/sign-in?error=verify"') && !/searchParams\.get\("(returnTo|next|redirect)"\)/.test(callback), 'fixed redirect targets only');
  assert.ok(read('app/api/auth/login/route.ts').includes('code_challenge_method", "S256"'));
});

const TLE = 'NOAA 19\n1 33591U 09005A   26313.50000000  .00000100  00000+0  80000-4 0  9990\n2 33591  99.1000 300.0000 0013000  90.0000 270.0000 14.12000000900000\n';
async function relay(group, { enabled = true, upstream = TLE, upstreamStatus = 200 } = {}, route = loadTs('app/api/alert-journey/tle/route.ts', { 'next/server': { NextResponse } })) {
  const before = global.fetch, calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/earth-watch/status')) return new Response(JSON.stringify({ classification: 'public_reference', enabled, display_only: true }), { status: 200 });
    return new Response(upstream, { status: upstreamStatus });
  };
  try { return { response: await route.GET(new Request('http://localhost:3000/api/alert-journey/tle?group=' + group)), calls, route }; }
  finally { global.fetch = before; }
}

test('orbit relay: unknown groups are refused without any upstream call', async () => {
  for (const group of ['', 'stations', '__proto__', 'weather&x=1', '../weather']) {
    const { response, calls } = await relay(encodeURIComponent(group));
    assert.equal(response.status, 404, group);
    assert.equal(calls.length, 0);
  }
});

test('orbit relay: stays closed while the public-feeds switch is off', async () => {
  const { response, calls } = await relay('weather', { enabled: false });
  assert.equal(response.status, 503);
  assert.ok(calls.every(call => !call.url.includes('celestrak')), 'must not contact CelesTrak when disabled');
});

test('orbit relay: fetches once, forbids redirects, then serves the shared cache', async () => {
  const first = await relay('weather');
  assert.equal(first.response.status, 200);
  assert.equal(await first.response.text(), TLE);
  const upstream = first.calls.find(call => call.url.includes('celestrak.org'));
  assert.ok(upstream.url.startsWith('https://celestrak.org/NORAD/elements/gp.php?GROUP=weather'));
  assert.equal(upstream.options.redirect, 'error');
  const second = await relay('weather', {}, first.route);
  assert.equal(second.response.headers.get('X-Aegis-Relay'), 'cached');
  assert.ok(second.calls.every(call => !call.url.includes('celestrak')), 'second request must be served from cache');
});

test('orbit relay: rejects unexpected upstream content and backs off instead of retrying', async () => {
  const bad = await relay('noaa', { upstream: '<html>blocked</html>' });
  assert.equal(bad.response.status, 502);
  const again = await relay('noaa', {}, bad.route);
  assert.equal(again.response.status, 502);
  assert.ok(again.calls.every(call => !call.url.includes('celestrak')), 'no immediate retry after a failure');
  const denied = await relay('insat', { upstreamStatus: 403 });
  assert.equal(denied.response.status, 502);
});

// ---- general relay: the browser talks only to AEGIS; AEGIS fetches the reviewed source ----
const enc = encodeURIComponent;
async function relayAny(target, { method = 'GET', body, enabled = true, upstreamBody = '{"ok":true}', type = 'application/json', status = 200, route, headers = { origin: 'http://localhost:3000' } } = {}) {
  route = route ?? loadTs('app/api/alert-journey/relay/route.ts', { 'next/server': { NextResponse } });
  const before = global.fetch, calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/earth-watch/status')) return new Response(JSON.stringify({ enabled, display_only: true }), { status: 200 });
    return new Response(upstreamBody, { status, headers: { 'content-type': type } });
  };
  try {
    const request = new Request('http://localhost:3000/api/alert-journey/relay?u=' + enc(target), { method, body, headers });
    return { response: await (method === 'POST' ? route.POST(request) : route.GET(request)), calls, route, upstream: calls.filter(call => !call.url.includes('/earth-watch/status')) };
  } finally { global.fetch = before; }
}

test('relay is not an open proxy: anything off the reviewed list is refused before any network call', async () => {
  const refused = ['http://api.open-meteo.com/v1/forecast', 'https://example.com/', 'https://api.open-meteo.com.evil.test/', 'https://user:pw@api.open-meteo.com/v1/forecast',
    'https://api.open-meteo.com:8443/v1/forecast', 'https://s3.amazonaws.com/another-bucket/x.png', 'https://gibs.earthdata.nasa.gov/other/x', 'https://169.254.169.254/latest/meta-data',
    'https://localhost/x', 'file:///etc/passwd', 'https://s3.amazonaws.com/elevation-tiles-prod/../secret', 'https://celestrak.org/NORAD/elements/gp.php', ''];
  for (const target of refused) {
    const { response, calls } = await relayAny(target);
    assert.equal(response.status, 404, target);
    assert.equal(calls.length, 0, 'no call for ' + target);
  }
  const post = await relayAny('https://api.open-meteo.com/v1/forecast', { method: 'POST', body: 'data=x' });
  assert.equal(post.response.status, 404, 'POST only to the map-data service');
});

test('relay stays closed while the public-feeds switch is off', async () => {
  const { response, upstream } = await relayAny('https://api.open-meteo.com/v1/forecast?latitude=17', { enabled: false });
  assert.equal(response.status, 503);
  assert.equal(upstream.length, 0);
});

test('relay fetches a reviewed source without redirects or viewer headers, then serves the shared cache', async () => {
  const target = 'https://api.open-meteo.com/v1/forecast?latitude=17.385&longitude=78.4867';
  const first = await relayAny(target);
  assert.equal(first.response.status, 200);
  assert.equal(await first.response.text(), '{"ok":true}');
  assert.equal(first.upstream.length, 1);
  assert.equal(first.upstream[0].url, target);
  assert.equal(first.upstream[0].options.redirect, 'error');
  const sent = Object.keys(first.upstream[0].options.headers).map(key => key.toLowerCase());
  for (const forbidden of ['cookie', 'authorization', 'x-forwarded-for', 'referer']) assert.ok(!sent.includes(forbidden), forbidden + ' must not be forwarded');
  const second = await relayAny(target, { route: first.route });
  assert.equal(second.response.headers.get('X-Aegis-Relay'), 'cached');
  assert.equal(second.upstream.length, 0);
});

test('relay rejects unexpected content types and oversized or malformed map queries', async () => {
  const html = await relayAny('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', { upstreamBody: '<html>', type: 'text/html' });
  assert.equal(html.response.status, 502);
  const script = await relayAny('https://tile.openstreetmap.org/15/1/1.png', { upstreamBody: 'alert(1)', type: 'application/javascript' });
  assert.equal(script.response.status, 502);
  const noData = await relayAny('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'query=x' });
  assert.equal(noData.response.status, 400);
  const tooBig = await relayAny('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + 'x'.repeat(9000) });
  assert.equal(tooBig.response.status, 413);
  assert.equal(tooBig.upstream.length, 0, 'an oversized query is never forwarded');
  const busy = await relayAny('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=[out:json];node(1);out;', status: 502 });
  assert.equal(busy.response.status, 502);
});

test('relay cannot be driven from another website, and tile addresses cannot be varied to dodge the cache', async () => {
  const tile = 'https://tile.openstreetmap.org/15/1/1.png';
  const crossSite = await relayAny(tile, { headers: { 'sec-fetch-site': 'cross-site' }, upstreamBody: 'x', type: 'image/png' });
  assert.equal(crossSite.response.status, 403); assert.equal(crossSite.upstream.length, 0);
  const otherOrigin = await relayAny(tile, { headers: { origin: 'https://evil.test' }, upstreamBody: 'x', type: 'image/png' });
  assert.equal(otherOrigin.response.status, 403);
  const blindPost = await relayAny('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=[out:json];node(1);out;', headers: {} });
  assert.equal(blindPost.response.status, 403, 'a POST must say which site it came from');
  const sameSite = await relayAny(tile, { headers: { 'sec-fetch-site': 'same-origin' }, upstreamBody: 'x', type: 'image/png' });
  assert.equal(sameSite.response.status, 200);
  for (const bad of [tile + '?cachebust=1', 'https://tile.openstreetmap.org/15/1/1.png/extra', 'https://tile.openstreetmap.org/a/b/c.png',
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/9/1/1.png?x=1', 'https://s3.amazonaws.com/elevation-tiles-prod/other/9/1/1.png', 'https://tiles.maps.eox.at/wmts/1.0.0/x/1/1/1.jpg?x=1']) {
    const { response, calls } = await relayAny(bad, { upstreamBody: 'x', type: 'image/png' });
    assert.equal(response.status, 404, bad); assert.equal(calls.length, 0, bad);
  }
  const lookalike = await relayAny(tile, { upstreamBody: 'x', type: 'image/pngx' });
  assert.equal(lookalike.response.status, 502, 'near-miss content types are refused');
});

test('relay rate limit ignores a caller-supplied address unless a trusted proxy is configured', () => {
  const source = read('app/api/alert-journey/relay/route.ts');
  assert.ok(source.includes('process.env.AEGIS_TRUSTED_PROXY === "1"'));
  assert.ok(source.includes('MAX_FETCHES_PER_HOST_MINUTE') && source.includes('MAX_IN_FLIGHT'));
  assert.ok(!source.includes('hits.clear()'), 'counters are evicted oldest-first, never wiped');
  assert.ok(!source.includes('request.text()') && !source.includes('upstream.arrayBuffer()'), 'bodies are read with a size cap');
});

test('the client sends every third-party request through the relay', () => {
  const g = { location: { origin: 'http://localhost:3000' } };
  const source = read('components/alert-journey/engine/live-data.js');
  assert.ok(source.includes('await fetch(via(url), {'), 'JSON requests use the relay');
  assert.ok(source.includes('im.src = via(url);'), 'image requests use the relay');
  assert.ok(/function via\(url\) \{ return L\.relay && host\(url\) !== 'self' \? SELF \+ '\/api\/alert-journey\/relay\?u=' \+ encodeURIComponent\(url\) : url; \}/.test(source));
  assert.ok(g.location.origin.length > 0);
});

test('feed-supplied links are rendered only when they are plain https URLs', () => {
  const panels = read('components/alert-journey/engine/live-panels.js');
  assert.ok(!/href="' \+ esc\(/.test(panels), 'links from feeds must go through safeUrl');
  assert.ok(/function safeUrl\(u\)[^}]+protocol === 'https:'/.test(panels));
});

// ---- public pages: the globe uses bundled files only, so the sign-in gate and the page policy need no exception ----
test('public-page globe loads only bundled imagery and keeps its honesty labels', () => {
  const globe = read('components/globe/india-globe.ts'), outline = read('components/globe/india-outline.ts');
  const imports = [...globe.matchAll(/from "(\.\/assets\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(imports.length >= 4, 'imagery is imported as build assets (served from /_next/static, already outside the gate)');
  for (const file of imports) assert.ok(fs.existsSync(path.join(root, 'components/globe', file)), file);
  for (const file of ['components/globe/india-globe.ts', 'components/welcome/welcome-scene.ts', 'components/sign-in-scene.ts'])
    assert.ok(!/https?:\/\/|fetch\(|XMLHttpRequest|\/api\//.test(read(file)), file + ' contacts no host and reads no API');
  assert.ok(!fs.existsSync(path.join(root, 'public/globe')), 'no new public/ folder that would need a gate exception');
  assert.match(read('middleware.ts'), /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|maplibre\/\|favicon\.ico\|icon\.svg\)\.\*\)"\]/, 'gate matcher unchanged');
  assert.ok(outline.includes('not an authoritative boundary') && outline.includes('No internal or neighbouring boundaries'));
  const landing = read('components/welcome/welcome-experience.tsx'), signIn = read('components/sign-in-experience.tsx');
  for (const page of [landing, signIn]) assert.ok(page.includes('not an authoritative boundary') && page.includes('not live'), 'outline and imagery are labelled');
  assert.ok(landing.includes('import("./welcome-scene")') && signIn.includes('import("./sign-in-scene")'), '3D code is loaded after first paint');
  assert.ok(landing.includes('AEGIS does not send warnings') && landing.includes('synthetic exercise data'));
});

// ---- sign-in gate: nothing but the landing page and sign-in is open to a signed-out visitor ----
test('sign-in gate: only the landing page, sign-in page and sign-in endpoints are public', () => {
  const gate = loadTs('lib/session-gate.ts', { jose: require('jose') });
  for (const open of ['/', '/welcome', '/sign-in', '/api/auth/login', '/api/auth/callback', '/api/auth/session']) assert.ok(gate.isPublicPath(open), open);
  for (const closed of ['/alert-journey', '/incidents', '/admin/go-live', '/api/incidents', '/api/alert-journey/relay', '/api/alert-journey/tle', '/api/policy', '/welcome/x', '/sign-in/x', '/api/authx', '/demo'])
    assert.ok(!gate.isPublicPath(closed), closed);
  const middleware = read('middleware.ts');
  assert.ok(middleware.includes('status: 401') && middleware.includes('"/sign-in"') && !middleware.includes('next-router-prefetch'), 'pages redirect, APIs answer 401, prefetches are gated too');
  assert.ok(/isFixturePath\(pathname\) && session\.agencyId !== fixtureAgency\(\)/.test(middleware), 'exercise records only for the owning agency');
});

test('sign-in gate accepts only an unexpired cookie sealed with the server key', async () => {
  const jose = require('jose'), key = require('node:crypto').randomBytes(32), before = process.env.BFF_SESSION_KEY_BASE64;
  process.env.BFF_SESSION_KEY_BASE64 = key.toString('base64');
  try {
    const code = ts.transpileModule(read('lib/session-gate.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, mod = { exports: {} };
    new Function('require', 'module', 'exports', 'process', code)(name => name === 'jose' ? jose : require(name), mod, mod.exports, process);
    const gate = mod.exports;
    const seal = (payload, k = key, exp = Math.floor(Date.now() / 1000) + 600) => new jose.EncryptJWT(payload).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setExpirationTime(exp).encrypt(k);
    const good = { sub: 'u1', agencyId: '11111111-1111-4111-8111-111111111111', roles: ['incident_operator'] };
    assert.deepEqual(await gate.gateSession(await seal(good)), { agencyId: good.agencyId, roles: good.roles });
    assert.equal(await gate.gateSession(await seal(good, require('node:crypto').randomBytes(32))), null, 'sealed with another key');
    assert.equal(await gate.gateSession(await seal(good, key, Math.floor(Date.now() / 1000) - 5)), null, 'expired');
    assert.equal(await gate.gateSession(await seal({ ...good, agencyId: 'not-a-uuid' })), null);
    assert.equal(await gate.gateSession(await seal({ ...good, roles: [] })), null);
    assert.equal(await gate.gateSession('eyJhbGciOiJub25lIn0.e30.'), null, 'unsigned token');
    assert.equal(await gate.gateSession(undefined), null);
    assert.ok(gate.isFixturePath('/api/incidents/x/readiness') && gate.isFixturePath('/demo') && !gate.isFixturePath('/api/proposals'));
  } finally { if (before === undefined) delete process.env.BFF_SESSION_KEY_BASE64; else process.env.BFF_SESSION_KEY_BASE64 = before; }
});

// ---- return-to after sign-in: only a plain in-app page path, kept inside the sealed flow cookie ----
test('sign-in return path accepts only plain in-app pages and never travels through the provider', () => {
  const gate = loadTs('lib/session-gate.ts', { jose: require('jose') });
  for (const ok of ['/incidents', '/admin/go-live', '/handover', '/department-tasks']) assert.equal(gate.safeReturnPath(ok), ok);
  const bad = ['//evil.example', '/' + String.fromCharCode(92) + 'evil.example', 'https://evil.example', '/incidents?x=1', '/incidents#x', '/a/../b', '/incidents/', '/', '/welcome', '/sign-in',
    '/api/auth/login', '/api/incidents', '/_next/static/x', '/a b', '/%2F%2Fevil', '/incidents.json', '', null, undefined, 42, '/' + 'a'.repeat(200)];
  for (const value of bad) assert.equal(gate.safeReturnPath(value), null, String(value));
  const login = read('app/api/auth/login/route.ts'), callback = read('app/api/auth/callback/route.ts'), middleware = read('middleware.ts');
  assert.ok(login.includes('safeReturnPath(request.nextUrl.searchParams.get("next"))') && !login.includes('authorize.searchParams.set("next"'), 'validated, then sealed in the flow cookie');
  assert.ok(callback.includes('safeReturnPath(flow.next)') && callback.includes('config.origin + ('), 'validated again and always prefixed with our own origin');
  assert.ok(middleware.includes('safeReturnPath(pathname)') && middleware.includes('"expired"'), 'gate passes only a validated path and marks an ended session');
  const logout = read('app/api/auth/logout/route.ts'), server = read('lib/auth-server.ts');
  assert.ok(logout.includes('id_token_hint') && server.includes('path: "/api/auth"') === false && callback.includes('path: "/api/auth"'), 'id token cookie is limited to the sign-in endpoints');
  assert.ok(callback.includes('displayLabel(idClaims.preferred_username)') && !/roles:\s*idClaims/.test(callback), 'names come from the verified ID token and are display only');
});

test('another agency is refused with a styled 403 page that stays behind the gate and shows no data', () => {
  const gate = loadTs('lib/session-gate.ts', { jose: require('jose') });
  assert.ok(!gate.isPublicPath('/no-access'), 'the refusal page is not a public page');
  assert.ok(gate.safeReturnPath('/no-access') !== null, 'it is an ordinary in-app path');
  const middleware = read('middleware.ts');
  const branch = middleware.slice(middleware.indexOf('isFixturePath(pathname) && session.agencyId'), middleware.indexOf('if (isApi) return NextResponse.next();'));
  assert.ok(branch.includes('NextResponse.rewrite(denied, { status: 403'), 'rewritten, with status 403');
  assert.ok(branch.includes('denied.pathname = "/no-access"'), 'to the in-app refusal page');
  assert.ok(!/redirect\(/.test(branch.slice(branch.indexOf('const denied'))), 'never a redirect to another page');
  assert.ok(!branch.includes('text/plain'), 'no plain-text refusal any more');
  assert.ok(branch.includes('"No records for your agency"') && branch.includes('status: 403'), 'the API refusal is unchanged');
  assert.ok(branch.includes('Content-Security-Policy') && branch.includes('x-nonce'), 'the refusal page carries the same nonce and policy');
  const page = read('app/no-access/page.tsx');
  assert.ok(page.includes('code="403"') && page.includes('SystemPage'), 'it reuses the system page');
  assert.ok(!/fetch\(|api\//.test(page.replace(/\/\/.*$/gm, '')), 'the page reads no data');
});

test('middleware behaviour: a page of another agency is a 403 rewrite to /no-access; the owner, the API and signed-out visitors are unchanged', async () => {
  const jose = require('jose'), { NextRequest } = require('next/server'), crypto = require('node:crypto');
  const key = crypto.randomBytes(32), env = { ...process.env, BFF_SESSION_KEY_BASE64: key.toString('base64'), APP_ORIGIN: 'http://localhost:3000', NODE_ENV: 'production' };
  delete env.AEGIS_FIXTURE_AGENCY_ID;
  const compile = (file, map) => {
    const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, mod = { exports: {} };
    new Function('require', 'module', 'exports', 'process', code)(name => map[name] ?? require(name), mod, mod.exports, { env });
    return mod.exports;
  };
  const gate = compile('lib/session-gate.ts', { jose }), csp = compile('lib/csp.ts', {});
  const { middleware } = compile('middleware.ts', { './lib/csp': csp, './lib/session-gate': gate, 'next/server': require('next/server') });
  const seal = agencyId => new jose.EncryptJWT({ sub: 'u1', agencyId, roles: ['incident_operator'] }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setExpirationTime(Math.floor(Date.now() / 1000) + 600).encrypt(key);
  const ask = async (url, agencyId) => middleware(new NextRequest('http://localhost:3000' + url, agencyId ? { headers: { cookie: 'aegis-session=' + await seal(agencyId) } } : {}));
  const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';

  const refused = await ask('/incidents', other);
  assert.equal(refused.status, 403, 'still a 403');
  assert.match(refused.headers.get('x-middleware-rewrite') ?? '', /\/no-access$/, 'rewritten to the in-app page');
  assert.equal(refused.headers.get('location'), null, 'no redirect');
  assert.ok((refused.headers.get('content-security-policy') ?? '').includes("script-src"), 'same security policy as every page');
  assert.equal(refused.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(refused.headers.get('content-type') ?? '', /text\/plain/);

  const api = await ask('/api/incidents', other);
  assert.equal(api.status, 403); assert.equal((await api.json()).code, 'OUT_OF_SCOPE', 'the API refusal is unchanged');

  const ok = await ask('/incidents', owner);
  assert.notEqual(ok.status, 403); assert.equal(ok.headers.get('x-middleware-rewrite'), null, 'the owning agency sees its own records');

  const signedOut = await ask('/no-access');
  assert.equal(signedOut.status, 307); assert.match(signedOut.headers.get('location'), /\/sign-in/, 'the refusal page itself stays behind the sign-in gate');
  const signedOutFixture = await ask('/incidents');
  assert.equal(signedOutFixture.status, 307, 'a signed-out visitor is sent to sign in, not told which pages exist');
});
