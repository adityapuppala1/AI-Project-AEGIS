const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../lib/auth-server.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
const teams = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../lib/response-teams.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(() => { throw Error('no deps'); }, teams, teams.exports);
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'node:crypto') return require(name);
  if (name === './response-teams') return teams.exports;
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
const teamScope = { ...scope, aegis_roles: ['response_team'] };
test('verified team scope survives BFF extraction', () => {
  const extracted = loaded.exports.extractScope({ ...teamScope, aegis_team_id: 'syn-team-health-01' });
  assert.equal(extracted.teamId, 'syn-team-health-01');
  assert.equal(extracted.departmentId, undefined);
  assert.equal(loaded.exports.extractScope({ ...scope, aegis_department_id: 'infrastructure' }).teamId, undefined);
});
for (const value of [undefined, null, '', 'syn-team-other', ['syn-team-rescue-01'], 'SYN-TEAM-RESCUE-01']) {
  test('invalid team claim fails closed: ' + JSON.stringify(value), () => {
    assert.throws(() => loaded.exports.extractScope({ ...teamScope, aegis_team_id: value }));
  });
}
test('a team claim on a non-team token must still be valid', () => {
  assert.throws(() => loaded.exports.extractScope({ ...scope, aegis_department_id: 'infrastructure', aegis_team_id: 'bogus' }));
});
