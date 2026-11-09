// Theme resolution shared by ThemeProvider and client/index.html.
// The no-flash inline script in client/index.html repeats resolveTheme() in plain
// JS because it must run before any module loads; keep the two in sync
// (server/tests/unit/theme.test.ts checks the storage key and parity).
//
//   stored: "dark"                          → "dark"
//   stored: "light" | "system" | missing    → "light" (light by default)

export type Theme = "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "containeryard-theme";
export const THEME_COLOR_LIGHT = "#f8fafc";
export const THEME_COLOR_DARK = "#0b0f17";

function getStorage(
  explicit?: Pick<Storage, "getItem" | "setItem"> | null,
): Pick<Storage, "getItem" | "setItem"> | null {
  if (explicit !== undefined) return explicit;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem"> }).localStorage ?? null;
  }
  return null;
}

export function resolveTheme(stored?: string | null): ResolvedTheme {
  return stored === "dark" ? "dark" : "light";
}

export function readStoredTheme(storage?: Pick<Storage, "getItem"> | null): ResolvedTheme {
  try {
    const store = storage !== undefined ? storage : getStorage();
    if (!store) return "light";
    return resolveTheme(store.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light"; // storage blocked (privacy mode, sandboxed iframe)
  }
}

export function writeStoredTheme(
  theme: ResolvedTheme,
  storage?: Pick<Storage, "setItem"> | null,
): void {
  try {
    const store = storage !== undefined ? storage : getStorage();
    store?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted; the choice still applies for this page view.
  }
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
}

// The class the no-flash script already put on <html>, if any.
export function themeFromDocument(): ResolvedTheme | null {
  if (typeof document === "undefined") return null;
  const cl = document.documentElement.classList;
  if (cl.contains("dark")) return "dark";
  if (cl.contains("light")) return "light";
  return null;
}
