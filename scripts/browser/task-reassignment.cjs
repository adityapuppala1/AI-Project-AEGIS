// Isolated UI fixture. Does not activate OIDC or write to the real API.
const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'))('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const id = '77777777-7777-4777-8777-777777777777';
    const incident = '22222222-2222-4222-8222-222222222222';
    const writes = []; const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let version = 0; let assigned = 'infrastructure';
    await page.route('**/api/auth/session', route => route.fulfill({ json: {
      authenticated: true, configured: true, subject: 'fixture-coordinator',
      agencyId: '11111111-1111-4111-8111-111111111111', roles: ['incident_operator'],
    } }));
    await page.route('**/api/proposals**', route => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON(); writes.push(data);
        assert.equal(data.operation, 'reassign_task'); assert.equal(data.expected_assignment_version, 0);
        assert.equal(data.task_id, 'infrastructure'); assert.equal(data.target_department, 'communications');
        version = 1; assigned = 'communications';
        return route.fulfill({ json: { status: 'approved' } });
      }
      if (route.request().url().endsWith('/incidents')) return route.fulfill({ json: [{ id: incident, hazard_type: 'Synthetic flood', status: 'open' }] });
      return route.fulfill({ json: [{ id, incident_id: incident, maker_subject: 'fixture-coordinator',
        action_type: 'internal_triage', status: 'approved', created_at: new Date().toISOString(), proposal: {
          exercise_only: true, simulation: { version: 'aegis.proposal.simulation.v3', tasks: [{
            id: 'infrastructure', department: 'Fictional infrastructure desk', state: 'prepared',
            assigned_department: assigned, assignment_version: version, events: [],
          }] },
        },
      }] });
    });
    await page.goto('http://localhost:3000/approvals');
    await page.getByText('Scripted task progress', { exact: true }).click();
    await page.getByLabel('Reassign rehearsal task', { exact: true }).selectOption('communications');
    assert.equal(writes.length, 0);
    assert.equal(await page.getByRole('button', { name: 'Reassign with rationale' }).isDisabled(), true);
    await page.getByLabel('Scripted task rationale for Fictional infrastructure desk (required)').fill('SIMULATION: coordinator changed desk coverage');
    await page.getByRole('button', { name: 'Reassign with rationale' }).click();
    await page.getByText('Exercise: reassigned scripted task. No messages sent or operational action taken.', { exact: true }).waitFor();
    await page.getByText('Scripted task progress', { exact: true }).click();
    await page.getByText('Assigned desk: communications', { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS coordinator reassignment mobile UI: explicit desk/rationale, expected version, one write and updated ownership');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
