# ContainerYard Design Guidelines

## Design Approach

**Selected System**: Modern Developer Tool Aesthetic (inspired by Linear, Vercel, GitHub Light & Dark)

**Justification**: ContainerYard is a utility-focused developer tool where efficiency, log readability, and debugging speed are paramount. The design prioritizes information density, performance, and professional polish over decorative elements. **Light mode is the default interface**, with **Dark mode as a first-class toggle** persisted per browser (`containeryard-theme`) and applied before first paint with zero theme flash.

**Core Principles**:
- Log-first hierarchy: Everything serves the live tail experience
- Instant visual feedback: State changes must be immediately apparent
- Scannable density: Maximum information without cognitive overload
- Dual-theme parity: WCAG AA contrast (≥ 4.5:1 body text, ≥ 3:1 UI) in both light and dark modes
- Terminal-native feel: Embedded shell (xterm.js) stays dark in both themes, cleanly framed in light mode

---

## Core Design Elements

### A. Color Palette & Token Tables

#### Light Mode (`:root`, Default)

| Token | HSL Value | Purpose / Contrast Notes |
| --- | --- | --- |
| `--background` | `210 33% 99%` | Near-white page canvas (`#fafbfd`) |
| `--foreground` | `222 47% 11%` | Primary body text (~17.4:1 vs background) |
| `--card` | `0 0% 100%` | Elevated pure-white cards & panels |
| `--card-foreground` | `222 47% 11%` | Card primary text |
| `--card-border` | `214 32% 89%` | Crisp 1px card border |
| `--border` | `214 28% 86%` | Standard structural divider |
| `--input` | `214 26% 82%` | Form control border |
| `--primary` | `217 91% 50%` | Refined primary blue (~5.15:1 with white text) |
| `--primary-foreground` | `0 0% 100%` | Button / badge text on primary |
| `--secondary` | `214 32% 93%` | Subtle secondary surface |
| `--secondary-foreground` | `222 47% 11%` | Text on secondary |
| `--muted` | `210 28% 95%` | Muted panels & table headers |
| `--muted-foreground` | `215 22% 36%` | Secondary text (~7.1:1 on card, ~6.2:1 on muted) |
| `--accent` | `214 32% 94%` | Hover / active highlight |
| `--destructive` | `0 78% 48%` | Danger / error actions (~5.6:1 with white text) |
| `--status-running` | `142 72% 29%` | Running / healthy state (~5.1:1 on white) |
| `--status-warning` | `32 95% 34%` | Restarting / warning state (~5.3:1 on white) |
| `--status-danger` | `0 78% 46%` | Unhealthy / error state (~5.9:1 on white) |
| `--status-info` | `199 89% 34%` | Paused / informational state (~5.3:1 on white) |
| `--log-error` | `0 78% 44%` | `ERROR` log severity (~6.3:1 on white) |
| `--log-warn` | `32 95% 33%` | `WARN` log severity (~5.5:1 on white) |
| `--log-info` | `201 90% 34%` | `INFO` log severity (~5.4:1 on white) |
| `--log-debug` | `268 70% 46%` | `DEBUG` log severity (~6.0:1 on white) |
| `--log-fatal` | `346 84% 40%` | `FATAL` log severity (~6.6:1 on white) |

#### Dark Mode (`.dark`, First-Class Toggle)

| Token | HSL Value | Purpose / Contrast Notes |
| --- | --- | --- |
| `--background` | `222 24% 7%` | Deep charcoal canvas (`#0d1117`) |
| `--foreground` | `210 25% 96%` | High-contrast primary text (~17.5:1 vs background) |
| `--card` | `222 21% 10%` | Subtle elevated card surface (`#141923`) |
| `--card-foreground` | `210 25% 96%` | Card primary text |
| `--card-border` | `220 16% 18%` | 1px card border |
| `--border` | `220 15% 20%` | Standard structural divider |
| `--input` | `220 15% 24%` | Form control border |
| `--primary` | `217 91% 60%` | Electric blue primary accent |
| `--primary-foreground` | `0 0% 100%` | Text on primary |
| `--secondary` | `220 16% 17%` | Subtle secondary surface |
| `--secondary-foreground` | `210 25% 96%` | Text on secondary |
| `--muted` | `220 16% 14%` | Muted panels & table headers |
| `--muted-foreground` | `215 16% 72%` | Secondary text (~8.8:1 on background, ~7.6:1 on card) |
| `--accent` | `220 16% 16%` | Hover / active highlight |
| `--destructive` | `0 72% 51%` | Danger / error actions |
| `--status-running` | `142 70% 55%` | Running / healthy state (~9.6:1 on dark) |
| `--status-warning` | `38 95% 60%` | Restarting / warning state (~9.2:1 on dark) |
| `--status-danger` | `0 86% 68%` | Unhealthy / error state (~6.2:1 on dark) |
| `--status-info` | `199 92% 62%` | Paused / informational state (~8.8:1 on dark) |
| `--log-error` | `0 86% 68%` | `ERROR` log severity (~6.2:1 on dark) |
| `--log-warn` | `38 95% 60%` | `WARN` log severity (~9.2:1 on dark) |
| `--log-info` | `199 92% 62%` | `INFO` log severity (~8.8:1 on dark) |
| `--log-debug` | `272 76% 72%` | `DEBUG` log severity (~6.8:1 on dark) |
| `--log-fatal` | `348 88% 66%` | `FATAL` log severity (~5.8:1 on dark) |

### B. Typography

**Font Stack**:
- Primary: `'Inter', system-ui, sans-serif` (UI elements, headers)
- Code/Logs: `'JetBrains Mono', 'Fira Code', Consolas, monospace` (terminal, logs, metrics)

**Scale**:
- Display: `32px/40px`, `font-weight: 600` (dashboard & page titles)
- Heading: `20px/28px`, `font-weight: 600` (section headers)
- Body: `14px/20px`, `font-weight: 400` (default)
- Small: `12px/16px`, `font-weight: 500` (labels, timestamps)
- Code: `13px/18px`, `font-weight: 400` (logs, terminal)

### C. Layout System

**Spacing Primitives**: Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16, 24
- Container max-width: `1600px` (`max-w-container`) with `px-4 sm:px-6` horizontal padding
- Responsive breakpoints:
  - Mobile (`375px`–`767px`): Single column, stacked views, wrapped action bars, zero horizontal overflow
  - Tablet (`768px`–`1023px`): Multi-card grids
  - Desktop (`1024px+`): Two-column split (`minmax(0,1.25fr)_minmax(0,1fr)`) for container list + telemetry overview

### D. Theme System Implementation

- **Default**: Light mode (`<html class="light">`)
- **Toggle**: Sun/Moon icon button (`data-testid="button-theme-toggle"`) in the right side of `Navbar` on every route (Landing, Login, Dashboard, HostLogs, StyleGuide, 404)
- **Persistence**: `localStorage` key `'containeryard-theme'`. Stored `'dark'` resolves to `'dark'`; `'light'`, missing, invalid, or legacy `'system'` resolves to `'light'`
- **No-Flash Script**: Inline `<script>` in `client/index.html` sets `<html class="light|dark">`, `document.documentElement.style.colorScheme`, and `<meta name="theme-color">` before any module loads
- **Transition**: 150ms color transition applied only on user toggle (`html.theme-transition`) and disabled under `prefers-reduced-motion: reduce` and during first paint
