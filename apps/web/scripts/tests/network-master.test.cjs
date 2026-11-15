// Network Identifier Master (docs/NETWORK_IDENTIFIER_MASTER.md): proxy route allowlist, origin and role checks, lane
// scenario mapping, bundled logo marks (offline, attributed, three only), ownership note, no live-connection claims.
// Test doubles replace the session and origin helpers only in this loader; production auth is never replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

const root = path.join(__dirname, '../..');
const repo = path.join(root, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const transpile = file => ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function run(code, deps) { const mod = { exports: {} }; new Function('require', 'module', 'exports', code)(deps, mod, mod.exports); return mod.exports; }

const ADMIN = { accessToken: 'unit-only-token', roles: ['platform_admin'] };
const MAKER = { accessToken: 'unit-only-token', roles: ['incident_operator'] };
const ID = '6e570000-0000-4000-8000-000000000001';

function load(session, { configured = true, origin = true } = {}) {
  const apiAuth = run(transpile('lib/api-auth.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return { readSession: async () => session };
    throw Error('Unexpected dependency ' + name);
  });
  return run(transpile('lib/network-registry-proxy.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return { configuration: () => configured ? { origin: 'http://localhost:3000' } : null, sameOrigin: () => origin };
    if (name === './api-auth') return apiAuth;
    throw Error('Unexpected dependency ' + name);
  });
}
async function withFetch(fn, respond = () => new Response('{"providers":[]}', { status: 200 })) {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return respond(url, options); };
  try { await fn(calls); } finally { global.fetch = original; }
}
const req = (url, method = 'GET', body) => new Request('http://localhost:3000' + url, { method, ...(body === undefined ? {} : { body }) });

test('only the fixed routes and methods are forwarded', () => {
  const { networkRoute } = load(ADMIN);
  assert.equal(networkRoute('GET', '/api/networks'), '');
  assert.equal(networkRoute('GET', '/api/networks/audit'), 'audit');
  assert.equal(networkRoute('POST', `/api/networks/providers/${ID}/enable`), `providers/${ID}/enable`);
  assert.equal(networkRoute('PUT', `/api/networks/providers/${ID}/credential`), `providers/${ID}/credential`);
  assert.equal(networkRoute('POST', `/api/networks/providers/${ID}/credential/clear`), `providers/${ID}/credential/clear`);
  for (const [method, url] of [['DELETE', `/api/networks/providers/${ID}`], ['GET', `/api/networks/providers/${ID}/credential`],
    ['POST', '/api/networks/providers/../../brand'], ['POST', '/api/networks/providers/x/enable'], ['PUT', '/api/networks/providers'],
    ['GET', '/api/networksx'], ['POST', `/api/networks/providers/${ID}/purge`]])
    assert.equal(networkRoute(method, url), null, `${method} ${url}`);
});

test('refuses signed-out, other roles, cross-origin writes, bad routes and bad bodies without fetching', async () => {
  await withFetch(async calls => {
    assert.equal((await load(null).proxyNetworkRegistry(req('/api/networks'))).status, 401);
    assert.equal((await load(MAKER).proxyNetworkRegistry(req('/api/networks'))).status, 403);
    assert.equal((await load(ADMIN, { configured: false }).proxyNetworkRegistry(req('/api/networks'))).status, 503);
    assert.equal((await load(ADMIN, { origin: false }).proxyNetworkRegistry(req('/api/networks/providers', 'POST', '{}'))).status, 403);
    assert.equal((await load(ADMIN).proxyNetworkRegistry(req('/api/networks/nope'))).status, 404);
    assert.equal((await load(ADMIN).proxyNetworkRegistry(req('/api/networks?x=1'))).status, 400);
    assert.equal((await load(ADMIN).proxyNetworkRegistry(req('/api/networks/providers?x=1', 'POST', '{}'))).status, 400);
    for (const bad of ['[]', 'not json', 'x'.repeat(9000), 'null'])
      assert.equal((await load(ADMIN).proxyNetworkRegistry(req('/api/networks/providers', 'POST', bad))).status, 400, bad.slice(0, 10));
    assert.equal(calls.length, 0);
  });
});

test('forwards the bearer to the fixed API path and passes only fixed error codes', async () => {
  await withFetch(async calls => {
    const proxy = load(ADMIN).proxyNetworkRegistry;
    assert.equal((await proxy(req('/api/networks?include_deleted=true'))).status, 200);
    assert.equal((await proxy(req(`/api/networks/providers/${ID}/enable`, 'POST', '{"expected_version":1}'))).status, 200);
    assert.deepEqual(calls.map(c => [c.url, c.options.method, c.options.headers.Authorization]), [
      ['http://localhost:8000/v1/admin/networks?include_deleted=true', 'GET', 'Bearer unit-only-token'],
      [`http://localhost:8000/v1/admin/networks/providers/${ID}/enable`, 'POST', 'Bearer unit-only-token'],
    ]);
  });
  await withFetch(async () => {
    const response = await load(ADMIN).proxyNetworkRegistry(req(`/api/networks/providers/${ID}/enable`, 'POST', '{"expected_version":1}'));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'network_version_conflict');
  }, () => new Response('{"detail":"network_version_conflict"}', { status: 409 }));
  await withFetch(async () => {
    const response = await load(ADMIN).proxyNetworkRegistry(req('/api/networks/providers', 'POST', '{}'));
    assert.equal((await response.json()).code, 'network_registry_unavailable');
  }, () => new Response('{"detail":"Traceback: secret"}', { status: 500 }));
});

test('lanes read is open to every exercise role and goes to one fixed path', async () => {
  await withFetch(async calls => {
    assert.equal((await load(null).proxyNetworkLanes()).status, 401);
    assert.equal((await load(MAKER).proxyNetworkLanes()).status, 200);
    assert.deepEqual(calls.map(c => c.url), ['http://localhost:8000/v1/network-lanes']);
  });
});

test('route files only export their methods and delegate to the proxy; the session gate keeps them private', () => {
  const route = read('app/api/networks/[[...path]]/route.ts');
  assert.deepEqual([...route.matchAll(/export async function (\w+)/g)].map(m => m[1]), ['GET', 'POST', 'PUT']);
  assert.equal((route.match(/return proxyNetworkRegistry\(request\)/g) || []).length, 3);
  assert.match(read('app/api/network-lanes/route.ts'), /export async function GET\(\) \{ return proxyNetworkLanes\(\); \}/);
  const gate = read('lib/session-gate.ts');
  assert.ok(!gate.includes('/api/networks') && !gate.includes('/admin/networks') && !gate.includes('network-lanes'));
});

test('scenario follows the configured rehearsal states; no provider means Normal', () => {
  const reg = run(transpile('lib/network-registry.ts'), () => ({}));
  const lane = (kind, state, code = kind) => ({ code, display_name: code, kind, monogram: 'X', colour_token: 'c1', logo_key: null, rehearsal_state: state, rehearsal_capacity_kbps: 1 });
  assert.equal(reg.scenarioFromLanes([]), 'normal');
  assert.equal(reg.scenarioFromLanes([lane('terrestrial_mobile', 'up'), lane('satellite', 'up')]), 'normal');
  assert.equal(reg.scenarioFromLanes([lane('terrestrial_mobile', 'degraded')]), 'ground_degraded');
  assert.equal(reg.scenarioFromLanes([lane('terrestrial_fixed', 'down'), lane('satellite', 'up')]), 'ground_cut');
  assert.equal(reg.scenarioFromLanes([lane('terrestrial_mobile', 'up'), lane('satellite', 'degraded')]), 'normal');
  assert.equal(reg.satelliteStateUnshown([lane('terrestrial_mobile', 'up'), lane('satellite', 'down')]), true);
  assert.equal(reg.scenarioFromLanes([lane('terrestrial_mobile', 'down'), lane('satellite', 'degraded')]), 'satellite_reduced');
  assert.equal(reg.scenarioFromLanes([lane('terrestrial_mobile', 'down'), lane('satellite', 'down')]), 'both_down');
  assert.equal(reg.scenarioFromLanes([lane('tower_operator', 'down')]), 'normal');
  const named = reg.laneProviders([lane('satellite', 'up', 'a'), lane('terrestrial_mobile', 'up', 'b'), lane('satellite', 'up', 'c')]);
  assert.equal(named.satellite.code, 'a'); assert.equal(named.ground.code, 'b');
  assert.equal(reg.monogramFor('Bharti Airtel'), 'BA');
});

test('logo marks: three bundled marks, attributed, matching the API list, never fetched at runtime', () => {
  const logos = run(transpile('lib/network-logos.ts'), () => ({}));
  assert.deepEqual(Object.keys(logos.LOGO_MARKS).sort(), ['airtel', 'jio', 'spacex']);
  assert.equal(logos.LOGO_SET.licence, 'CC0 1.0 Universal');
  for (const mark of Object.values(logos.LOGO_MARKS)) {
    assert.match(mark.path, /^M[0-9.\- a-zA-Z,]+$/); assert.match(mark.hex, /^[0-9A-F]{6}$/); assert.match(mark.source, /^https:\/\//);
  }
  assert.equal(logos.OWNERSHIP_NOTE, 'Names and logos belong to their owners; listing is not a partnership or endorsement.');
  const catalogue = fs.readFileSync(path.join(repo, 'services/api/app/network_catalogue.py'), 'utf8');
  assert.match(catalogue, /LOGO_KEYS = frozenset\(\{"spacex", "airtel", "jio"\}\)/);
  const migration = fs.readFileSync(path.join(repo, 'db/migrations/021_network_registry.sql'), 'utf8');
  assert.match(migration, /logo_key IN \('spacex', 'airtel', 'jio'\)/);
  const ui = read('components/network-master/network-master.tsx') + read('components/network-master/provider-mark.tsx');
  assert.ok(!/<img|https?:\/\/[^"'\s]*\.(svg|png)/.test(ui), 'no hotlinked image');
  assert.ok(!/fetch\(\s*["'`]https?:/.test(ui), 'no external fetch');
  assert.ok(read('components/network-master/network-master.tsx').includes('t(OWNERSHIP_NOTE)'));
});

test('the page and scene make no claim of live connectivity and keep reduced motion and fallback', () => {
  const ui = read('components/network-master/network-master.tsx');
  const scene = read('components/network-master/network-scene.ts');
  for (const phrase of ['no live connection to any provider', 'Not a real orbit, position or coverage', 'Reference entry, not a partnership', 'rehearsal statistics, not accuracy'])
    assert.ok(ui.toLowerCase().includes(phrase.toLowerCase()), phrase);
  assert.ok(/reducedMotion/.test(scene) && /webglcontextlost/.test(scene) && /return null/.test(scene) && /dispose\(\)/.test(scene));
  assert.ok(/useState<"2d" \| "3d">\("2d"\)/.test(ui), '2D is the default');
  for (const hook of ['nm-tabs', 'nm-scene', 'nm-satellite', 'nm-integrations', 'nm-activity']) assert.ok(ui.includes(`data-tour="${hook}"`) || ui.includes(`tour="${hook}"`), hook);
  assert.ok(!/(live|real)[- ]time (telemetry|link)|is connected to/i.test(ui));
});

test('the Sensor Link page reads lanes, keeps a hand-made choice and never sends', () => {
  const page = read('components/sensor-link.tsx');
  assert.ok(page.includes('fetch("/api/network-lanes"') && page.includes('touched.current') && page.includes('Nothing is transmitted through any provider.'));
  assert.ok(!page.includes('network-master/network-master'), 'the 3D module is not pulled into Sensor Link');
});
