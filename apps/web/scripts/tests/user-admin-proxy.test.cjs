// Isolated user administration proxy and UI rule tests (docs/USER_MANAGEMENT.md). Synthetic sessions and fetch exist
// only in this loader; production auth-server and deployed routes are never replaced.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const transpile = file => ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function run(code, deps) { const mod = { exports: {} }; new Function('require', 'module', 'exports', code)(deps, mod, mod.exports); return mod.exports; }

const ADMIN = { accessToken: 'unit-only-token', roles: ['platform_admin'] };
const MAKER = { accessToken: 'unit-only-token', roles: ['incident_operator'] };
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function load(session, { configured = true, origin = true } = {}) {
  const apiAuth = run(transpile('lib/api-auth.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return { readSession: async () => session };
    throw Error('Unexpected dependency ' + name);
  });
  return run(transpile('lib/user-admin-proxy.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return { configuration: () => configured ? { origin: 'http://localhost:3000' } : null, sameOrigin: () => origin };
    if (name === './api-auth') return apiAuth;
    throw Error('Unexpected dependency ' + name);
  });
}
async function withFetch(fn, respond = () => new Response('{"accounts":[]}', { status: 200 })) {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return respond(url, options); };
  try { await fn(calls); } finally { global.fetch = original; }
}
const req = (url, method = 'GET', body, headers) => new Request('http://localhost:3000' + url, { method, headers, ...(body === undefined ? {} : { body }) });
const NEW = JSON.stringify({ username: 'umtest-ops', first_name: 'Uma', last_name: 'Test', email: 'u@example.invalid', role: 'incident_operator' });

test('refuses signed-out, other roles, wrong method, cross-origin writes and bad ids without fetching', async () => {
  await withFetch(async calls => {
    assert.equal((await load(null).proxyUserAdmin(req('/api/user-admin/accounts'), 'accounts')).status, 401);
    assert.equal((await load(MAKER).proxyUserAdmin(req('/api/user-admin/accounts'), 'accounts')).status, 403);
    assert.equal((await load(MAKER).proxyUserAdmin(req('/api/user-admin/accounts', 'POST', NEW), 'create')).status, 403);
    assert.equal((await load(ADMIN, { configured: false }).proxyUserAdmin(req('/api/user-admin/status'), 'status')).status, 503);
    assert.equal((await load(ADMIN).proxyUserAdmin(req('/api/user-admin/accounts', 'DELETE'), 'accounts')).status, 405);
    assert.equal((await load(ADMIN, { origin: false }).proxyUserAdmin(req('/api/user-admin/accounts', 'POST', NEW), 'create')).status, 403);
    assert.equal((await load(ADMIN, { origin: false }).proxyUserAdmin(req(`/api/user-admin/accounts/${ID}/disable`, 'POST'), 'disable', ID)).status, 403);
    assert.equal((await load(ADMIN).proxyUserAdmin(req('/api/user-admin/accounts/x/disable', 'POST'), 'disable', '../x')).status, 404);
    assert.equal((await load(ADMIN).proxyUserAdmin(req('/api/user-admin/accounts?x=1'), 'accounts')).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('bodies are allowlisted, size-capped and re-encoded; unknown fields never reach the API', async () => {
  await withFetch(async calls => {
    const proxy = load(ADMIN).proxyUserAdmin;
    for (const bad of [JSON.stringify({ ...JSON.parse(NEW), password: 'x' }), JSON.stringify({ ...JSON.parse(NEW), enabled: true }),
      JSON.stringify({ username: 'a' }), '[]', 'not json', JSON.stringify({ ...JSON.parse(NEW), first_name: 'A\u0000' }),
      JSON.stringify({ ...JSON.parse(NEW), email: 7 })])
      assert.equal((await proxy(req('/api/user-admin/accounts', 'POST', bad), 'create')).status, 400, bad);
    assert.equal((await proxy(req('/api/user-admin/accounts', 'POST', 'x'.repeat(3000)), 'create')).status, 413);
    assert.equal((await proxy(req(`/api/user-admin/accounts/${ID}/enable`, 'POST', '{"force":true}'), 'enable', ID)).status, 400);
    assert.equal((await proxy(req(`/api/user-admin/accounts/${ID}`, 'PATCH', '{}'), 'edit', ID)).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await proxy(req('/api/user-admin/accounts', 'POST', NEW), 'create')).status, 200);
    assert.equal((await proxy(req(`/api/user-admin/accounts/${ID}`, 'PATCH', '{"role":"department_operator","department":"control_room","team":null}'), 'edit', ID)).status, 200);
    assert.equal((await proxy(req(`/api/user-admin/accounts/${ID}/reset-password`, 'POST'), 'reset-password', ID)).status, 200);
    assert.deepEqual(calls.map(c => [c.url, c.options.method, c.options.headers.Authorization]), [
      ['http://localhost:8000/v1/user-admin/accounts', 'POST', 'Bearer unit-only-token'],
      [`http://localhost:8000/v1/user-admin/accounts/${ID}`, 'PATCH', 'Bearer unit-only-token'],
      [`http://localhost:8000/v1/user-admin/accounts/${ID}/reset-password`, 'POST', 'Bearer unit-only-token']]);
    assert.deepEqual(JSON.parse(calls[1].options.body), { role: 'department_operator', department: 'control_room', team: null });
  }, () => new Response('{"ok":true}', { status: 200 }));
});

test('a temporary password passes through once with no-store; upstream failures become fixed codes', async () => {
  await withFetch(async () => {
    const response = await load(ADMIN).proxyUserAdmin(req(`/api/user-admin/accounts/${ID}/reset-password`, 'POST'), 'reset-password', ID);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).temporary_password, 'Unit0nlyPassw0rdXYZa');
  }, () => new Response('{"temporary_password":"Unit0nlyPassw0rdXYZa"}', { status: 200 }));
  const cases = [[401, '{"detail":"x"}', 'SIGN_IN_REQUIRED'], [403, '{"detail":"Exercise records are limited to the exercise agency"}', 'FORBIDDEN'],
    [403, '{"detail":"user_admin_protected"}', 'user_admin_protected'], [403, '{"detail":"user_admin_self_change"}', 'user_admin_self_change'],
    [409, '{"detail":"user_admin_last_admin"}', 'user_admin_last_admin'], [503, '{"detail":"user_admin_not_configured"}', 'user_admin_not_configured'],
    [500, '{"detail":"Traceback <secret>"}', 'user_admin_unavailable'], [422, '{"detail":[{"loc":["body"]}]}', 'user_admin_unavailable']];
  for (const [status, body, code] of cases) {
    await withFetch(async () => {
      const response = await load(ADMIN).proxyUserAdmin(req('/api/user-admin/accounts'), 'accounts');
      assert.equal(response.status, status);
      assert.equal((await response.json()).code, code);
    }, () => new Response(body, { status }));
  }
});

test('every user-admin route file exports only its method and uses the proxy', () => {
  const dir = 'app/api/user-admin';
  const expect = [['status/route.ts', ['GET'], 'status'], ['audit/route.ts', ['GET'], 'audit'], ['accounts/route.ts', ['GET', 'POST'], null],
    ['accounts/[id]/route.ts', ['PATCH'], 'edit'], ['accounts/[id]/enable/route.ts', ['POST'], 'enable'],
    ['accounts/[id]/disable/route.ts', ['POST'], 'disable'], ['accounts/[id]/reset-password/route.ts', ['POST'], 'reset-password'],
    ['accounts/[id]/sign-out/route.ts', ['POST'], 'sign-out']];
  for (const [file, methods, route] of expect) {
    const source = read(`${dir}/${file}`);
    const found = [...source.matchAll(/export async function (\w+)/g)].map(m => m[1]);
    assert.deepEqual(found, methods, file);
    assert.ok(/return proxyUserAdmin\(request, "/.test(source), file);
    if (route) assert.ok(source.includes(`"${route}"`), file);
  }
});

test('the session gate keeps every user-admin route and the page behind sign-in', () => {
  const gate = run(transpile('lib/session-gate.ts'), name => { if (name === 'jose') return require('jose'); throw Error(name); });
  for (const closed of ['/api/user-admin/status', '/api/user-admin/accounts', `/api/user-admin/accounts/${ID}/reset-password`, '/api/user-admin/audit', '/admin/users'])
    assert.ok(!gate.isPublicPath(closed), closed);
});

test('the UI shows the password once, from memory only, with no storage and no transport', () => {
  const ui = read('components/user-accounts.tsx');
  assert.ok(!/localStorage|sessionStorage|indexedDB|console\./.test(ui), 'no storage or console');
  assert.ok(!/mailto:|navigator\.share|sendBeacon/.test(ui), 'no transport');
  assert.match(ui, /dismissible=\{false\}/, 'the password panel closes only with its own button');
  assert.match(ui, /setIssued\(null\)/, 'closing the panel clears the password');
  assert.match(ui, /t\("Shown once\./);
  const proxy = read('lib/user-admin-proxy.ts');
  assert.ok(!/console\./.test(proxy));
  const labels = run(transpile('lib/labels.ts'), name => { throw Error('Unexpected dependency ' + name); });
  for (const code of ['user_admin_not_configured', 'user_admin_protected', 'user_admin_self_change', 'user_admin_last_admin', 'user_admin_username_taken', 'FORBIDDEN']) {
    const sentence = labels.apiFailureText({ code });
    assert.ok(sentence && !sentence.includes('_') && sentence !== labels.API_CODE_FALLBACK, code);
  }
});

test('the role matrix names the user-admin proxy and only administrators manage accounts', () => {
  const roles = run(transpile('lib/roles.ts'), () => ({}));
  const row = roles.CAPABILITIES.find(item => item.id === 'manage_accounts');
  assert.deepEqual(row.roles, ['platform_admin']);
  assert.equal(row.rule, 'lib/user-admin-proxy.ts');
  assert.match(read('lib/user-admin-proxy.ts'), /const ADMIN_ROLES = \["platform_admin"\] as const;/);
  assert.match(fs.readFileSync(path.join(root, '../../services/api/app/user_admin.py'), 'utf8'), /scoped_operator\(frozenset\(\{"platform_admin"\}\)\)/);
});
