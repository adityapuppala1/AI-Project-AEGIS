// Every state-changing web route (POST/PUT/PATCH/DELETE) must refuse cross-site requests: either the route file
// checks the Origin itself, or it delegates to a proxy helper in lib/ whose write path calls sameOrigin(). This is
// a static inventory check; behaviour of each helper is covered by its own *-proxy test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const API = path.join(ROOT, 'app/api');
const MUTATING = /export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/g;
// A direct check: the shared helper, the relay's own check, or an explicit Origin equality.
const DIRECT = [/\bsameOrigin\(request,\s*config\)/, /\bfromThisSite\(request,/, /request\.headers\.get\("origin"\)\s*!==/];
// Proxy helpers whose write branch runs sameOrigin() before forwarding.
const PROXIES = {
  proxyProposals: 'lib/proposal-proxy.ts', proxyDepartmentTasks: 'lib/department-proxy.ts',
  proxyProactive: 'lib/proactive-proxy.ts', proxyLearning: 'lib/learning-proxy.ts', proxyAssist: 'lib/assist-proxy.ts',
  proxyResponse: 'lib/response-proxy.ts', proxyStaffEmail: 'lib/staff-email-proxy.ts', proxyBrandAdmin: 'lib/brand-proxy.ts',
};

function routeFiles() {
  const out = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else if (entry.name === 'route.ts') out.push(full);
  } };
  walk(API);
  return out;
}
const rel = file => path.relative(ROOT, file).replace(/\\/g, '/');

function originGuarded(text) {
  if (DIRECT.some(pattern => pattern.test(text))) return true;
  return Object.entries(PROXIES).some(([name, file]) => {
    if (!new RegExp(`\\breturn\\s+${name}\\(`).test(text)) return false;
    return /\bsameOrigin\(request,\s*config\)/.test(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  });
}

test('every mutating /api route checks the request origin or delegates to a helper that does', () => {
  const handlers = [], offenders = [];
  for (const file of routeFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    const methods = [...text.matchAll(MUTATING)].map(match => match[1]);
    if (!methods.length) continue;
    for (const method of methods) handlers.push(`${rel(file)} ${method}`);
    if (!originGuarded(text)) offenders.push(rel(file));
  }
  assert.ok(handlers.length >= 27, `found the mutating handlers (${handlers.length})`);
  assert.deepEqual(offenders, []);
});

test('auth routes: login and callback are GET-only OIDC steps; logout POST is origin-checked', () => {
  // login only starts the redirect (state + PKCE in the sealed flow cookie); callback verifies state, so neither
  // exposes a mutating method. Sign-out clears the session, so it must be origin-checked.
  for (const name of ['login', 'callback']) {
    const text = fs.readFileSync(path.join(API, 'auth', name, 'route.ts'), 'utf8');
    assert.deepEqual([...text.matchAll(MUTATING)], [], `${name} exposes no mutating method`);
  }
  const logout = fs.readFileSync(path.join(API, 'auth/logout/route.ts'), 'utf8');
  assert.match(logout, /export async function POST/);
  assert.match(logout, /if \(!sameOrigin\(request, config\)\) return/);
});

test('the inventory check fails when the exercise risk route loses its origin check', () => {
  const text = fs.readFileSync(path.join(API, 'exercise/risk/route.ts'), 'utf8');
  assert.ok(originGuarded(text));
  const stripped = text.split('\n').filter(line => !/headers\.get\("origin"\)/.test(line)).join('\n');
  assert.equal(originGuarded(stripped), false);
});
