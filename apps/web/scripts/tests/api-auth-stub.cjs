// Test-only loader for lib/api-auth.ts. The real helper is compiled with a fake ./auth-server whose session the
// test controls through `state.session`. Synthetic sessions exist only in this loader; production auth-server and
// deployed routes are never replaced or enabled.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

const TOKEN = 'unit-only-token';
const state = { session: { accessToken: TOKEN, subject: 'unit', agencyId: '11111111-1111-4111-8111-111111111111', roles: ['incident_auditor'] } };

const source = fs.readFileSync(path.join(__dirname, '../../lib/api-auth.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const apiAuth = { exports: {} };
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'next/server') return { NextResponse };
  if (name === './auth-server') return { readSession: async () => state.session };
  throw new Error('Unexpected dependency ' + name);
}, apiAuth, apiAuth.exports);

const isApiAuth = name => /(^|\/)lib\/api-auth$/.test(name);
module.exports = { TOKEN, state, apiAuth: apiAuth.exports, isApiAuth };
