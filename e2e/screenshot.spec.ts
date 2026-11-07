import { test, expect } from '@playwright/test';

/**
 * Public-page screenshots (landing, login, styleguide) at desktop and mobile sizes.
 *
 * API calls are mocked per path. The previous version answered every /api/**
 * request with `{}`, so the boot health check could fail and every screenshot
 * showed the "Startup Error" screen (the Nov 2026 PR #2 images were all that
 * screen). We now return realistic payloads and assert the error screen is absent.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (pathname.endsWith('/health')) return json(200, { ok: true, uptime: 1, ts: Date.now() });
    if (pathname.endsWith('/runtime-config')) {
      return json(200, { apiBase: '', appName: 'ContainerYard', hosts: [], features: {} });
    }
    if (pathname.endsWith('/auth/me')) return json(401, { message: 'Not authenticated' });
    if (pathname.endsWith('/auth/csrf')) return json(200, { csrfToken: 'screenshot' });
    if (pathname.endsWith('/hosts')) return json(200, []);
    return json(200, {});
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

for (const target of pages) {
  for (const viewport of viewports) {
    test(`screenshot ${target.name} - ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      await page.goto(target.path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Startup Error')).toHaveCount(0);
      await page.screenshot({ path: `e2e/screenshots/${target.name}-${viewport.name}.png`, fullPage: true });
      await context.close();
    });
  }
}
