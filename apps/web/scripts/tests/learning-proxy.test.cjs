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

// The BFF cleans a payload once and the browser cleans it again. A cleaner that rejects its own output made every
// live window, proposal and drill fail with "Invalid response" while the unit tests (one pass only) stayed green.
test('cleaners are idempotent: output of the BFF passes the browser guard unchanged', () => {
  const rule = { rule_id: 'heavy_rain:watch', events: 2, hits: 1, misses: 1, false_alarm_episodes: 0,
    probability_of_detection: { k: 1, n: 2, estimate: 0.5, ci95: [0.1, 0.9], ci_reason: null },
    false_alarm_ratio: { k: 0, n: 1, estimate: 0, ci95: null, ci_reason: 'too_few' },
    lead_time_days: { n: 1, min: 1, median: 1, max: 1 }, cited_ids: [A] };
  const window = { id: A, hazard: 'heavy_rain', window_start: '2026-07-01', window_end: '2026-07-31', source: 'synthetic', basis: 'synthetic_rehearsal',
    config_version: 'aegis.hazard-triggers.v1', observed_events: ['2026-07-04'], closed_by: 'maker-1', closed_at: '2026-08-01T00:00:00Z',
    stats: { accuracy_claim: false, basis_note: 'Rehearsal statistics only.', rules: [rule], event_refs: [] } };
  const report = { drill_id: A, exercise: true, operational_actions_enabled: false, status: 'running', sim_minute: 60, note: 'Synthetic rehearsal targets.',
    cited_event_ids: [], actions: [{ action: 'acknowledge_watch', target_minutes: 15, anchor_minute: 30, response_minute: 40, elapsed_minutes: 10,
      status: 'within_synthetic_target', coach_note: 'On time.' }] };
  const withActions = drill({ actions: { acknowledge_watch: { minute: 40, actor: 'maker-1' } }, first_watch_minute: 30, title: 'T', hazard: 'heavy_rain',
    injected: [{ evidence_id: A, minute: 0, value: 18, trigger_state: 'clear' }] });
  for (const [name, fn, raw] of [['drill', lib.cleanDrill, withActions], ['report', lib.cleanReport, report],
    ['window', lib.cleanWindow, window], ['proposal', lib.cleanProposal, proposal({ rationale: { accuracy_claim: false, rules: [{ rule_id: 'heavy_rain:watch', decision: 'raise' }] } })]]) {
    const once = fn(raw);
    assert.ok(once, name + ' raw payload is accepted');
    assert.deepEqual(fn(once), once, name + ' cleaned output survives a second pass');
  }
});

test('cleaned output still cannot be forged into a claim: markers must be exact', () => {
  const once = lib.cleanDrill(drill());
  assert.equal(lib.cleanDrill({ ...once, exercise: false }), null);
  assert.equal(lib.cleanDrill({ ...once, notifications_sent: true }), null);
  assert.equal(lib.cleanWindow({ ...lib.cleanWindow({ id: A, basis: 'synthetic_rehearsal', stats: { accuracy_claim: false, rules: [] } }), accuracy_claim: true }), null);
  assert.equal(lib.cleanProposal({ ...lib.cleanProposal(proposal()), accuracy_claim: true }), null);
});

test('library helpers format rates and the simulated clock', () => {
  assert.equal(lib.pctLabel({ estimate: 0.5, ci95: [0.2366, 0.7634] }), '50% (95% CI 24-76%)');
  assert.equal(lib.pctLabel({ estimate: null, ci95: null }), 'n/a');
  assert.equal(lib.simClock(135), 'T+02:15');
});
