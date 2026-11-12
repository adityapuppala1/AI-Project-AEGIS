// Isolated proxy tests. Synthetic sessions/fetch exist only in this test loader.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const id = '77777777-7777-4777-8777-777777777777';
const ORIGIN = 'http://localhost:3000';

function compile(file, deps) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { if (name in deps) return deps[name]; throw Error('Unexpected dependency ' + name); }, module, module.exports);
  return module.exports;
}
const lib = compile('lib/proactive.ts', {});
function loadProxy(session, configured = true) {
  return compile('lib/proactive-proxy.ts', {
    'next/server': { NextResponse },
    './proactive': lib,
    './auth-server': {
      configuration: () => configured ? { origin: ORIGIN } : null,
      readSession: async () => session,
      sameOrigin: request => request.headers.get('origin') === ORIGIN,
    },
  }).proxyProactive;
}
const admin = { accessToken: 'unit-only-token', roles: ['platform_admin'] };
const operator = { accessToken: 'unit-only-token', roles: ['incident_operator'] };
const auditor = { accessToken: 'unit-only-token', roles: ['incident_auditor'] };
const req = (method, url, body, origin = ORIGIN) => new Request('http://localhost:3000' + url, { method, headers: { origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
async function withFetch(response, run) {
  const original = global.fetch; const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return response(); };
  try { await run(calls); } finally { global.fetch = original; }
}
const save = { expected_version: 1, enabled: true, settings: { days: 2 }, secrets: { map_key: 'abc' } };
const json = body => () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('connector writes reject unknown connector ids, oversize secrets and malformed payloads', async () => {
  const proxy = loadProxy(admin);
  await withFetch(json({}), async calls => {
    assert.equal((await proxy(req('PUT', '/x', save), 'connector_save', 'evil')).status, 400);
    assert.equal((await proxy(req('PUT', '/x', save), 'connector_save', '__proto__')).status, 400);
    assert.equal((await proxy(req('PUT', '/x', { ...save, secrets: { map_key: 'x'.repeat(513) } }), 'connector_save', 'nasa_firms')).status, 400);
    assert.equal((await proxy(req('PUT', '/x', { ...save, secrets: { map_key: 5 } }), 'connector_save', 'nasa_firms')).status, 400);
    assert.equal((await proxy(req('PUT', '/x', { ...save, expected_version: 1.5 }), 'connector_save', 'nasa_firms')).status, 400);
    assert.equal((await proxy(req('PUT', '/x', { ...save, enabled: 'yes' }), 'connector_save', 'nasa_firms')).status, 400);
    assert.equal((await proxy(req('PUT', '/x', { ...save, settings: { a: { b: 1 } } }), 'connector_save', 'nasa_firms')).status, 400);
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['k' + i, 1]));
    assert.equal((await proxy(req('PUT', '/x', { ...save, settings: many }), 'connector_save', 'nasa_firms')).status, 400);
    assert.equal((await proxy(req('PUT', '/x', { ...save, extra: 1 }), 'connector_save', 'nasa_firms')).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('valid connector save forwards bearer server-side, supports clearing secrets and never echoes secrets', async () => {
  const proxy = loadProxy(admin);
  const connector = { id: 'nasa_firms', name: 'FIRMS', enabled: true, version: 2, settings: { days: 2 }, fields: [{ name: 'map_key', label: 'Key', secret: true, set: true, fingerprint: 'ab12cd34', value: 'abc' }] };
  await withFetch(json(connector), async calls => {
    const result = await proxy(req('PUT', '/x', { ...save, secrets: { map_key: null } }), 'connector_save', 'nasa_firms');
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.ok(!JSON.stringify(await result.json()).includes('abc'));
    assert.equal(calls[0].options.method, 'PUT');
    assert.ok(calls[0].url.endsWith('/v1/proactive/connectors/nasa_firms'));
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.deepEqual(JSON.parse(calls[0].options.body).secrets, { map_key: null });
  });
});

test('writes require the same origin and a role', async () => {
  await withFetch(json({}), async calls => {
    assert.equal((await loadProxy(admin)(req('PUT', '/x', save, 'http://evil.example'), 'connector_save', 'nasa_firms')).status, 403);
    assert.equal((await loadProxy(admin)(req('POST', '/x', {}, 'http://evil.example'), 'connector_test', 'nasa_firms')).status, 403);
    assert.equal((await loadProxy(operator)(req('PUT', '/x', save), 'connector_save', 'nasa_firms')).status, 403);
    assert.equal((await loadProxy(operator)(req('GET', '/x'), 'connectors')).status, 403);
    assert.equal((await loadProxy(auditor)(req('POST', '/x', {}), 'watch_refresh')).status, 403);
    assert.equal((await loadProxy(admin)(req('POST', '/x', { trigger_event_id: id }), 'run_create')).status, 403);
    assert.equal((await loadProxy(null)(req('POST', '/x', {}), 'watch_refresh')).status, 401);
    assert.equal(calls.length, 0);
  });
});

test('refresh allows operator and platform_admin; runs allow only operator', async () => {
  await withFetch(json({ fetched: { open_meteo: 12, nasa_firms: 'http_503' }, evidence_added: 3, triggers: { clear: 1, watch: 2, candidate: 0 } }), async calls => {
    for (const session of [operator, admin]) {
      const result = await loadProxy(session)(req('POST', '/x', {}), 'watch_refresh');
      assert.equal(result.status, 200);
      assert.deepEqual((await result.json()).fetched, { open_meteo: 12, nasa_firms: 'http_503' });
    }
    assert.equal(calls.length, 2);
  });
});

test('run payloads validate ids, steps and cancel rationale', async () => {
  const proxy = loadProxy(operator);
  await withFetch(json({ id, trigger_event_id: id, status: 'running' }), async calls => {
    assert.equal((await proxy(req('POST', '/x', { trigger_event_id: 'nope' }), 'run_create')).status, 400);
    assert.equal((await proxy(req('POST', '/x', { trigger_event_id: id, x: 1 }), 'run_create')).status, 400);
    assert.equal((await proxy(req('POST', '/x', { expected_step: 'judge' }), 'run_advance', 'not-a-uuid')).status, 400);
    assert.equal((await proxy(req('POST', '/x', { expected_step: 'send_warning' }), 'run_advance', id)).status, 400);
    assert.equal((await proxy(req('POST', '/x', { rationale: 'short' }), 'run_cancel', id)).status, 400);
    assert.equal((await proxy(req('POST', '/x', { rationale: 'x'.repeat(2001) }), 'run_cancel', id)).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await proxy(req('POST', '/x', { trigger_event_id: id }), 'run_create')).status, 200);
    assert.equal((await proxy(req('POST', '/x', { expected_step: 'judge' }), 'run_advance', id)).status, 200);
    assert.equal((await proxy(req('POST', '/x', { rationale: 'Duplicate of an existing run' }), 'run_cancel', id)).status, 200);
    assert.deepEqual(calls.map(c => new URL(c.url).pathname), ['/v1/proactive/runs', '/v1/proactive/runs/' + id + '/advance', '/v1/proactive/runs/' + id + '/cancel']);
  });
});

test('watch reads need a session, forward its token, are cleaned and not cached; backend errors stay generic', async () => {
  const good = { id, connector_id: 'open_meteo', hazard: 'flood', observed_at: '2026-01-01T00:00:00Z', lat: 17, lon: 78, value: 1, unit: 'mm', stale: false };
  await withFetch(json({ generated_at: '2026-01-01T00:00:00Z', config_version: 'v1', disclaimer: 'x', evidence: [good, { ...good, id: 'bad' }], triggers: [] }), async calls => {
    for (const route of ['watch', 'watch_history', 'triggers_config']) {
      const refused = await loadProxy(null)(req('GET', '/api/proactive/watch'), route);
      assert.equal(refused.status, 401);
      assert.deepEqual(await refused.json(), { error: 'Secure operator sign-in required', code: 'SIGN_IN_REQUIRED' });
    }
    assert.equal(calls.length, 0, 'no API call without a session');
    for (const roles of [['response_team'], ['department_operator'], ['incident_auditor']]) {
      const result = await loadProxy({ accessToken: 'unit-only-token', roles })(req('GET', '/api/proactive/watch'), 'watch');
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal((await result.json()).evidence.length, 1);
    }
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.equal((await loadProxy(auditor)(req('GET', '/x?days=99'), 'watch_history')).status, 400);
    assert.equal((await loadProxy(auditor)(req('POST', '/x', {}), 'watch')).status, 405);
  });
  await withFetch(() => new Response(JSON.stringify({ detail: 'version_mismatch', trace: 'SECRET stack at db.py:12' }), { status: 409 }), async () => {
    const result = await loadProxy(admin)(req('PUT', '/x', save), 'connector_save', 'nasa_firms');
    const body = await result.json();
    assert.equal(result.status, 409); assert.equal(body.code, 'version_mismatch');
    assert.ok(!JSON.stringify(body).includes('SECRET'));
  });
  await withFetch(() => new Response('upstream detail with a secret', { status: 500 }), async () => {
    const body = await (await loadProxy(admin)(req('GET', '/x'), 'connectors')).json();
    assert.ok(!JSON.stringify(body).includes('secret'));
  });
});

test('CAP download streams XML as an attachment', async () => {
  const xml = '<alert><status>Exercise</status></alert>';
  await withFetch(() => new Response(xml, { headers: { 'Content-Type': 'application/xml' } }), async () => {
    const result = await loadProxy(operator)(req('GET', '/x'), 'run_cap', id);
    assert.equal(await result.text(), xml);
    assert.equal(result.headers.get('content-disposition'), 'attachment; filename="aegis-exercise-cap-' + id + '.xml"');
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  });
  await withFetch(() => new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }), async () => {
    assert.equal((await loadProxy(operator)(req('GET', '/x'), 'run_cap', id)).status, 502);
  });
});

test('kill switch: any operator may read, only platform_admin may change, Origin is enforced and body is allowlisted', async () => {
  const state = { paused: true, reason: 'Exercise pause for review', updated_at: '2026-11-01T00:00:00Z', updated_by: 'admin-1', audit: [{ paused: true, reason: 'Exercise pause for review', actor: 'admin-1', at: '2026-11-01T00:00:00Z' }], extra: 'dropped' };
  const body = { paused: true, reason: 'Exercise pause for review' };
  await withFetch(json(state), async calls => {
    for (const session of [operator, auditor, admin]) assert.equal((await loadProxy(session)(req('GET', '/x'), 'pause_get')).status, 200);
    assert.equal((await loadProxy(null)(req('GET', '/x'), 'pause_get')).status, 401);
    assert.equal((await loadProxy(operator)(req('PUT', '/x', body), 'pause_set')).status, 403);
    assert.equal((await loadProxy(admin)(req('PUT', '/x', body, 'http://evil.example'), 'pause_set')).status, 403);
    assert.equal((await loadProxy(admin)(req('PUT', '/x', { ...body, agency_id: id }), 'pause_set')).status, 400);
    assert.equal((await loadProxy(admin)(req('PUT', '/x', { paused: 'yes', reason: body.reason }), 'pause_set')).status, 400);
    assert.equal((await loadProxy(admin)(req('PUT', '/x', { paused: true, reason: 'short' }), 'pause_set')).status, 400);
    assert.equal((await loadProxy(admin)(req('PUT', '/x', { paused: true, reason: 'line one\nline two' }), 'pause_set')).status, 400);
    assert.equal((await loadProxy(admin)(req('POST', '/x', body), 'pause_set')).status, 405);
    assert.equal(calls.length, 3);
    const result = await loadProxy(admin)(req('PUT', '/x', { paused: true, reason: '  Exercise pause for review  ' }), 'pause_set');
    assert.equal(result.status, 200);
    const out = await result.json();
    assert.equal(out.paused, true); assert.equal(out.extra, undefined); assert.equal(out.audit[0].actor, 'admin-1');
    assert.equal(calls[3].options.method, 'PUT'); assert.ok(calls[3].url.endsWith('/v1/proactive/pause'));
    assert.deepEqual(JSON.parse(calls[3].options.body), { paused: true, reason: 'Exercise pause for review' });
  });
});

test('paused backend relays only the fixed proactive_paused code; run list is operator-only', async () => {
  await withFetch(() => new Response(JSON.stringify({ detail: 'proactive_paused' }), { status: 409 }), async () => {
    const result = await loadProxy(operator)(req('POST', '/x', { trigger_event_id: id }), 'run_create');
    assert.equal(result.status, 409); assert.equal((await result.json()).code, 'proactive_paused');
  });
  await withFetch(json({ runs: [{ id, trigger_event_id: id, status: 'running' }, { id: 'bad' }] }), async calls => {
    assert.equal((await loadProxy(admin)(req('GET', '/x'), 'run_list')).status, 403);
    const result = await loadProxy(operator)(req('GET', '/x'), 'run_list');
    assert.equal(result.status, 200); assert.equal((await result.json()).runs.length, 1);
    assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/v1/proactive/runs'));
  });
});

test('watch payload carries the kill switch flag as a strict boolean or null', () => {
  const base = { generated_at: '2026-01-01T00:00:00Z', config_version: 'v1', disclaimer: 'x', evidence: [], triggers: [] };
  assert.equal(lib.cleanWatch({ ...base, paused: true }).paused, true);
  assert.equal(lib.cleanWatch({ ...base, paused: 'true' }).paused, null);
  assert.equal(lib.cleanWatch(base).paused, null);
});

test('scheduler status: scoped read for operator roles only, GET only, cleaned to fixed codes', async () => {
  const tick = { id, started_at: '2026-11-01T00:00:00Z', finished_at: '2026-11-01T00:00:05Z', outcome: 'completed', runs_started: 1, flags_recorded: 2,
    errors: ['refresh_failed', 'Traceback (most recent call last)'], agency_id: '11111111-1111-4111-8111-111111111111' };
  const body = { enabled: true, running: true, reason: null, interval_seconds: 1800, next_tick_at: '2026-11-01T00:30:00Z', last_tick: tick,
    ticks: [tick, { ...tick, id: 'bad' }, { ...tick, outcome: 'sent_warning' }], secret: 'x' };
  const checker = { accessToken: 'unit-only-token', roles: ['incident_checker'] };
  const department = { accessToken: 'unit-only-token', roles: ['department_operator'] };
  await withFetch(json(body), async calls => {
    assert.equal((await loadProxy(null)(req('GET', '/x'), 'scheduler')).status, 401);
    assert.equal((await loadProxy(department)(req('GET', '/x'), 'scheduler')).status, 403);
    assert.equal((await loadProxy(operator)(req('POST', '/x', {}), 'scheduler')).status, 405);
    assert.equal(calls.length, 0);
    for (const session of [operator, checker, auditor, admin]) assert.equal((await loadProxy(session)(req('GET', '/x?limit=999'), 'scheduler')).status, 200);
    const out = await (await loadProxy(operator)(req('GET', '/x'), 'scheduler')).json();
    assert.ok(calls.every(c => new URL(c.url).pathname === '/v1/proactive/scheduler' && new URL(c.url).search === '?limit=10'));
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.equal(out.ticks.length, 1); assert.equal(out.secret, undefined);
    assert.equal(out.last_tick.agency_id, undefined);
    assert.deepEqual(out.last_tick.errors, ['refresh_failed', 'error']);
    assert.equal(out.running, true); assert.equal(out.interval_seconds, 1800);
  });
});

test('run cleaner keeps sentinel flags and origin but never trusts unknown flags', () => {
  const run = lib.cleanRun({ id, trigger_event_id: id, status: 'running', origin: 'scheduler', trigger_id: 'heavy_rain:hyd_17.30_78.35',
    sentinel_flags: [{ flag: 'contradicted', evidence_ids: [id, 'nope'], at: '2026-11-01T00:00:00Z', score: 1, previous_score: 120 },
      { flag: 'approve_now', evidence_ids: [] }] });
  assert.equal(run.origin, 'scheduler'); assert.equal(run.trigger_id, 'heavy_rain:hyd_17.30_78.35');
  assert.deepEqual(run.sentinel_flags.map(f => f.flag), ['contradicted']);
  assert.deepEqual(run.sentinel_flags[0].evidence_ids, [id]);
  assert.equal(lib.cleanRun({ id, trigger_event_id: id, trigger_id: '<script>' }).trigger_id, null);
  assert.equal(lib.cleanRun({ id, trigger_event_id: id, origin: 'admin' }).origin, 'operator');
  const open = lib.openRunFor([{ ...run, status: 'cancelled' }, run], '99999999-9999-4999-8999-999999999999', 'heavy_rain:hyd_17.30_78.35');
  assert.equal(open, run);
  assert.equal(lib.openRunFor([run], '99999999-9999-4999-8999-999999999999', null), null);
});