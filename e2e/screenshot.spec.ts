import { test, expect, devices } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
});

const pages = [
  { name: 'landing', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'styleguide', path: '/styleguide' },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const page of pages) {
  for (const viewport of viewports) {
    test(`screenshot ${page.name} - ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const newPage = await context.newPage();
      await newPage.goto(page.path);
      await newPage.screenshot({ path: `e2e/screenshots/${page.name}-${viewport.name}.png`, fullPage: true });
      await context.close();
    });
  }
}