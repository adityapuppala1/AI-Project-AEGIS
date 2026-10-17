// Isolated proxy tests. Synthetic sessions/fetch exist only in this test loader;
// production auth-server and deployed routes are never replaced or enabled.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const id = '77777777-7777-4777-8777-777777777777';

function loadProxy(session = { accessToken: 'unit-only-token', roles: ['department_operator'], departmentId: 'infrastructure' }, configured = true) {
  const source = fs.readFileSync(path.join(__dirname, '../../lib/department-proxy.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const dependencies = name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return {
      configuration: () => configured ? { origin: 'http://localhost:3000' } : null,
      readSession: async () => session,
      sameOrigin: request => request.headers.get('origin') === 'http://localhost:3000',
    };
    throw Error('Unexpected dependency ' + name);
  };
  new Function('require', 'module', 'exports', code)(dependencies, module, module.exports);
  return module.exports.proxyDepartmentTasks;
}
const request = () => new Request('http://localhost:3000/api/proposals/' + id + '/cap-draft');

async function withFetch(response, run) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return response; };
  try { await run(calls); } finally { global.fetch = original; }
}


const post = payload => new Request('http://localhost:3000/api/department-tasks/' + id + '/transition', {
  method: 'POST', headers: { origin: 'http://localhost:3000' }, body: JSON.stringify(payload),
});
test('department task forwards only operation and rationale', async () => {
  await withFetch(new Response('{"status":"approved"}'), async calls => {
    const response = await loadProxy()(post({ operation: 'acknowledge_task', rationale: 'Reviewed exercise evidence', task_id: 'infrastructure', expected_assignment_version: 0 }), id);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.deepEqual(JSON.parse(calls[0].options.body), { operation: 'acknowledge_task', rationale: 'Reviewed exercise evidence', task_id: 'infrastructure', expected_assignment_version: 0 });
  });
});
for (const extra of [{ task_id: 'unknown' }, { department_id: 'communications' }, { operation: 'approve' }]) {
  test('reject authority override ' + JSON.stringify(extra), async () => {
    await withFetch(new Response('{}'), async calls => {
      assert.equal((await loadProxy()(post({ operation: 'close_task', task_id: 'infrastructure', expected_assignment_version: 0, rationale: 'Reviewed exercise evidence', ...extra }), id)).status, 400);
      assert.equal(calls.length, 0);
    });
  });
}
for (const session of [null, { roles: ['incident_operator'] }, { roles: ['department_operator'] }]) {
  test('refuses missing department session ' + JSON.stringify(session), async () => {
    await withFetch(new Response('{}'), async calls => {
      assert.ok([401, 403].includes((await loadProxy(session)(request())).status));
      assert.equal(calls.length, 0);
    });
  });
}
test('cross-origin task write refused', async () => {
  const req = post({ operation: 'close_task', rationale: 'Reviewed exercise evidence' });
  req.headers.set('origin', 'https://other.test');
  assert.equal((await loadProxy()(req, id)).status, 403);
});
