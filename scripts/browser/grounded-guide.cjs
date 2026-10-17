const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'))('playwright');
const incident = '22222222-2222-4222-8222-222222222222';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://localhost:3000/incidents/${incident}`);
      const input = page.getByLabel('Question about this case');
      await input.fill('What evidence and sources do we have?');
      await page.getByRole('button', { name: 'Ask grounded guide' }).click();
      await page.getByRole('status').filter({ hasText: 'Grounded answer ready.' }).waitFor();
      assert.ok(await page.getByText('Evidence IDs:', { exact: false }).count());
      assert.ok(await page.getByText('Unknowns retained', { exact: true }).count());
      await input.fill('Predict flood depth and safety');
      await page.getByRole('button', { name: 'Ask grounded guide' }).click();
      await page.getByRole('status').filter({ hasText: 'Grounded answer ready.' }).waitFor();
      assert.ok(await page.getByText('Real flood likelihood, depth and infrastructure impact are unknown.', { exact: true }).count());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS grounded guide at ${width}px: cited evidence, explicit unknowns, no overflow/page errors`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
