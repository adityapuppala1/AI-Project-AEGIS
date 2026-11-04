// Isolated logout-route tests. Synthetic config/session/discovery exist only in this test loader;
// production auth-server and the deployed route are never replaced or enabled.
//
// Regression coverage for: a same-browser "sign in" right after "sign out" must show a real login
// form, not silently re-authenticate via the identity provider's still-active SSO session. The route
// must stay fail-open on the local cookie clear (that must always succeed) and best-effort on ending
// the provider-side session (never block local sign-out if discovery is unavailable).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

const config = { origin: 'http://localhost:3000', clientId: 'aegis-local-web' };

function loadRoute({ configured = true, oidcDocument } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../app/api/auth/logout/route.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const dependencies = name => {
    if (name === 'next/server') return { NextResponse };
    if (name === '../../../../lib/auth-server') return {
      configuration: () => (configured ? config : null),
      cookieName: (_cfg, type) => `aegis-${type}`,
      cookieOptions: (_cfg, maxAge) => ({ httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge }),
      sameOrigin: request => request.headers.get('origin') === config.origin,
      oidcDocument: oidcDocument ?? (async () => { throw new Error('discovery unavailable'); }),
    };
    throw Error('Unexpected dependency ' + name);
  };
  new Function('require', 'module', 'exports', code)(dependencies, module, module.exports);
  return module.exports.POST;
}
const post = (origin = config.origin) => new Request('http://localhost:3000/api/auth/logout', {
  method: 'POST', headers: origin ? { origin } : {},
});
const clearedCookies = response => response.headers.getSetCookie()
  .filter(c => /^aegis-(flow|session)=;/.test(c) && /Max-Age=0/.test(c));

test('not configured refuses with 503 before any cookie or discovery work', async () => {
  const response = await loadRoute({ configured: false })(post());
  assert.equal(response.status, 503);
});

test('cross-origin logout is refused', async () => {
  const response = await loadRoute()(post('https://evil.example'));
  assert.equal(response.status, 403);
});

test('local session always clears, and a reachable provider yields a one-time-use RP logout URL', async () => {
  const route = loadRoute({
    oidcDocument: async () => ({ end_session_endpoint: 'https://aegis-idp.localhost:8443/realms/aegis-exercise/protocol/openid-connect/logout' }),
  });
  const response = await route(post());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.loggedOut, true);
  const logoutUrl = new URL(body.logoutUrl);
  assert.equal(logoutUrl.origin + logoutUrl.pathname, 'https://aegis-idp.localhost:8443/realms/aegis-exercise/protocol/openid-connect/logout');
  assert.equal(logoutUrl.searchParams.get('client_id'), 'aegis-local-web');
  assert.equal(logoutUrl.searchParams.get('post_logout_redirect_uri'), 'http://localhost:3000');
  assert.equal(clearedCookies(response).length, 2);
});

test('local session still clears when the provider has no end_session_endpoint', async () => {
  const route = loadRoute({ oidcDocument: async () => ({}) });
  const response = await route(post());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.loggedOut, true);
  assert.equal(body.logoutUrl, undefined);
  assert.equal(clearedCookies(response).length, 2);
});

test('local session still clears when discovery is unreachable (fail-open on the bonus step only)', async () => {
  const route = loadRoute(); // default oidcDocument throws
  const response = await route(post());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.loggedOut, true);
  assert.equal(body.logoutUrl, undefined);
  assert.equal(clearedCookies(response).length, 2);
});
