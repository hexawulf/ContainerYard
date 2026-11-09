import { test, expect } from "@playwright/test";

const THEME_STORAGE_KEY = "containeryard-theme";

test.describe("Theme system (light by default, persistent, no flash)", () => {
  test("fresh context sets <html class='light'> at DOMContentLoaded and shows toggle on Landing and Login", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: "dark", // Even when OS prefers dark, default must be light
    });
    await context.addInitScript(() => {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          (window as unknown as { __htmlClassAtDCL: string }).__htmlClassAtDCL =
            document.documentElement.className;
        },
        { once: true },
      );
    });
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const classAtDomContentLoaded = await page.evaluate(
      () => (window as unknown as { __htmlClassAtDCL?: string }).__htmlClassAtDCL ?? "",
    );
    expect(classAtDomContentLoaded.split(/\s+/)).toContain("light");
    expect(classAtDomContentLoaded.split(/\s+/)).not.toContain("dark");

    const html = page.locator("html");
    await expect(html).toHaveClass(/\blight\b/);

    // Toggle visible on Landing
    const toggle = page.getByTestId("button-theme-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");

    // Click -> dark, persisted in localStorage
    await toggle.click();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");

    const storedAfterClick = await page.evaluate(
      (key) => localStorage.getItem(key),
      THEME_STORAGE_KEY,
    );
    expect(storedAfterClick).toBe("dark");

    // Reload -> still dark at DOMContentLoaded with no flash
    await page.reload({ waitUntil: "domcontentloaded" });
    const classOnReload = await page.evaluate(
      () => (window as unknown as { __htmlClassAtDCL?: string }).__htmlClassAtDCL ?? "",
    );
    expect(classOnReload.split(/\s+/)).toContain("dark");
    await expect(html).toHaveClass(/\bdark\b/);

    // Navigate to Login -> toggle is visible and theme remains dark
    await page.goto("/login");
    await expect(page.getByTestId("button-theme-toggle")).toBeVisible();
    await expect(html).toHaveClass(/\bdark\b/);

    // Clear storage -> reload -> back to light default
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html).toHaveClass(/\blight\b/);

    await context.close();
  });

  test("stored legacy value 'system' resolves to 'light'", async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: "dark",
    });
    const page = await context.newPage();

    await page.addInitScript((key) => {
      localStorage.setItem(key, "system");
    }, THEME_STORAGE_KEY);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const html = page.locator("html");
    await expect(html).toHaveClass(/\blight\b/);
    await expect(html).not.toHaveClass(/\bdark\b/);

    await context.close();
  });
});
