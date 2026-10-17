const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../lib/auth-server.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'node:crypto') return require(name);
  if (['server-only', 'next/headers', 'jose'].includes(name)) return {};
  throw Error(name);
}, loaded, loaded.exports);
const scope = { sub: 'department-user', aegis_agency_id: '11111111-1111-4111-8111-111111111111',
  aegis_roles: ['department_operator'], exp: Math.floor(Date.now()/1000) + 300 };
test('verified department scope survives BFF extraction', () => {
  assert.equal(loaded.exports.extractScope({ ...scope, aegis_department_id: 'infrastructure' }).departmentId, 'infrastructure');
});
for (const value of [undefined, null, '', 'other', ['infrastructure']]) {
  test('invalid department claim fails closed: ' + JSON.stringify(value), () => {
    assert.throws(() => loaded.exports.extractScope({ ...scope, aegis_department_id: value }));
  });
}
