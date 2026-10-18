const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'))('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));

      for (const theme of ['light', 'dark']) {
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        await page.goto('http://localhost:3000/demo');
        await page.locator('html').waitFor();
        await page.waitForFunction(expected => document.documentElement.classList.contains(expected), theme);

        const state = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const rail = document.querySelector('.command-rail');
          const panel = document.querySelector('.panel');
          return {
            canvas: root.getPropertyValue('--canvas').trim(),
            surface: root.getPropertyValue('--surface').trim(),
            accent: root.getPropertyValue('--accent').trim(),
            signal: root.getPropertyValue('--signal').trim(),
            railImage: rail ? getComputedStyle(rail).backgroundImage : 'none',
            panelImage: panel ? getComputedStyle(panel).backgroundImage : 'none',
            overflow: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        assert.ok(state.canvas && state.surface && state.accent && state.signal);
        assert.notEqual(state.railImage, 'none');
        assert.notEqual(state.panelImage, 'none');
        assert.equal(state.overflow, false);
      }

      const toggle = page.getByRole('button', { name: /Switch to (light|dark) theme/ });
      const before = await page.locator('html').getAttribute('class');
      await toggle.click();
      await page.waitForFunction(previous => document.documentElement.className !== previous, before);
      assert.notEqual(await page.locator('html').getAttribute('class'), before);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS monsoon atlas themes at ${width}px: light/dark depth, toggle, no overflow/page errors`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
