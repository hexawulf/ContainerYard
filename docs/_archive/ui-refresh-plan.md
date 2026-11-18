# ContainerYard UI Refresh & Theme System Plan

## 1. Objectives
1. **Light/Dark Mode Toggle (Light Default)**:
   - Persistent per-browser preference via `localStorage` (`containeryard-theme`).
   - Resolution rules: `"dark"` → `dark`, `"light"` → `light`, missing/invalid/legacy `"system"` → `light` (light by default, ignoring OS preference unless explicitly toggled to dark).
   - Zero flash of wrong theme (FOUC) on initial page load via inline `<script>` in `client/index.html` setting `<html class="light|dark">` and `document.documentElement.style.colorScheme`.
   - `ThemeProvider` React context (`client/src/components/theme-provider.tsx`) + pure helpers (`client/src/lib/theme.ts`) + accessible `ThemeToggle` button (`client/src/components/theme-toggle.tsx`, `data-testid="button-theme-toggle"`).
   - Toggle rendered in `Navbar` and visible across all routes: Landing (`/`), Login (`/login`), Dashboard (`/dashboard`), HostLogs (`/hosts/:hostId/logs`), StyleGuide (`/styleguide`), and 404.
2. **Design Token & UI Refresh**:
   - Retune `:root` (light) and `.dark` CSS custom properties in `client/src/index.css` for crisp contrast (WCAG AA ≥ 4.5:1 body text, ≥ 3:1 UI elements), subtle elevated surfaces, refined primary blue, semantic status tokens (`--status-running`, `--status-warning`, `--status-danger`, `--status-neutral`), and theme-aware log level classes (`.log-error`, `.log-warn`, `.log-info`, `.log-debug`, `.log-fatal`).
   - Replace hardcoded colors in `StackView.tsx`, `MetricsWidgets.tsx`, `HistoricalMetricsChart.tsx`, `TimelineStrip.tsx`, `LogTail.tsx`, `LogsDrawer.tsx`, `LogRateHeatmap.tsx`, `EnvVarsPanel.tsx`, `RestartComparison.tsx`, `Landing.tsx`, and `Logo.tsx` with semantic tokens and theme-aware styles.
   - Keep `Terminal.tsx` (xterm.js) dark in both themes with a clean terminal frame in light mode.
   - Fix duplicate nested `extend` in `tailwind.config.ts`.
   - Polish `Navbar`, `Footer`, `Landing`, `Login`, `Dashboard`, `HostLogs`, `not-found`, and `StyleGuide` for desktop (`1440x900`) and mobile (`390x844` / `375px` width) with zero horizontal scroll.
3. **Repository Hygiene**:
   - Use `git mv` to archive stale root clutter (old implementation notes, status reports, test screenshots and scratch files) into `docs/_archive/` (since removed).
4. **Testing & Verification**:
   - Unit test `server/tests/unit/theme.test.ts` verifying `resolveTheme`, `readStoredTheme`, `writeStoredTheme`, and parity with the inline script in `client/index.html`.
   - E2E test `e2e/theme.spec.ts` verifying default light class at `DOMContentLoaded`, toggle visibility on Landing/Login, persistence across reloads, clearing storage, and legacy `"system"` fallback to `"light"`, plus capturing desktop and mobile light/dark screenshots into `docs/screenshots/ui-refresh/`.
