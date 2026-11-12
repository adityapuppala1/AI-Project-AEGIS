// The web routes that call the formerly open API read routes must forward the session bearer server-side and
// answer 401 { error, code: "SIGN_IN_REQUIRED" } without a session, making no API call. Synthetic sessions and
// fetch exist only in this test loader (api-auth-stub.cjs); production auth is never replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const { TOKEN, state, apiAuth, isApiAuth } = require('./api-auth-stub.cjs');

const ROOT = path.join(__dirname, '../..');
const ID = '22222222-2222-4222-8222-222222222222';
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const local = name => {
    // Plain helper modules the routes import (validation only); compiled the same way.
    const target = path.relative(ROOT, path.join(ROOT, path.dirname(file), name)).replace(/\\/g, '/') + '.ts';
    return load(target);
  };
  new Function('require', 'module', 'exports', code)(name => isApiAuth(name) ? apiAuth : name === 'next/server' ? { NextRequest, NextResponse } : name.startsWith('.') ? local(name) : require(name), mod, mod.exports);
  return mod.exports;
}
const ORIGIN = 'http://localhost:3000';
const get = url => new NextRequest(ORIGIN + url);
const post = (url, body) => new NextRequest(ORIGIN + url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const params = value => ({ params: Promise.resolve(value) });

const ROUTES = [
  ['app/api/incidents/route.ts', 'GET', () => [get('/api/incidents')], '/v1/exercise/incidents'],
  ['app/api/incidents/query/route.ts', 'GET', () => [get('/api/incidents/query?page=1')], '/v1/exercise/incidents/query'],
  ['app/api/incidents/[id]/audit/route.ts', 'GET', () => [get('/x'), params({ id: ID })], `/v1/exercise/incidents/${ID}/audit`],
  ['app/api/incidents/[id]/correlation/route.ts', 'GET', () => [get('/x?radius_m=3000'), params({ id: ID })], `/v1/exercise/incidents/${ID}/correlation`],
  ['app/api/incidents/[id]/readiness/route.ts', 'GET', () => [get('/x?radius_m=3000'), params({ id: ID })], `/v1/exercise/incidents/${ID}/readiness`],
  ['app/api/incidents/[id]/grounded-guide/route.ts', 'POST', () => [post('/x', { question: 'What is missing here?' }), params({ id: ID })], `/v1/exercise/incidents/${ID}/grounded-guide`],
  ['app/api/incidents/[id]/review-focus/route.ts', 'POST', () => [post('/x', {}), params({ id: ID })], `/v1/exercise/incidents/${ID}/review-focus`],
  ['app/api/agency-tasks/route.ts', 'GET', () => [get('/api/agency-tasks?limit=50')], '/v1/exercise/agency-tasks'],
  ['app/api/agency-tasks/[id]/route.ts', 'GET', () => [get('/x'), params({ id: ID })], `/v1/exercise/agency-tasks/${ID}`],
  ['app/api/sources/route.ts', 'GET', () => [get('/api/sources')], '/v1/exercise/sources'],
  ['app/api/sources/[id]/history/route.ts', 'GET', () => [get('/x?limit=24'), params({ id: ID })], `/v1/exercise/sources/${ID}/history`],
  ['app/api/ingestion/status/route.ts', 'GET', () => [get('/api/ingestion/status')], '/v1/exercise/ingestion/status'],
  ['app/api/model-lab/report/route.ts', 'GET', () => [get('/api/model-lab/report')], '/v1/exercise/model-lab/report'],
  ['app/api/policy/route.ts', 'GET', () => [get('/api/policy')], '/v1/exercise/policy'],
  ['app/api/telemetry/route.ts', 'GET', () => [get('/api/telemetry')], '/v1/exercise/telemetry'],
  ['app/api/exercise/risk/route.ts', 'POST', () => [post('/api/exercise/risk', { source_id: 'AEGIS-EXERCISE-ONLY', rainfall_mm_hour: 10, water_index: 10, drainage_condition: 'good', observed_at: '2026-01-01T00:00:00Z' })], '/v1/exercise/risk'],
  ['app/api/earth-watch/[feed]/route.ts', 'GET', () => [get('/x'), params({ feed: 'status' })], '/v1/public-reference/earth-watch/status'],
  ['app/api/public-intake/status/route.ts', 'GET', () => [get('/api/public-intake/status')], '/v1/public-intake/status'],
  ['app/api/public-intake/route.ts', 'GET', () => [get('/api/public-intake')], '/v1/public-intake/reports'],
  ['app/api/alert-journey/tle/route.ts', 'GET', () => [get('/api/alert-journey/tle?group=weather')], '/v1/public-reference/earth-watch/status'],
  ['app/api/alert-journey/relay/route.ts', 'GET', () => [get('/api/alert-journey/relay?u=' + encodeURIComponent('https://earthquake.usgs.gov/fdsnws/event/1/query'))], '/v1/public-reference/earth-watch/status'],
];

async function withFetch(run) {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options = {}) => { calls.push({ url: String(url), options }); return new Response('{}', { status: 503 }); };
  try { await run(calls); } finally { global.fetch = original; }
}

for (const [file, method, args, apiPath] of ROUTES) {
  test(`${file}: no session -> 401 SIGN_IN_REQUIRED and no API call`, async () => {
    const route = load(file);
    const saved = state.session; state.session = null;
    try {
      await withFetch(async calls => {
        const response = await route[method](...args());
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: 'Sign-in required', code: 'SIGN_IN_REQUIRED' });
        assert.equal(calls.length, 0);
      });
    } finally { state.session = saved; }
  });
  test(`${file}: forwards the session bearer to ${apiPath} and never echoes it`, async () => {
    const route = load(file);
    await withFetch(async calls => {
      const response = await route[method](...args());
      const apiCall = calls.find(call => new URL(call.url).pathname === apiPath);
      assert.ok(apiCall, 'API was called');
      assert.equal(apiCall.options.headers.Authorization, 'Bearer ' + TOKEN);
      assert.ok(!(await response.text()).includes(TOKEN), 'token never returned to the browser');
    });
  });
}

async function withStatus(status, run) {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options = {}) => { calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ detail: 'upstream-secret-detail' }), { status, headers: { 'content-type': 'application/json' } }); };
  try { await run(calls); } finally { global.fetch = original; }
}

for (const [file, method, args] of ROUTES) {
  for (const [status, expected] of [[401, { error: 'Sign-in required', code: 'SIGN_IN_REQUIRED' }], [403, { error: 'Not permitted for your role or agency', code: 'FORBIDDEN' }]]) {
    test(`${file}: an upstream ${status} becomes the fixed ${expected.code} reply, never the upstream body`, async () => {
      const route = load(file);
      await withStatus(status, async () => {
        const response = await route[method](...args());
        assert.equal(response.status, status);
        const text = await response.text();
        assert.deepEqual(JSON.parse(text), expected);
        assert.ok(!text.includes('upstream-secret-detail'));
      });
    });
  }
}

test('the shared helper maps only 401 and 403', async () => {
  assert.equal(apiAuth.upstreamAuthFailure({ status: 401 }).status, 401);
  assert.equal(apiAuth.upstreamAuthFailure({ status: 403 }).status, 403);
  for (const status of [200, 404, 422, 500, 502, 503]) assert.equal(apiAuth.upstreamAuthFailure({ status }), null);
});

test('the public-intake queue refuses department and team roles before any API call', async () => {
  const route = load('app/api/public-intake/route.ts');
  const saved = state.session;
  try {
    for (const role of ['department_operator', 'response_team']) {
      state.session = { ...saved, roles: [role] };
      await withFetch(async calls => {
        const response = await route.GET();
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: 'Not permitted for your role or agency', code: 'FORBIDDEN' });
        assert.equal(calls.length, 0);
      });
    }
  } finally { state.session = saved; }
});

test('every file that forwards the session token maps upstream 401/403 through the shared helper', () => {
  const files = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  } };
  walk(path.join(ROOT, 'app'));
  // The demo walkthrough degrades each panel to "unavailable" on any failure and never shows upstream text.
  const EXEMPT = new Set(['app/demo/page.tsx']);
  const forwarding = files.map(file => path.relative(ROOT, file).replace(/\\/g, '/'))
    .filter(file => /lib\/api-auth"/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')) && !EXEMPT.has(file));
  assert.ok(forwarding.length >= 20, 'found the forwarding files');
  const offenders = forwarding.filter(file => !/upstreamAuthFailure\(/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'app/incidents/[id]/page.tsx'), 'utf8'), /if \(!auth\) return <IncidentUnavailable/);
});

test('every server file that calls the internal API forwards a session token', () => {
  const files = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  } };
  for (const dir of ['app', 'lib', 'components']) walk(path.join(ROOT, dir));
  const offenders = files.filter(file => {
    const text = fs.readFileSync(file, 'utf8');
    return text.includes('API_INTERNAL_URL') && !/apiAuthHeaders|apiAuthForRoles|readSession|accessToken/.test(text);
  }).map(file => path.relative(ROOT, file));
  assert.deepEqual(offenders, []);
});

test('server components attach the token server-side only', () => {
  for (const file of ['app/demo/page.tsx', 'app/incidents/[id]/page.tsx', 'app/model-lab/page.tsx']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(text, /import \{ apiAuthHeaders(, upstreamAuthFailure)? \} from "[./]+lib\/api-auth";/, file);
    assert.match(text, /headers: auth/, file);
    assert.doesNotMatch(text, /"use client"/, file);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'lib/api-auth.ts'), 'utf8'), /"use client"/);
});
