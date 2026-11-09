import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  THEME_STORAGE_KEY,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from "../../../client/src/lib/theme";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = path.resolve(__dirname, "../../../client/index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
const inlineScriptMatch = /<script>\s*([\s\S]*?)\s*<\/script>/.exec(indexHtml);

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
}

test("resolveTheme defaults to light and only returns dark for explicit 'dark'", () => {
  assert.equal(resolveTheme("dark"), "dark");
  assert.equal(resolveTheme("light"), "light");
  assert.equal(resolveTheme("system"), "light");
  assert.equal(resolveTheme(null), "light");
  assert.equal(resolveTheme(undefined), "light");
  assert.equal(resolveTheme("invalid-value"), "light");
});

test("readStoredTheme and writeStoredTheme handle valid, legacy, missing, and throwing storage", () => {
  const emptyStorage = createMemoryStorage();
  assert.equal(readStoredTheme(emptyStorage), "light");

  writeStoredTheme("dark", emptyStorage);
  assert.equal(readStoredTheme(emptyStorage), "dark");

  writeStoredTheme("light", emptyStorage);
  assert.equal(readStoredTheme(emptyStorage), "light");

  const legacySystemStorage = createMemoryStorage({ [THEME_STORAGE_KEY]: "system" });
  assert.equal(readStoredTheme(legacySystemStorage), "light");

  const garbageStorage = createMemoryStorage({ [THEME_STORAGE_KEY]: "purple" });
  assert.equal(readStoredTheme(garbageStorage), "light");

  const throwingStorage = {
    getItem(): string | null {
      throw new Error("storage blocked");
    },
    setItem(): void {
      throw new Error("storage blocked");
    },
  };
  assert.equal(readStoredTheme(throwingStorage), "light");
  assert.doesNotThrow(() => writeStoredTheme("dark", throwingStorage));
});

test("client/index.html inline no-flash script uses THEME_STORAGE_KEY and matches resolveTheme()", () => {
  assert.ok(inlineScriptMatch, "Expected inline no-flash <script> in client/index.html");
  const inlineScript = inlineScriptMatch[1];
  assert.ok(
    inlineScript.includes(`"${THEME_STORAGE_KEY}"`),
    `Expected inline script to reference "${THEME_STORAGE_KEY}"`,
  );

  for (const stored of ["dark", "light", "system", "garbage", null]) {
    const classes = new Set<string>();
    let metaContent = "#f8fafc";
    const mockDocument = {
      documentElement: {
        classList: {
          add: (...tokens: string[]) => tokens.forEach((t) => classes.add(t)),
          remove: (...tokens: string[]) => tokens.forEach((t) => classes.delete(t)),
          contains: (token: string) => classes.has(token),
        },
        style: { colorScheme: "" },
      },
      querySelector: () => ({
        setAttribute: (_name: string, val: string) => {
          metaContent = val;
        },
      }),
    };
    const mockStorage = {
      getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null),
    };

    const runner = new Function("localStorage", "document", inlineScript);
    runner(mockStorage, mockDocument);

    const expected = resolveTheme(stored);
    assert.equal(classes.has(expected), true, `stored=${stored} should add class ${expected}`);
    assert.equal(classes.size, 1, `stored=${stored} should have exactly 1 theme class`);
    assert.equal(mockDocument.documentElement.style.colorScheme, expected);
    assert.equal(metaContent, expected === "dark" ? "#0b0f17" : "#f8fafc");
  }
});
