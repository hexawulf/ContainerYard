# E2E - End-to-End Tests

## Package Identity
Playwright-based end-to-end tests for ContainerYard. Validates user flows, UI interactions, and full-stack integration. Currently minimal coverage (screenshot test only).

## Setup & Run

```bash
# Install Playwright browsers (one-time)
npx playwright install

# Run E2E tests (requires built app)
npm run e2e:run                        # Builds + serves + tests
# or
npm run preview:e2e                    # Serve production build (terminal 1)
npm run e2e                            # Run tests (terminal 2)

# Run specific test file
npx playwright test e2e/screenshot.spec.ts

# Run tests in UI mode (interactive debugging)
npx playwright test --ui

# Run tests in headed mode (see browser)
npx playwright test --headed

# Generate test report
npx playwright show-report             # Opens playwright-report/index.html
```

## Patterns & Conventions

### File Organization
```
e2e/
├── screenshot.spec.ts      Example screenshot test
└── screenshots/            Baseline screenshots for comparison
```

**Future Structure** (as tests grow)
```
e2e/
├── auth/                   Authentication flows
│   ├── login.spec.ts
│   └── logout.spec.ts
├── containers/             Container management
│   ├── list.spec.ts
│   ├── start-stop.spec.ts
│   └── logs.spec.ts
├── host-logs/              Host log viewer
│   └── view-logs.spec.ts
├── fixtures/               Test fixtures (auth states, etc.)
└── helpers/                Test utilities
```

### Test Pattern

**✅ DO: Use Playwright Page Object Model**
```typescript
// e2e/auth/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully with valid credentials', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    
    // Fill form
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Assert redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Assert user is logged in
    await expect(page.locator('text=test@example.com')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Assert error message
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
    
    // Assert still on login page
    await expect(page).toHaveURL('/login');
  });
});
```

**✅ DO: Use beforeEach for Setup**
```typescript
test.describe('Container Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should list containers', async ({ page }) => {
    await expect(page.locator('[data-testid="container-card"]')).toBeVisible();
  });
});
```

**✅ DO: Use Data Attributes for Selectors**
```tsx
// client/src/components/ContainerCard.tsx
<div data-testid="container-card" data-container-id={container.id}>
  <h3 data-testid="container-name">{container.name}</h3>
  <button data-testid="start-button">Start</button>
</div>

// e2e/containers/start.spec.ts
await page.click('[data-testid="start-button"]');
await expect(page.locator('[data-testid="container-status"]')).toHaveText('running');
```

**❌ DON'T: Use Fragile Selectors**
```typescript
// Avoid - breaks if UI changes
await page.click('div > button.btn.btn-primary');
await page.locator('text=Start').first().click(); // Multiple matches

// Better - use data attributes or unique roles
await page.click('[data-testid="start-button"]');
await page.getByRole('button', { name: 'Start Container' }).click();
```

### Authentication State Management

**✅ DO: Reuse Auth State Across Tests**
```typescript
// e2e/fixtures/auth.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    // Login once
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    
    // Use authenticated page
    await use(page);
  },
});

// e2e/containers/list.spec.ts
import { test } from '../fixtures/auth';

test('should list containers', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  // Already logged in!
});
```

### Screenshot Testing

**✅ DO: Use Visual Regression for UI Changes**
```typescript
// e2e/screenshot.spec.ts
import { test, expect } from '@playwright/test';

test('dashboard screenshot', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  
  // Compare against baseline
  await expect(page).toHaveScreenshot('dashboard.png', {
    fullPage: true,
    maxDiffPixels: 100, // Allow minor differences
  });
});
```

**Update Baseline Screenshots**
```bash
# Regenerate baseline screenshots
npx playwright test --update-snapshots
```

### API Mocking (Optional)

**✅ DO: Mock External APIs for Deterministic Tests**
```typescript
test('should handle API errors gracefully', async ({ page }) => {
  // Mock API route
  await page.route('/api/containers', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Internal server error' }),
    });
  });

  await page.goto('/dashboard');
  
  // Assert error message is shown
  await expect(page.locator('text=Failed to load containers')).toBeVisible();
});
```

## Touch Points / Key Files

**Config**
- `playwright.config.ts` - Test configuration (baseURL, browsers, reporter)
- `e2e/screenshot.spec.ts` - Example test file

**Scripts**
- `npm run e2e` - Run Playwright tests
- `npm run e2e:run` - Build + serve + test
- `npm run preview:e2e` - Serve production build on http://127.0.0.1:4173

## JIT Index Hints

```bash
# List all test files
find e2e -name "*.spec.ts"

# Find tests by name
rg -n "test\(" e2e

# Find test describes
rg -n "test\.describe\(" e2e

# Find data-testid usage in components
rg -n "data-testid=" client/src
```

## Common Gotchas

1. **Base URL**: Tests run against production build (http://127.0.0.1:4173), not dev server (port 5000).
2. **Build Required**: Run `npm run build` before `npm run e2e` (or use `e2e:run` script).
3. **Headless by Default**: Tests run in headless mode. Use `--headed` flag to see browser.
4. **Timeouts**: Default timeout is 60s for navigation, 10s for assertions. Increase in config if needed.
5. **State Isolation**: Each test starts with fresh browser context (no shared cookies/storage).
6. **Flaky Selectors**: Prefer `data-testid` or role-based selectors over text or CSS classes.

## Pre-PR Checks

```bash
# Build app
npm run build

# Run E2E tests
npm run e2e:run

# Optional: Update screenshots if UI changed
npx playwright test --update-snapshots
```

## Test Coverage Recommendations

**High Priority** (not yet implemented)
- [ ] Authentication flows (login, logout, session expiry)
- [ ] Container listing and filtering
- [ ] Container actions (start, stop, restart)
- [ ] Log viewer (search, filtering, bookmarks)
- [ ] Host logs page

**Medium Priority**
- [ ] Dark/light mode toggle
- [ ] Keyboard shortcuts
- [ ] Terminal integration
- [ ] Error handling (404, 500, network errors)

**Low Priority**
- [ ] Responsive design (mobile views)
- [ ] Accessibility (ARIA labels, keyboard navigation)

## Playwright API Quick Reference

**Navigation**
```typescript
await page.goto('/dashboard');
await page.goBack();
await page.reload();
await page.waitForURL('/dashboard');
await page.waitForLoadState('networkidle');
```

**Locators**
```typescript
// By role (accessible name)
page.getByRole('button', { name: 'Start' });

// By text
page.locator('text=Container Logs');

// By data attribute
page.locator('[data-testid="container-card"]');

// By CSS selector
page.locator('.container-card');

// By XPath (avoid if possible)
page.locator('xpath=//button[@type="submit"]');
```

**Interactions**
```typescript
await page.click('[data-testid="start-button"]');
await page.fill('input[name="email"]', 'test@example.com');
await page.check('input[type="checkbox"]');
await page.selectOption('select[name="status"]', 'running');
await page.press('input', 'Enter');
```

**Assertions**
```typescript
await expect(page).toHaveURL('/dashboard');
await expect(page).toHaveTitle('ContainerYard');
await expect(page.locator('text=Success')).toBeVisible();
await expect(page.locator('[data-testid="status"]')).toHaveText('running');
await expect(page.locator('input')).toHaveValue('test@example.com');
```

**Waiting**
```typescript
await page.waitForSelector('[data-testid="container-card"]');
await page.waitForTimeout(1000); // Avoid - use specific waits
await page.waitForFunction(() => document.querySelectorAll('.card').length > 0);
```

## Debugging Tips

```bash
# Run tests with inspector (step through)
npx playwright test --debug

# Run tests in UI mode (interactive)
npx playwright test --ui

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests with trace (for debugging failures)
npx playwright test --trace on

# View trace file
npx playwright show-trace trace.zip

# Generate test report
npx playwright show-report
```
