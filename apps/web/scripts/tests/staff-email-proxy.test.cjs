// Isolated staff email proxy tests. Synthetic sessions/fetch exist only in this loader; production auth-server and
// deployed routes are never replaced. Nothing here reaches an email provider.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

const root = path.join(__dirname, '../..');
const transpile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function run(code, deps) { const mod = { exports: {} }; new Function('require', 'module', 'exports', code)(deps, mod, mod.exports); return mod.exports; }

const CHECKER = { accessToken: 'unit-only-token', roles: ['incident_checker'] };
const ADMIN = { accessToken: 'unit-only-token', roles: ['platform_admin'] };

function load(session, { configured = true, origin = true } = {}) {
  return run(transpile('lib/staff-email-proxy.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return {
      configuration: () => configured ? { origin: 'http://localhost:3000' } : null,
      readSession: async () => session, sameOrigin: () => origin,
    };
    throw Error('Unexpected dependency ' + name);
  }).proxyStaffEmail;
}
async function withFetch(fn, body = { ok: true }, status = 200) {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(body), { status }); };
  try { await fn(calls); } finally { global.fetch = original; }
}
const req = (url, method = 'GET', body) => new Request('http://localhost:3000' + url, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });

test('signed-out, unconfigured, wrong role, wrong method and cross-origin writes never fetch', async () => {
  await withFetch(async calls => {
    assert.equal((await load(null)(req('/api/staff-messages/preference'), 'preference')).status, 401);
    assert.equal((await load(CHECKER, { configured: false })(req('/api/staff-messages/preference'), 'preference')).status, 503);
    assert.equal((await load({ accessToken: 't', roles: [] })(req('/api/staff-messages/preference'), 'preference')).status, 403);
    assert.equal((await load(CHECKER)(req('/api/staff-messages/log'), 'log')).status, 403);
    assert.equal((await load(CHECKER)(req('/api/staff-messages/test'), 'test')).status, 405);
    assert.equal((await load(CHECKER)(req('/api/staff-messages/preference', 'POST', { opted_in: true }), 'preference')).status, 405);
    assert.equal((await load(CHECKER, { origin: false })(req('/api/staff-messages/test', 'POST'), 'test')).status, 403);
    assert.equal((await load(CHECKER, { origin: false })(req('/api/staff-messages/preference', 'PUT', { opted_in: true }), 'preference')).status, 403);
    assert.equal((await load(CHECKER)(req('/api/staff-messages/preference?email=x@y.z'), 'preference')).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('only the opt-in flag is forwarded; a browser address is refused', async () => {
  await withFetch(async calls => {
    const proxy = load(CHECKER);
    for (const bad of [{ opted_in: true, email: 'attacker@evil.example' }, { opted_in: 'yes' }, {}, [], 'not json', { email: 'a@b.c' }, 'x'.repeat(500)])
      assert.ok([400, 413].includes((await proxy(req('/api/staff-messages/preference', 'PUT', bad), 'preference')).status), JSON.stringify(bad));
    assert.equal(calls.length, 0);
    const response = await proxy(req('/api/staff-messages/preference', 'PUT', { opted_in: true }), 'preference');
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'http://localhost:8000/v1/staff-messages/preference');
    assert.equal(calls[0].options.method, 'PUT');
    assert.equal(calls[0].options.body, '{"opted_in":true}');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
  });
});

test('the self-test and admin log forward to fixed API paths without a body', async () => {
  await withFetch(async calls => {
    assert.equal((await load(CHECKER)(req('/api/staff-messages/test', 'POST'), 'test')).status, 200);
    assert.equal((await load(ADMIN)(req('/api/staff-messages/log'), 'log')).status, 200);
    assert.deepEqual(calls.map(c => [c.url, c.options.method, c.options.body]), [
      ['http://localhost:8000/v1/staff-messages/test', 'POST', undefined],
      ['http://localhost:8000/v1/staff-messages/log', 'GET', undefined]]);
  });
});

test('upstream refusals become fixed replies and never pass the API body through', async () => {
  for (const [status, code] of [[401, 'SIGN_IN_REQUIRED'], [403, 'FORBIDDEN'], [404, 'host_switch_off']]) {
    await withFetch(async () => {
      const response = await load(CHECKER)(req('/api/staff-messages/preference'), 'preference');
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.code, code);
      assert.ok(!JSON.stringify(body).includes('leak'));
    }, { detail: 'leak internal detail' }, status);
  }
  await withFetch(async () => {
    const body = await (await load(CHECKER)(req('/api/staff-messages/preference', 'PUT', { opted_in: true }), 'preference')).json();
    assert.equal(body.code, 'verified_email_required');
  }, { detail: 'verified_email_required' }, 409);
  await withFetch(async () => {
    const body = await (await load(CHECKER)(req('/api/staff-messages/preference'), 'preference')).json();
    assert.equal(body.code, 'staff_messages_unavailable');
  }, { detail: 'Traceback: secret stuff' }, 503);
});

test('route files only call the proxy and role lists match the API', () => {
  for (const [file, methods] of [['preference', ['GET', 'PUT']], ['test', ['POST']], ['log', ['GET']]]) {
    const source = fs.readFileSync(path.join(root, `app/api/staff-messages/${file}/route.ts`), 'utf8');
    for (const method of methods) assert.match(source, new RegExp(`export async function ${method}\\(request: Request\\) \\{ return proxyStaffEmail\\(request, "${file}"\\); \\}`));
  }
  const api = fs.readFileSync(path.join(root, '../../services/api/app/staff_messages.py'), 'utf8');
  assert.match(api, /_staff = scoped_operator\(EXERCISE_RECORD_ROLES\)/);
  assert.match(api, /_admin = scoped_operator\(frozenset\(\{"platform_admin"\}\)\)/);
  const security = fs.readFileSync(path.join(root, '../../services/api/app/security.py'), 'utf8');
  const listed = security.match(/EXERCISE_RECORD_ROLES = frozenset\(\{([^}]*)\}\)/)[1].match(/"([a-z_]+)"/g).map(s => s.slice(1, -1)).sort();
  const proxy = fs.readFileSync(path.join(root, 'lib/staff-email-proxy.ts'), 'utf8');
  const staff = proxy.match(/STAFF_ROLES: Role\[\] = \[([^\]]*)\]/)[1].match(/"([a-z_]+)"/g).map(s => s.slice(1, -1)).sort();
  assert.deepEqual(staff, listed);
});

test('SMS and WhatsApp stay locked in the web registry view', () => {
  const sample = fs.readFileSync(path.join(root, 'lib/proactive-sample.ts'), 'utf8');
  assert.match(sample, /id: "comms_sms"[^\n]*delivery: "locked"/);
  assert.match(sample, /id: "comms_whatsapp"[^\n]*delivery: "locked"/);
  const admin = fs.readFileSync(path.join(root, 'components/connector-admin.tsx'), 'utf8');
  assert.match(admin, /const switchable = channel === null \|\| channel === "send";/);
});
