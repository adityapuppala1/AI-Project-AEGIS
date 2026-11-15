const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
function load(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = request => request.startsWith('.') ? load(path.posix.join(path.posix.dirname(file), request) + '.ts') : require(request);
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports;
}
const kit = load('components/ui/helpers.ts');
const b = load('lib/bhuvan.ts');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('data-origin badge has exactly three kinds, each with words and a distinct tone', () => {
  assert.deepEqual([...kit.ORIGINS], ['live', 'synthetic', 'public_reference']);
  assert.equal(kit.originLabel('live', 'Bhuvan'), 'Live · Bhuvan');
  assert.equal(kit.originLabel('live', '  '), 'Live');
  assert.equal(kit.originLabel('synthetic'), 'Synthetic');
  assert.equal(kit.originLabel('public_reference'), 'Public reference');
  assert.equal(new Set(Object.values(kit.ORIGIN_TONE)).size, 3);
  const component = read('components/ui/origin.tsx');
  assert.match(component, /aria-hidden="true"/, 'icon is decorative; the text carries the meaning');
  assert.match(component, /Radio|FlaskConical|Globe2/);
});

test('query is rebuilt from validated numbers inside India only', () => {
  const q = s => b.bhuvanQuery('place', new URLSearchParams(s));
  assert.equal(q('lat=17.385&lon=78.4867'), 'lat=17.385&lon=78.4867');
  for (const bad of ['lat=51.5&lon=0.1', 'lat=17&lon=200', 'lat=1e2&lon=78', 'lat=17;drop&lon=78', 'lat=&lon=78', 'lon=78'])
    assert.equal(q(bad), null, bad);
  assert.equal(b.bhuvanQuery('route', new URLSearchParams('lat1=17.3&lon1=78.4&lat2=17.4&lon2=78.5')), 'lat1=17.3&lon1=78.4&lat2=17.4&lon2=78.5');
  assert.equal(b.bhuvanQuery('route', new URLSearchParams('lat1=17.3&lon1=78.4&lat2=50&lon2=78.5')), null);
  assert.equal(b.bhuvanQuery('village', new URLSearchParams('name=Sekuru')), 'name=Sekuru');
  assert.equal(b.bhuvanQuery('village', new URLSearchParams('name=<script>')), null);
});

test('live answer cleaner insists on classification, display-only and an as-of time', () => {
  const ok = { classification: 'live', display_only: true, writes_to_database: false, kind: 'place', fetched_at: '2026-11-15T06:00:00Z',
    fields: [{ key: 'village_name', value: '<b>Sekuru</b>' }, { key: '__proto__ bad key!', value: 'x' }], records: [], path: [[17.3, 78.4], [99, 300]], distance_km: 2.5 };
  const clean = b.cleanBhuvanLive(ok);
  assert.equal(clean.attribution, 'Data: Bhuvan, NRSC/ISRO');
  assert.deepEqual(clean.fields, [{ key: 'village_name', value: 'bSekuru/b' }]);
  assert.equal(clean.path.length, 1);
  assert.throws(() => b.cleanBhuvanLive({ ...ok, classification: 'synthetic' }));
  assert.throws(() => b.cleanBhuvanLive({ ...ok, writes_to_database: true }));
  assert.throws(() => b.cleanBhuvanLive({ ...ok, fetched_at: 'yesterday' }));
  assert.equal(b.bhuvanCode('something_else'), 'bhuvan_unavailable');
  for (const code of b.BHUVAN_CODES) assert.ok(b.BHUVAN_CODE_TEXT[code], code);
});

test('token list cleaner keeps flags only, never a value', () => {
  const out = b.cleanBhuvanTokens({ themes: [{ theme: 'routing', label: 'Routing', set: true, saved_at: '2026-11-15T06:00:00Z', expires_at: '2026-11-16T06:00:00Z', expired: false, enabled: true, value: 'SECRET' }, { theme: 'nope' }] });
  assert.equal(out.themes.length, 1);
  assert.ok(!JSON.stringify(out).includes('SECRET'));
  assert.equal(b.hoursLeft('2026-11-16T06:00:00Z', Date.parse('2026-11-15T06:00:00Z')), 24);
  assert.equal(b.hoursLeft(null, 0), null);
});

test('mutating Bhuvan route goes through the origin-checking proxy; the reference route is GET only', () => {
  const testRoute = read('app/api/proactive/bhuvan/tokens/[theme]/test/route.ts');
  assert.match(testRoute, /export async function POST/);
  assert.match(testRoute, /proxyProactive\(request, "bhuvan_token_test"/);
  const proxy = read('lib/proactive-proxy.ts');
  assert.match(proxy, /isWrite && !sameOrigin\(request, config\)/);
  assert.match(proxy, /if \(route === "bhuvan_tokens" \|\| route === "bhuvan_token_test"\) return \["platform_admin"\]/);
  const reference = read('app/api/reference/bhuvan/[kind]/route.ts');
  assert.doesNotMatch(reference, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(reference, /bhuvanQuery\(/);
});
