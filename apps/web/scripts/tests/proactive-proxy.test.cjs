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

test('public watch reads need no session, are cleaned and not cached; backend errors stay generic', async () => {
  const good = { id, connector_id: 'open_meteo', hazard: 'flood', observed_at: '2026-01-01T00:00:00Z', lat: 17, lon: 78, value: 1, unit: 'mm', stale: false };
  await withFetch(json({ generated_at: '2026-01-01T00:00:00Z', config_version: 'v1', disclaimer: 'x', evidence: [good, { ...good, id: 'bad' }], triggers: [] }), async calls => {
    const result = await loadProxy(null)(req('GET', '/api/proactive/watch'), 'watch');
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal((await result.json()).evidence.length, 1);
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.equal((await loadProxy(null)(req('GET', '/x?days=99'), 'watch_history')).status, 400);
    assert.equal((await loadProxy(null)(req('POST', '/x', {}), 'watch')).status, 401);
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
