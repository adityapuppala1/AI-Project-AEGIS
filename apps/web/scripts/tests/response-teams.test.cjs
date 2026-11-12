// The browser-side team allowlist must equal the API fixture, or sessions and the API would disagree about who a team is.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('lib/response-teams.ts lists exactly the fixture teams', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../lib/response-teams.ts'), 'utf8');
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../services/api/app/fixtures/synthetic_teams.v1.json'), 'utf8'));
  const inCode = [...new Set(source.match(/syn-team-[a-z]+-[0-9]{2}/g) || [])].sort();
  const inFixture = fixture.teams.map(team => team.id).sort();
  assert.deepEqual(inCode, inFixture);
  for (const team of fixture.teams) assert.ok(source.includes(team.label), 'label present: ' + team.label);
});
