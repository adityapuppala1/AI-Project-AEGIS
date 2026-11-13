// Isolated brand proxy, brand helper and session-gate tests (docs/BRANDING.md). Synthetic sessions/fetch exist only
// in this loader; production auth-server and deployed routes are never replaced.
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

const brand = run(transpile('lib/brand.ts'), name => { throw Error('Unexpected dependency ' + name); });
const ADMIN = { accessToken: 'unit-only-token', roles: ['platform_admin'] };
const CHECKER = { accessToken: 'unit-only-token', roles: ['incident_checker'] };

function load(session, { configured = true, origin = true } = {}) {
  const apiAuth = run(transpile('lib/api-auth.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './auth-server') return { readSession: async () => session };
    throw Error('Unexpected dependency ' + name);
  });
  return run(transpile('lib/brand-proxy.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === 'react') return { cache: fn => fn };
    if (name === './auth-server') return { configuration: () => configured ? { origin: 'http://localhost:3000' } : null, sameOrigin: () => origin };
    if (name === './api-auth') return apiAuth;
    if (name === './brand') return brand;
    throw Error('Unexpected dependency ' + name);
  });
}
async function withFetch(fn, respond = () => new Response(JSON.stringify({ name: 'IndTrana', logo_version: null, version: 0 }), { status: 200 })) {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return respond(url, options); };
  try { await fn(calls); } finally { global.fetch = original; }
}
const req = (url, method = 'GET', body, headers) => new Request('http://localhost:3000' + url, { method, headers, ...(body === undefined ? {} : { body }) });
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

test('brand name rules mirror the API', () => {
  for (const ok of ['IndTrana', 'AB', 'Acme & Sons', "O'Neil Ops", 'Ops-Desk 2.0']) assert.equal(brand.checkBrandName(ok).ok, true, ok);
  const code = value => brand.checkBrandName(value).code;
  assert.equal(code('A'), 'brand_name_length');
  assert.equal(code('x'.repeat(41)), 'brand_name_length');
  assert.equal(code('<script>'), 'brand_name_characters');
  assert.equal(code('Two  spaces'), 'brand_name_characters');
  assert.equal(code('Bad' + String.fromCharCode(0) + 'Name'), 'brand_name_control_character');
  assert.equal(code('Line' + String.fromCharCode(10) + 'Break'), 'brand_name_control_character');
  assert.equal(code('Zero' + String.fromCharCode(0x200b) + 'Width'), 'brand_name_control_character');
  assert.equal(code('Bidi' + String.fromCharCode(0x202e) + 'Name'), 'brand_name_control_character');
  assert.equal(code(7), 'brand_name_invalid');
});

test('brand text substitution is plain and a no-op for the default', () => {
  assert.equal(brand.brandText('Sign in to IndTrana. IndTrana never sees it.', 'IndTrana'), 'Sign in to IndTrana. IndTrana never sees it.');
  assert.equal(brand.brandText('Sign in to IndTrana. IndTrana never sees it.', 'Acme Ops'), 'Sign in to Acme Ops. Acme Ops never sees it.');
  assert.equal(brand.brandText('IndTrana', 'IndTrana Pro'), 'IndTrana Pro');
  assert.equal(brand.brandText('No product name here', 'Acme'), 'No product name here');
});

test('a malformed public read falls back to the default brand', () => {
  assert.deepEqual(brand.parseBrand({ name: 'Acme', logo_version: 3, version: 3 }), { name: 'Acme', logoVersion: 3, version: 3 });
  for (const bad of [null, [], 'x', { name: '<b>', logo_version: null, version: 1 }, { name: 'Acme', logo_version: -1, version: 1 },
    { name: 'Acme', logo_version: null, version: 'x' }, { name: ' Acme', logo_version: null, version: 1 }])
    assert.deepEqual(brand.parseBrand(bad), brand.DEFAULT_BRAND, JSON.stringify(bad));
  assert.equal(brand.brandLogoUrl({ name: 'A1', logoVersion: 4, version: 4 }), '/api/brand/logo?v=4');
  assert.equal(brand.brandLogoUrl(brand.DEFAULT_BRAND), null);
});

test('logo type is decided by magic bytes; SVG, GIF and HTML are refused', () => {
  const bytes = text => Uint8Array.from(Buffer.from(text, 'binary'));
  assert.equal(brand.sniffLogoType(PNG), 'image/png');
  assert.equal(brand.sniffLogoType(bytes('\xff\xd8\xff\xe0')), 'image/jpeg');
  assert.equal(brand.sniffLogoType(bytes('RIFF\x00\x00\x00\x00WEBPVP8X')), 'image/webp');
  for (const bad of ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'GIF89a', '<!doctype html>', '\x00\x00\x01\x00'])
    assert.equal(brand.sniffLogoType(bytes(bad)), null, bad);
});

test('public read answers only name and logo version, and the defaults when the API fails', async () => {
  await withFetch(async calls => {
    const response = await load(null).publicBrand();
    assert.deepEqual(await response.json(), { name: 'IndTrana', logo_version: null, version: 0 });
    assert.equal(calls[0].url, 'http://localhost:8000/v1/brand');
    assert.equal(calls[0].options.headers, undefined, 'the public read never carries a bearer');
  }, () => new Response(JSON.stringify({ name: 'IndTrana', logo_version: null, version: 0, extra: 'dropped' }), { status: 200 }));
  for (const respond of [() => { throw new Error('down'); }, () => new Response('{}', { status: 503 }), () => new Response('not json', { status: 200 })]) {
    await withFetch(async () => assert.deepEqual(await (await load(null).publicBrand()).json(), { name: 'IndTrana', logo_version: null, version: 0 }), respond);
  }
});

test('public logo is passed through only with an allowlisted type and safe headers', async () => {
  await withFetch(async () => {
    const response = await load(null).publicLogo();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /^default-src 'none'/);
    assert.equal(response.headers.get('content-disposition'), 'inline; filename="brand-logo.png"');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  }, () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }));
  for (const type of ['image/svg+xml', 'text/html', 'image/gif', '']) {
    await withFetch(async () => assert.equal((await load(null).publicLogo()).status, 404, type),
      () => new Response('<svg/>', { status: 200, headers: type ? { 'content-type': type } : {} }));
  }
});

test('admin routes refuse signed-out, other roles, wrong method and cross-origin writes without fetching', async () => {
  await withFetch(async calls => {
    assert.equal((await load(null).proxyBrandAdmin(req('/api/brand/admin/settings'), 'settings')).status, 401);
    assert.equal((await load(null).proxyBrandAdmin(req('/api/brand/admin/name', 'PUT', '{"name":"Acme","expected_version":0}'), 'name')).status, 401);
    assert.equal((await load(CHECKER).proxyBrandAdmin(req('/api/brand/admin/name', 'PUT', '{"name":"Acme","expected_version":0}'), 'name')).status, 403);
    assert.equal((await load(ADMIN, { configured: false }).proxyBrandAdmin(req('/api/brand/admin/settings'), 'settings')).status, 503);
    assert.equal((await load(ADMIN).proxyBrandAdmin(req('/api/brand/admin/name'), 'name')).status, 405);
    assert.equal((await load(ADMIN, { origin: false }).proxyBrandAdmin(req('/api/brand/admin/reset', 'POST', '{"expected_version":0}'), 'reset')).status, 403);
    assert.equal((await load(ADMIN, { origin: false }).proxyBrandAdmin(req('/api/brand/admin/logo?expected_version=0', 'PUT', PNG), 'logo')).status, 403);
    assert.equal((await load(ADMIN).proxyBrandAdmin(req('/api/brand/admin/settings?x=1'), 'settings')).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('name and reset bodies are checked and re-encoded; bad names never reach the API', async () => {
  await withFetch(async calls => {
    const proxy = load(ADMIN).proxyBrandAdmin;
    for (const bad of ['{"name":"Acme"}', '{"name":"Acme","expected_version":0,"logo":"x"}', 'not json', '[]', '{"name":"Acme","expected_version":-1}', 'x'.repeat(400)])
      assert.ok([400, 413].includes((await proxy(req('/api/brand/admin/name', 'PUT', bad), 'name')).status), bad);
    const refused = await proxy(req('/api/brand/admin/name', 'PUT', '{"name":"<img src=x>","expected_version":0}'), 'name');
    assert.equal(refused.status, 422);
    assert.equal((await refused.json()).code, 'brand_name_characters');
    assert.equal(calls.length, 0);
    assert.equal((await proxy(req('/api/brand/admin/name', 'PUT', '{"name":"  Acme Ops ","expected_version":2}'), 'name')).status, 200);
    assert.equal((await proxy(req('/api/brand/admin/reset', 'POST', '{"expected_version":3}'), 'reset')).status, 200);
    assert.deepEqual(calls.map(c => [c.url, c.options.method, c.options.body, c.options.headers.Authorization]), [
      ['http://localhost:8000/v1/brand/name', 'PUT', '{"name":"Acme Ops","expected_version":2}', 'Bearer unit-only-token'],
      ['http://localhost:8000/v1/brand/reset', 'POST', '{"expected_version":3}', 'Bearer unit-only-token']]);
  }, () => new Response('{"name":"Acme Ops","version":3}', { status: 200 }));
});

test('logo upload enforces the size cap before forwarding and passes only expected_version', async () => {
  await withFetch(async calls => {
    const proxy = load(ADMIN).proxyBrandAdmin;
    const big = new Uint8Array(256 * 1024 + 1);
    assert.equal((await proxy(req('/api/brand/admin/logo?expected_version=0', 'PUT', big), 'logo')).status, 413);
    assert.equal((await proxy(req('/api/brand/admin/logo?expected_version=0', 'PUT', PNG, { 'content-length': '999999' }), 'logo')).status, 413);
    assert.equal((await proxy(req('/api/brand/admin/logo', 'PUT', PNG), 'logo')).status, 400);
    assert.equal((await proxy(req('/api/brand/admin/logo?expected_version=0&url=http://x', 'PUT', PNG), 'logo')).status, 400);
    assert.equal((await proxy(req('/api/brand/admin/logo?expected_version=abc', 'PUT', PNG), 'logo')).status, 400);
    assert.equal(calls.length, 0);
    const ok = await proxy(req('/api/brand/admin/logo?expected_version=5', 'PUT', PNG), 'logo');
    assert.equal(ok.status, 200);
    assert.equal(calls[0].url, 'http://localhost:8000/v1/brand/logo?expected_version=5');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/octet-stream');
    assert.deepEqual([...new Uint8Array(calls[0].options.body)], [...PNG]);
  }, () => new Response('{"version":6}', { status: 200 }));
});

test('upstream refusals become fixed replies; only brand codes pass through', async () => {
  const cases = [[401, '{"detail":"x"}', 'SIGN_IN_REQUIRED'], [403, '{"detail":"x"}', 'FORBIDDEN'],
    [409, '{"detail":"brand_version_conflict"}', 'brand_version_conflict'], [415, '{"detail":"brand_logo_unsupported_type"}', 'brand_logo_unsupported_type'],
    [500, '{"detail":"Traceback <secret>"}', 'brand_unavailable']];
  for (const [status, body, code] of cases) {
    await withFetch(async () => {
      const response = await load(ADMIN).proxyBrandAdmin(req('/api/brand/admin/settings'), 'settings');
      assert.equal(response.status, status);
      assert.equal((await response.json()).code, code);
    }, () => new Response(body, { status }));
  }
});

test('session gate opens exactly the public brand read and nothing under /api/brand/admin', () => {
  const gate = run(transpile('lib/session-gate.ts'), name => { if (name === 'jose') return require('jose'); throw Error(name); });
  for (const open of ['/api/brand', '/api/brand/logo']) assert.ok(gate.isPublicPath(open), open);
  for (const closed of ['/api/brand/admin/settings', '/api/brand/admin/name', '/api/brand/admin/logo', '/api/brand/admin/reset',
    '/api/brand/admin/audit', '/api/brand/', '/api/brand/logo/x', '/api/brandx', '/admin/brand'])
    assert.ok(!gate.isPublicPath(closed), closed);
  assert.equal(gate.safeReturnPath('/api/brand'), null);
});

test('every brand route file exports only its method and the admin routes use the admin proxy', () => {
  const dir = path.join(root, 'app/api/brand');
  assert.match(fs.readFileSync(path.join(dir, 'route.ts'), 'utf8'), /export async function GET\(\) \{ return publicBrand\(\); \}/);
  assert.match(fs.readFileSync(path.join(dir, 'logo/route.ts'), 'utf8'), /export async function GET\(request: Request\) \{ return publicLogo\(request\); \}/);
  for (const [route, method] of [['settings', 'GET'], ['name', 'PUT'], ['logo', 'PUT'], ['reset', 'POST'], ['audit', 'GET']]) {
    const source = fs.readFileSync(path.join(dir, 'admin', route, 'route.ts'), 'utf8');
    assert.match(source, new RegExp(`export async function ${method}\\(request: Request\\) \\{ return proxyBrandAdmin\\(request, "${route}"\\); \\}`));
    assert.equal((source.match(/export async function/g) || []).length, 1, route);
  }
});

test('outbound text never reads the configured brand', () => {
  for (const file of ['lib/staff-email-proxy.ts', 'lib/situation-brief.ts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/brand-provider|useBrand|lib\/brand|"\.\/brand"/.test(source), file);
  }
});

test('logo revalidation: only a well-formed version tag is forwarded and a 304 carries no body', async () => {
  await withFetch(async calls => {
    const response = await load(null).publicLogo(req('/api/brand/logo', 'GET', undefined, { 'if-none-match': '"brand-logo-3", <script>, "x"' }));
    assert.equal(response.status, 304);
    assert.equal(response.headers.get('etag'), '"brand-logo-3"');
    assert.equal(await response.text(), '');
    assert.equal(calls[0].options.headers['If-None-Match'], '"brand-logo-3"');
  }, () => new Response(null, { status: 304, headers: { etag: '"brand-logo-3"' } }));
  await withFetch(async calls => {
    await load(null).publicLogo(req('/api/brand/logo', 'GET', undefined, { 'if-none-match': 'garbage' }));
    assert.equal(calls[0].options.headers, undefined);
  }, () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', etag: '"brand-logo-1"' } }));
});

test('admin JSON bodies are read through the byte cap', async () => {
  await withFetch(async calls => {
    const proxy = load(ADMIN).proxyBrandAdmin;
    const multibyte = '{"name":"' + 'ఆ'.repeat(120) + '","expected_version":0}';  // under 300 characters, over 300 bytes
    assert.equal((await proxy(req('/api/brand/admin/name', 'PUT', multibyte), 'name')).status, 413);
    assert.equal((await proxy(req('/api/brand/admin/name', 'PUT', '{"name":"Acme","expected_version":0}', { 'content-length': '99999' }), 'name')).status, 413);
    assert.equal(calls.length, 0);
  });
});

test('substitution is single pass and never rewrites record content', () => {
  assert.equal(brand.brandText('Sign in to IndTrana.', 'IndTrana East'), 'Sign in to IndTrana East.');
  assert.equal(brand.brandText('IndTrana and IndTrana', 'IndTrana East'), 'IndTrana East and IndTrana East');
  const provider = fs.readFileSync(path.join(root, 'components/brand-provider.tsx'), 'utf8');
  assert.ok(!/MutationObserver|nodeValue|createTreeWalker|textContent/.test(provider), 'no page-wide text rewriting');
  const language = fs.readFileSync(path.join(root, 'components/language-provider.tsx'), 'utf8');
  assert.match(language, /INTERFACE_TEXT\.has\(text\) \? brandText\(out, brand\.name\) : out/);
  // A record string (not a reviewed interface string) that names the product is shown unchanged.
  const tr = run(transpile('lib/translations.ts'), name => { if (name.startsWith('./translations')) return run(transpile('lib/' + name.slice(2) + (name.endsWith('.ts') ? '' : '.ts')), () => ({})); throw Error(name); });
  const record = 'Operator note: IndTrana drill went well';
  assert.ok(!tr.TRANSLATION_ENTRIES.some(entry => entry[0] === record));
  const pending = run(transpile('lib/translations-pending.ts'), () => ({}));
  assert.ok(!pending.PENDING_NATIVE_REVIEW.includes(record));
});

test('stored record ids keep their spelling but are shown by a plain title, the raw id only in a title attribute', () => {
  const labels = run(transpile('lib/labels.ts'), name => { throw Error('Unexpected dependency ' + name); });
  assert.equal(labels.recordIdTitle('AEGIS-URBAN-FLOOD-EXERCISE-v0.1'), 'IndTrana urban flood exercise playbook v0.1');
  assert.equal(labels.recordIdTitle('AEGIS-EXERCISE-ONLY'), 'Exercise-only source');
  assert.equal(labels.codeLabel('aegis.exercise.audit360.v1'), 'IndTrana exercise audit360 v1');
  for (const file of ['components/agency-sync.tsx', 'components/audit360-dashboard.tsx', 'components/assessment-readiness.tsx',
    'components/demo-journey.tsx', 'components/exercise-review-brief.tsx', 'app/approvals/page.tsx', 'app/playbooks/page.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.includes('recordIdTitle('), file);
    // The raw id never appears as JSX text: only inside a title attribute, a comparison or a type.
    assert.ok(!/[>}][^<>{}"'=]*AEGIS-URBAN-FLOOD-EXERCISE-v0\.1[^<>{}"']*</.test(source), file);
  }
  // The audit export and readiness routes still demand the real stored id.
  for (const file of ['app/api/incidents/[id]/audit/route.ts', 'app/api/incidents/[id]/readiness/route.ts'])
    assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes('"AEGIS-URBAN-FLOOD-EXERCISE-v0.1"'), file);
});
