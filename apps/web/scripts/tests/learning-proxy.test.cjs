// Isolated BFF tests for A8 post-event learning and A9 exercise drills.
// Synthetic sessions/fetch exist only in this test loader and are never production auth overrides.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const ORIGIN = 'http://localhost:3000';
const A = '11111111-1111-4111-8111-111111111111';
const W = '33333333-3333-4333-8333-333333333333';

function compile(file, deps) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { if (name in deps) return deps[name]; throw Error('Unexpected dependency ' + name); }, module, module.exports);
  return module.exports;
}
const lib = compile('lib/learning.ts', {});
const load = (session, configured = true) => compile('lib/learning-proxy.ts', {
  'next/server': { NextResponse }, './learning': lib,
  './auth-server': { configuration: () => configured ? { origin: ORIGIN } : null, readSession: async () => session, sameOrigin: r => r.headers.get('origin') === ORIGIN },
}).proxyLearning;
const who = (...roles) => ({ accessToken: 'unit-only-token', roles });
const req = (method, url, body, origin = ORIGIN) => new Request(ORIGIN + url, { method, headers: { origin, 'content-type': 'application/json' },
  body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
async function withFetch(payload, run, status = 200) {
  const original = global.fetch; const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }); };
  try { await run(calls); } finally { global.fetch = original; }
}
const proposal = (extra = {}) => ({ id: A, window_id: W, base_version: 'aegis.hazard-triggers.v1', new_version: 'aegis.hazard-triggers.v1-labc', status: 'submitted',
  diff: { changes: [{ path: 'hazards.heavy_rain.watch', old: 35, new: 38.5 }] }, rationale: { accuracy_claim: false, rules: [] }, maker_subject: 'maker-1', ...extra });
const drill = (extra = {}) => ({ id: A, exercise: true, operational_actions_enabled: false, notifications_sent: false, scenario_id: 'known_2000_08_24_heavy_rain',
  status: 'running', trigger_state: 'watch', sim_minute: 60, end_minute: 360, actions: {}, injected: [], ...extra });

test('writes require sign-in, configured IdP, same origin and POST/GET only', async () => {
  await withFetch(proposal(), async calls => {
    const body = { approve: true, rationale: 'Independent review done.' };
    assert.equal((await load(null)(req('POST', '/api/learning', body), 'learning', ['proposals', A, 'review'])).status, 401);
    assert.equal((await load(who('incident_checker'), false)(req('POST', '/x', body), 'learning', ['proposals', A, 'review'])).status, 503);
    assert.equal((await load(who('incident_checker'))(req('POST', '/x', body, 'https://evil.example'), 'learning', ['proposals', A, 'review'])).status, 403);
    assert.equal((await load(who('incident_checker'))(req('DELETE', '/x'), 'learning', ['proposals', A])).status, 405);
    assert.equal((await load(who('department_operator'))(req('GET', '/x'), 'learning', ['windows'])).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('role gates: review needs checker/admin, apply needs platform_admin, maker routes need incident_operator', async () => {
  await withFetch(proposal(), async calls => {
    const review = { approve: true, rationale: 'Independent review done.' };
    assert.equal((await load(who('incident_operator'))(req('POST', '/x', review), 'learning', ['proposals', A, 'review'])).status, 403);
    assert.equal((await load(who('incident_checker'))(req('POST', '/x', { rationale: 'Apply after approval.' }), 'learning', ['proposals', A, 'apply'])).status, 403);
    assert.equal((await load(who('incident_auditor'))(req('POST', '/x', { window_id: W }), 'learning', ['proposals'])).status, 403);
    assert.equal(calls.length, 0);
    const ok = await load(who('incident_checker'))(req('POST', '/x', review), 'learning', ['proposals', A, 'review']);
    assert.equal(ok.status, 200);
    assert.equal(calls[0].url, 'http://localhost:8000/v1/proactive/learning/proposals/' + A + '/review');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.deepEqual(JSON.parse(calls[0].options.body), review);
    assert.equal(JSON.stringify(await ok.json()).includes('unit-only-token'), false);
  });
});

test('requests are rebuilt from allowlisted fields; extra or malformed input is rejected before fetch', async () => {
  await withFetch(proposal(), async calls => {
    const op = load(who('incident_operator', 'incident_checker', 'platform_admin'));
    const bad = [
      [['proposals', A, 'review'], { approve: 'yes', rationale: 'Independent review done.' }],
      [['proposals', A, 'review'], { approve: true, rationale: 'short' }],
      [['proposals', A, 'review'], { approve: true, rationale: 'Independent review done.', checker_subject: 'me' }],
      [['proposals', A, 'apply'], { rationale: 'Apply\u0000now please ok' }],
      [['proposals', A, 'submit'], { force: true }],
      [['proposals'], { window_id: 'nope' }],
      [['windows', 'close'], { hazard: 'heavy_rain', window_start: '2026-07-01', window_end: '2026-07-31', agency_id: A }],
      [['windows', 'replay'], { source: 'live_feed' }],
      [['windows', 'replay'], { source: 'synthetic', scenario_id: '../etc' }],
      [['proposals', 'not-a-uuid', 'apply'], { rationale: 'Apply after approval.' }],
      [['config', 'x', 'y', 'z', 'w'], {}],
    ];
    for (const [segments, body] of bad) assert.equal((await op(req('POST', '/x', body), 'learning', segments)).status, 400, JSON.stringify([segments, body]));
    assert.equal((await op(req('POST', '/x', 'not json'), 'learning', ['proposals'])).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('responses claiming accuracy or with unknown status are refused', async () => {
  await withFetch(proposal({ rationale: { accuracy_claim: true } }), async () => {
    assert.equal((await load(who('incident_auditor'))(req('GET', '/x'), 'learning', ['proposals', A])).status, 502);
  });
  await withFetch(proposal({ status: 'applied_live' }), async () => {
    assert.equal((await load(who('incident_auditor'))(req('GET', '/x'), 'learning', ['proposals', A])).status, 502);
  });
  await withFetch({ detail: 'independent_checker_required' }, async () => {
    const response = await load(who('incident_checker'))(req('POST', '/x', { approve: true, rationale: 'Independent review done.' }), 'learning', ['proposals', A, 'review']);
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'independent_checker_required');
  }, 409);
});

test('drill routes: clock and respond are validated and exercise-only output is enforced', async () => {
  await withFetch(drill(), async calls => {
    const op = load(who('incident_operator'));
    for (const [segments, body] of [[[A, 'clock'], { expected_minute: 60, minutes: 0 }], [[A, 'clock'], { expected_minute: 60, minutes: 241 }],
      [[A, 'clock'], { expected_minute: '60', minutes: 5 }], [[A, 'respond'], { action: 'dispatch' }], [[], { scenario_id: 'x', wall_clock: true }]]) {
      assert.equal((await op(req('POST', '/x', body), 'drills', segments)).status, 400, JSON.stringify(body));
    }
    assert.equal(calls.length, 0);
    const ok = await op(req('POST', '/x', { expected_minute: 60, minutes: 15 }), 'drills', [A, 'clock']);
    assert.equal(ok.status, 200);
    assert.equal(calls[0].url, `http://localhost:8000/v1/proactive/drills/${A}/clock`);
    assert.equal((await load(who('incident_auditor'))(req('POST', '/x', { scenario_id: 'known_2000_08_24_heavy_rain' }), 'drills', [])).status, 403);
  });
  for (const tampered of [drill({ exercise: false }), drill({ operational_actions_enabled: true }), drill({ notifications_sent: true })]) {
    await withFetch(tampered, async () => {
      assert.equal((await load(who('incident_operator'))(req('GET', '/x'), 'drills', [A])).status, 502);
    });
  }
});

test('library helpers format rates and the simulated clock', () => {
  assert.equal(lib.pctLabel({ estimate: 0.5, ci95: [0.2366, 0.7634] }), '50% (95% CI 24-76%)');
  assert.equal(lib.pctLabel({ estimate: null, ci95: null }), 'n/a');
  assert.equal(lib.simClock(135), 'T+02:15');
});
