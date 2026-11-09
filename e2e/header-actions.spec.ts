import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SCREENSHOT_DIR = path.resolve(__dirname, "../docs/screenshots/header-actions");
const TEST_ADMIN_EMAIL = "cy-test-admin@example.invalid";
const TEST_VIEWER_EMAIL = "cy-test-viewer@example.invalid";
const TEST_ADMIN_PASS = `CyAdm_${randomBytes(9).toString("base64url")}!1`;
const TEST_VIEWER_PASS = `CyVwr_${randomBytes(9).toString("base64url")}!1`;

/** Minimal cookie-jar API client for test setup/teardown against :5098. */
class ApiClient {
  cookies = new Map<string, string>();
  csrf = "";

  constructor(private baseUrl: string) {}

  async req(urlPath: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    headers.set("X-Forwarded-Proto", "https");
    if (this.cookies.size) {
      headers.set(
        "Cookie",
        Array.from(this.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      );
    }
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    const res = await fetch(this.baseUrl + urlPath, {
      ...init,
      headers,
      body,
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }

  async refreshCsrf() {
    const res = await this.req("/api/auth/csrf");
    const data = (await res.json()) as { csrfToken: string };
    this.csrf = data.csrfToken;
  }

  mutate(urlPath: string, method: string, json?: unknown) {
    return this.req(urlPath, {
      method,
      json,
      headers: this.csrf ? { "x-csrf-token": this.csrf } : {},
    });
  }
}

let bootstrapAdmin: ApiClient;
let adminCookies: Array<{ name: string; value: string; url: string }> = [];
let viewerCookies: Array<{ name: string; value: string; url: string }> = [];
let createdUserIds: string[] = [];

async function assertNoHorizontalOverflow(page: Page, width: number) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(
    overflow,
    `Expected zero horizontal scroll at ${width}px, got overflow=${overflow}px`,
  ).toBeLessThanOrEqual(0);
}

async function applyTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    localStorage.setItem("containeryard-theme", t);
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(t);
    root.style.colorScheme = t;
  }, theme);
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
}

test.describe.serial("Header actions, modals, responsive layout, and RBAC", () => {
  test.beforeAll(async ({ baseURL }) => {
    const base = (baseURL ?? "http://127.0.0.1:5098").replace(/\/+$/, "");
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be available in worktree .env");
    }

    bootstrapAdmin = new ApiClient(base);
    await bootstrapAdmin.refreshCsrf();
    const loginRes = await bootstrapAdmin.mutate("/api/auth/login", "POST", {
      email: adminEmail,
      password: adminPassword,
    });
    expect(loginRes.status).toBe(200);
    await bootstrapAdmin.refreshCsrf();

    // Remove any stale cy-test users first
    const existingRes = await bootstrapAdmin.req("/api/users");
    expect(existingRes.status).toBe(200);
    const existingUsers = (await existingRes.json()) as Array<{ id: string; email: string }>;
    for (const u of existingUsers) {
      if (u.email === TEST_ADMIN_EMAIL || u.email === TEST_VIEWER_EMAIL) {
        await bootstrapAdmin.mutate(`/api/users/${u.id}`, "DELETE");
      }
    }

    // Create throwaway ADMIN and VIEWER accounts
    const createAdminRes = await bootstrapAdmin.mutate("/api/users", "POST", {
      email: TEST_ADMIN_EMAIL,
      role: "ADMIN",
      password: TEST_ADMIN_PASS,
    });
    expect(createAdminRes.status).toBe(201);
    const createdAdmin = (await createAdminRes.json()) as { id: string };
    createdUserIds.push(createdAdmin.id);

    const createViewerRes = await bootstrapAdmin.mutate("/api/users", "POST", {
      email: TEST_VIEWER_EMAIL,
      role: "VIEWER",
      password: TEST_VIEWER_PASS,
    });
    expect(createViewerRes.status).toBe(201);
    const createdViewer = (await createViewerRes.json()) as { id: string };
    createdUserIds.push(createdViewer.id);

    // Pre-authenticate one session for TEST_ADMIN and one for TEST_VIEWER
    const adminClient = new ApiClient(base);
    await adminClient.refreshCsrf();
    expect(
      (
        await adminClient.mutate("/api/auth/login", "POST", {
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASS,
        })
      ).status,
    ).toBe(200);
    adminCookies = Array.from(adminClient.cookies.entries()).map(([name, value]) => ({
      name,
      value,
      url: base,
    }));

    const viewerClient = new ApiClient(base);
    await viewerClient.refreshCsrf();
    expect(
      (
        await viewerClient.mutate("/api/auth/login", "POST", {
          email: TEST_VIEWER_EMAIL,
          password: TEST_VIEWER_PASS,
        })
      ).status,
    ).toBe(200);
    viewerCookies = Array.from(viewerClient.cookies.entries()).map(([name, value]) => ({
      name,
      value,
      url: base,
    }));
  });

  test.afterAll(async () => {
    if (!bootstrapAdmin) return;
    const res = await bootstrapAdmin.req("/api/users");
    if (res.ok) {
      const users = (await res.json()) as Array<{ id: string; email: string }>;
      for (const u of users) {
        if (
          u.email === TEST_ADMIN_EMAIL ||
          u.email === TEST_VIEWER_EMAIL ||
          createdUserIds.includes(u.id)
        ) {
          await bootstrapAdmin.mutate(`/api/users/${u.id}`, "DELETE");
        }
      }
    }
  });

  test("logged out: Landing and Login show About + Theme only, About modal has repo/mailto/version, Footer has no github.com links", async ({
    browser,
  }) => {
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      extraHTTPHeaders: { "X-Forwarded-Proto": "https" },
    });
    const page = await context.newPage();

    for (const routePath of ["/", "/login"]) {
      await page.goto(routePath, { waitUntil: "networkidle" });
      await expect(page.getByTestId("button-about")).toBeVisible();
      await expect(page.getByTestId("button-theme-toggle")).toBeVisible();
      await expect(page.getByTestId("button-change-password")).toHaveCount(0);
      await expect(page.getByTestId("button-users")).toHaveCount(0);
      await expect(page.getByTestId("button-logout")).toHaveCount(0);

      // Footer must have zero github.com links
      const footerGithubLinks = page.locator('footer a[href*="github.com"]');
      await expect(footerGithubLinks).toHaveCount(0);
    }

    // Check Landing in light & dark at 1440x900 and 375x812 + screenshots
    await page.goto("/", { waitUntil: "networkidle" });
    for (const vp of [
      { label: "desktop", width: 1440, height: 900 },
      { label: "375px", width: 375, height: 812 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const theme of ["light", "dark"] as const) {
        await applyTheme(page, theme);
        await assertNoHorizontalOverflow(page, vp.width);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `header-logged-out-${theme}-${vp.label}.png`),
        });

        // Open About modal and verify repo link, mailto, and version
        await page.getByTestId("button-about").click();
        const dialog = page.getByTestId("about-dialog");
        await expect(dialog).toBeVisible();
        await expect(page.getByTestId("about-version")).toContainText("v3.2.0");
        await expect(
          dialog.locator('a[href="https://github.com/hexawulf/ContainerYard"]'),
        ).toBeVisible();
        await expect(dialog.locator('a[href="mailto:dev@0xwulf.dev"]')).toBeVisible();
        await assertNoHorizontalOverflow(page, vp.width);
        await page.waitForTimeout(250);

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `modal-about-${theme}-${vp.label}.png`),
        });

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.waitForTimeout(200);
      }
    }

    await context.close();
  });

  test("logged in as ADMIN: exact header button order, Users & Change Password modals, light + dark at 1440x900 and 375x812", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      extraHTTPHeaders: { "X-Forwarded-Proto": "https" },
    });
    await context.addCookies(adminCookies);
    const page = await context.newPage();

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Verify exact button order inside navbar-actions: about, theme, change-password, users, logout (and logout is last child)
    const testIds = await page
      .getByTestId("navbar-actions")
      .locator("> button")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(testIds).toEqual([
      "button-about",
      "button-theme-toggle",
      "button-change-password",
      "button-users",
      "button-logout",
    ]);

    const lastChildTestId = await page
      .getByTestId("navbar-actions")
      .locator("> :last-child")
      .getAttribute("data-testid");
    expect(lastChildTestId).toBe("button-logout");

    // Also check 360px minimum width has zero horizontal overflow even on "/" with Open Dashboard button present
    await page.goto("/", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 360, height: 800 });
    await assertNoHorizontalOverflow(page, 360);

    await page.goto("/dashboard", { waitUntil: "networkidle" });

    for (const vp of [
      { label: "desktop", width: 1440, height: 900 },
      { label: "375px", width: 375, height: 812 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const theme of ["light", "dark"] as const) {
        await applyTheme(page, theme);
        await assertNoHorizontalOverflow(page, vp.width);

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `header-admin-${theme}-${vp.label}.png`),
        });

        // Open Change Password modal
        await page.getByTestId("button-change-password").click();
        const cpDialog = page.getByTestId("change-password-dialog");
        await expect(cpDialog).toBeVisible();
        await assertNoHorizontalOverflow(page, vp.width);
        await page.waitForTimeout(250);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `modal-change-password-${theme}-${vp.label}.png`),
        });
        await page.keyboard.press("Escape");
        await expect(cpDialog).toBeHidden();
        await page.waitForTimeout(200);

        // Open Users modal
        await page.getByTestId("button-users").click();
        const usersDialog = page.getByTestId("users-dialog");
        await expect(usersDialog).toBeVisible();
        await expect(page.getByTestId(`user-row-${TEST_ADMIN_EMAIL}`)).toBeVisible();
        await expect(page.getByTestId(`user-row-${TEST_VIEWER_EMAIL}`)).toBeVisible();
        // Self-delete and self-demote controls are disabled for current user
        await expect(page.getByTestId(`button-delete-user-${TEST_ADMIN_EMAIL}`)).toBeDisabled();
        await expect(page.getByTestId(`select-role-${TEST_ADMIN_EMAIL}`)).toBeDisabled();
        await assertNoHorizontalOverflow(page, vp.width);
        await page.waitForTimeout(250);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `modal-users-${theme}-${vp.label}.png`),
        });
        await page.keyboard.press("Escape");
        await expect(usersDialog).toBeHidden();
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.waitForTimeout(200);
      }
    }

    await context.close();
  });

  test("logged in as VIEWER: no Users button, exact order, light + dark at 1440x900 and 375x812, and Logout returns to /login", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      extraHTTPHeaders: { "X-Forwarded-Proto": "https" },
    });
    await context.addCookies(viewerCookies);
    const page = await context.newPage();

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await expect(page.getByTestId("button-users")).toHaveCount(0);

    const testIds = await page
      .getByTestId("navbar-actions")
      .locator("> button")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(testIds).toEqual([
      "button-about",
      "button-theme-toggle",
      "button-change-password",
      "button-logout",
    ]);

    for (const vp of [
      { label: "desktop", width: 1440, height: 900 },
      { label: "375px", width: 375, height: 812 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const theme of ["light", "dark"] as const) {
        await applyTheme(page, theme);
        await assertNoHorizontalOverflow(page, vp.width);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `header-viewer-${theme}-${vp.label}.png`),
        });
      }
    }

    // Clicking Logout returns to /login and hides account buttons
    await page.setViewportSize({ width: 1440, height: 900 });
    await applyTheme(page, "light");
    await page.getByTestId("button-logout").click();
    await page.waitForURL("**/login");
    await expect(page.getByTestId("button-logout")).toHaveCount(0);
    await expect(page.getByTestId("button-change-password")).toHaveCount(0);
    await expect(page.getByTestId("button-about")).toBeVisible();
    await expect(page.getByTestId("button-theme-toggle")).toBeVisible();

    await context.close();
  });
});
