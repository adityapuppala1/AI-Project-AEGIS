// Browser fixtures only; deployed authentication is never replaced.
// Uses the existing isolated laptop Playwright installation; no downloads.
const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const qaRequire = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'));
const { chromium } = qaRequire('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://localhost:3000/department-tasks');
        await page.getByRole('status').filter({ hasText: 'Identity provider not configured' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Acknowledge rehearsal task' }).count(), 0);
        let state = 'prepared';
        let unavailable = false;
        const writes = [];
        const id = '77777777-7777-4777-8777-777777777777';
        await page.route('**/api/department-tasks**', async route => {
          const request = route.request();
          if (request.method() === 'POST') {
            const data = request.postDataJSON();
            writes.push(data);
            assert.deepEqual(Object.keys(data).sort(), ['operation', 'rationale']);
            state = data.operation === 'acknowledge_task' ? 'acknowledged' : 'closed';
            await route.fulfill({ json: { status: 'approved' } });
            return;
          }
          if (unavailable) {
            await route.fulfill({ status: 401, json: { error: 'Secure department sign-in required' } });
            return;
          }
          await route.fulfill({ json: { department_id: 'infrastructure', exercise_only: true, tasks: [{
            proposal_id: id, incident_id: '22222222-2222-4222-8222-222222222222', task: {
              id: 'infrastructure', summary: 'SIMULATION: Review infrastructure-check draft', state,
              due_at: new Date(Date.now() + 60000).toISOString(),
              sla_status: 'awaiting_scripted_acknowledgement',
              events: [{ kind: 'prepared', occurred_at: new Date().toISOString() }],
            },
          }] } });
        });
        await page.getByRole('button', { name: 'Refresh inbox' }).click();
        await page.getByRole('button', { name: 'Acknowledge rehearsal task' }).waitFor();
        assert.equal(writes.length, 0);
        await page.getByLabel('Rehearsal rationale').fill('SIMULATION: department reviewed the evidence');
        await page.getByRole('button', { name: 'Acknowledge rehearsal task' }).click();
        await page.getByRole('button', { name: 'Close rehearsal task' }).waitFor();
        assert.equal(await page.getByLabel('Rehearsal rationale').inputValue(), '');
        await page.getByLabel('Rehearsal rationale').fill('SIMULATION: completed department review');
        await page.getByRole('button', { name: 'Close rehearsal task' }).click();
        await page.getByText('State: closed', { exact: true }).waitFor();
        assert.equal(writes.length, 2);
        assert.equal(await page.getByLabel('Rehearsal rationale').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        unavailable = true;
        await page.getByRole('button', { name: 'Refresh inbox' }).click();
        await page.getByRole('status').filter({ hasText: 'Secure department sign-in required' }).waitFor();
        assert.equal(await page.locator('article').count(), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS department inbox at ${width}px: inactive IdP, explicit acknowledgement/closure, no authority override, note/access clearing, no overflow/page errors`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
