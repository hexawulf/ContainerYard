import { test, expect, type Page } from "@playwright/test";

/**
 * Host Logs host switcher — fully mocked via page.route.
 *
 * Stubs every API the app bootstrap touches and uses fake hosts
 * (host-a / host-b) so no real topology leaks into the public repo.
 */

interface FakeHost {
  id: string;
  name: string;
  provider: "DOCKER" | "CADVISOR_ONLY";
  nodeLabel: string;
}

const HOSTS: FakeHost[] = [
  { id: "host-a", name: "host-a", provider: "DOCKER", nodeLabel: "local" },
  { id: "host-b", name: "host-b", provider: "CADVISOR_ONLY", nodeLabel: "remote" },
];

const LOGS_BY_HOST: Record<string, Array<{ name: string; title: string; kind: string; exists: boolean }>> = {
  "host-a": [
    { name: "nginx_access", title: "Nginx Access Log", kind: "file", exists: true },
    { name: "nginx_error", title: "Nginx Error Log", kind: "file", exists: true },
  ],
  "host-b": [
    { name: "cy_app", title: "ContainerYard App", kind: "docker", exists: true },
    { name: "redis", title: "Redis", kind: "docker", exists: true },
  ],
};

function json(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

async function mockApi(page: Page) {
  await page.route("**/api/runtime-config", (route) =>
    route.fulfill(json({ apiBase: "", appName: "ContainerYard", features: {} })),
  );
  await page.route("**/api/health", (route) => route.fulfill(json({ ok: true })));
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill(json({ csrfToken: "test-csrf" })),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill(
      json({ user: { id: "u1", email: "admin@example.invalid", role: "ADMIN" } }),
    ),
  );
  await page.route("**/api/hosts", (route) => route.fulfill(json(HOSTS)));
  await page.route("**/api/hosts/*/logs", (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/api\/hosts\/([^/]+)\/logs$/);
    const hostId = match ? decodeURIComponent(match[1]) : "";
    const logs = LOGS_BY_HOST[hostId] ?? [];
    route.fulfill(json({ logs }));
  });
}

test.describe("Host Logs host switcher", () => {
  test("switching host changes the URL, keeps the filter, stores the host, and Back returns", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockApi(page);

    await page.goto("/hosts/host-a/logs", { waitUntil: "networkidle" });

    // Switcher shows host-a and host-a's sources render.
    const switcher = page.getByTestId("host-switcher");
    await expect(switcher).toContainText("host-a");
    await expect(page.getByText("Nginx Access Log")).toBeVisible();

    // Type into the source filter.
    const filter = page.getByLabel("Filter log sources");
    await filter.fill("nginx");
    await expect(filter).toHaveValue("nginx");

    // Pick host-b from the Radix Select.
    await switcher.click();
    await page.getByRole("option", { name: "host-b (remote)" }).click();

    await expect(page).toHaveURL(/\/hosts\/host-b\/logs$/);
    await expect(switcher).toContainText("host-b");

    // localStorage followed the switch.
    const stored = await page.evaluate(() => localStorage.getItem("cy.selectedHost"));
    expect(stored).toBe("host-b");

    // Filter text is kept across the switch.
    await expect(filter).toHaveValue("nginx");

    // host-b's sources render (clear the filter so they are visible).
    await filter.fill("");
    await expect(page.getByText("ContainerYard App")).toBeVisible();

    // Browser Back returns to host-a.
    await page.goBack();
    await expect(page).toHaveURL(/\/hosts\/host-a\/logs$/);
    await expect(switcher).toContainText("host-a");

    await context.close();
  });

  test("an unknown host id shows the placeholder and no crash", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockApi(page);

    await page.goto("/hosts/nope/logs", { waitUntil: "networkidle" });

    const switcher = page.getByTestId("host-switcher");
    await expect(switcher).toContainText("Select host");
    await expect(page.getByTestId("hostlogs-empty")).toBeVisible();

    await context.close();
  });
});
