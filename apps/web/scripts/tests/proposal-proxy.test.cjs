// Isolated proxy tests. Synthetic sessions/fetch exist only in this test loader;
// production auth-server and deployed routes are never replaced or enabled.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const id = '77777777-7777-4777-8777-777777777777';

function loadProxy(session = { accessToken: 'unit-only-token', roles: ['incident_auditor'] }, configured = true) {
  const source = fs.readFileSync(path.join(__dirname, '../../lib/proposal-proxy.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const dependencies = name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return {
      configuration: () => configured ? { origin: 'http://localhost:3000' } : null,
      readSession: async () => session,
      sameOrigin: () => true,
    };
    throw Error('Unexpected dependency ' + name);
  };
  new Function('require', 'module', 'exports', code)(dependencies, module, module.exports);
  return module.exports.proxyProposals;
}
const request = () => new Request('http://localhost:3000/api/proposals/' + id + '/cap-draft');

async function withFetch(response, run) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return response; };
  try { await run(calls); } finally { global.fetch = original; }
}

test('XML download preserves body and sets private safe attachment headers', async () => {
  const xml = '<?xml version="1.0"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><status>Draft</status></alert>';
  await withFetch(new Response(xml, { headers: { 'Content-Type': 'application/xml' } }), async calls => {
    const result = await loadProxy()(request(), id, 'cap-draft');
    assert.equal(result.status, 200);
    assert.equal(await result.text(), xml);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(result.headers.get('content-disposition'), `attachment; filename="aegis-exercise-${id}-draft.xml"`);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/v1/exercise/proposals/' + id + '/cap-draft'));
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.equal(calls[0].options.cache, 'no-store');
  });
});

for (const status of [404, 409]) {
  test('API denial ' + status + ' stays JSON, without a download attachment', async () => {
    await withFetch(new Response(JSON.stringify({ detail: 'Denied' }), { status }), async () => {
      const result = await loadProxy()(request(), id, 'cap-draft');
      assert.equal(result.status, status);
      assert.equal(result.headers.get('content-disposition'), null);
      assert.deepEqual(await result.json(), { detail: 'Denied' });
    });
  });
}

test('unexpected successful backend type fails closed', async () => {
  await withFetch(new Response('{}', { headers: { 'Content-Type': 'application/json' } }), async () => {
    assert.equal((await loadProxy()(request(), id, 'cap-draft')).status, 502);
  });
});

test('disabled configuration, signed-out access and absent roles never fetch', async () => {
  await withFetch(null, async calls => {
    assert.equal((await loadProxy(null, false)(request(), id, 'cap-draft')).status, 503);
    assert.equal((await loadProxy(null)(request(), id, 'cap-draft')).status, 401);
    assert.equal((await loadProxy({ roles: [], accessToken: 'unit-only-token' })(request(), id, 'cap-draft')).status, 403);
    assert.equal((await loadProxy()(request(), '../invalid', 'cap-draft')).status, 400);
    assert.equal(calls.length, 0);
  });
});

const writeRequest = body => new Request('http://localhost:3000/api/proposals/' + id + '/transition', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify(body),
});
for (const operation of ['prepare_tasks', 'acknowledge_task', 'close_task']) {
  test('operator task write ' + operation + ' forwards only validated fields', async () => {
    const body = { operation, rationale: 'SIMULATION: desk reviewed', ...(operation === 'prepare_tasks' ? {} : { task_id: 'control_room' }) };
    await withFetch(new Response('{}', { headers: { 'Content-Type': 'application/json' } }), async calls => {
      const response = await loadProxy({ accessToken: 'unit-only-token', roles: ['incident_operator'] })(writeRequest(body), id);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(calls[0].options.body), body);
    });
  });
}

test('checker-only task writes and forged/missing task fields never fetch', async () => {
  await withFetch(null, async calls => {
    const checker = loadProxy({ accessToken: 'unit-only-token', roles: ['incident_checker'] });
    assert.equal((await checker(writeRequest({ operation: 'prepare_tasks' }), id)).status, 403);
    const operator = loadProxy({ accessToken: 'unit-only-token', roles: ['incident_operator'] });
    for (const body of [
      { operation: 'acknowledge_task', rationale: 'SIMULATION: missing task' },
      { operation: 'close_task', task_id: 'unregistered', rationale: 'SIMULATION: invalid task' },
      { operation: 'close_task', task_id: 'control_room', rationale: 'short' },
      { operation: 'prepare_tasks', task_id: 'control_room' },
      { operation: 'acknowledge_task', task_id: 'control_room', rationale: 'SIMULATION: forged actor', actor_subject: 'forged' },
    ]) assert.equal((await operator(writeRequest(body), id)).status, 400);
    assert.equal(calls.length, 0);
  });
});
