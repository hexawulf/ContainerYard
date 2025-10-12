# ContainerYard Design Guidelines

## Design Approach

**Selected System**: Modern Developer Tool Aesthetic (inspired by Linear, GitHub Dark, Railway, Vercel)

**Justification**: ContainerYard is a utility-focused developer tool where efficiency, log readability, and debugging speed are paramount. The design prioritizes information density, performance, and professional polish over decorative elements. Dark mode is the primary interface optimized for extended monitoring sessions.

**Core Principles**:
- Log-first hierarchy: Everything serves the live tail experience
- Instant visual feedback: State changes must be immediately apparent
- Scannable density: Maximum information without cognitive overload
- Terminal-native feel: Familiar to developers' daily tools

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary)**:
- Background: 222 14% 9% (deep charcoal, reduced eye strain)
- Surface: 222 13% 12% (cards, panels)
- Surface elevated: 222 12% 16% (hover states, modals)
- Border: 222 10% 20% (subtle divisions)
- Text primary: 210 20% 98% (high contrast)
- Text secondary: 210 10% 71% (muted info)
- Text tertiary: 210 8% 50% (labels, timestamps)

**Accent Colors**:
- Primary: 217 91% 60% (electric blue - actions, links)
- Success/Healthy: 142 76% 45% (green - running states)
- Warning: 38 92% 50% (amber - warnings, unhealthy)
- Error/Critical: 0 84% 60% (red - errors, stopped)
- Info: 199 89% 48% (cyan - info badges)

**Log Level Colors** (optimized for readability):
- ERROR: 0 84% 60%
- WARN: 38 92% 50%
- INFO: 199 89% 48%
- DEBUG: 280 65% 60% (purple)
- FATAL: 348 83% 47% (deep red)

**Light Mode** (secondary support):
- Background: 0 0% 100%
- Surface: 210 17% 98%
- Border: 214 32% 91%
- Text primary: 222 47% 11%

### B. Typography

**Font Stack**:
- Primary: 'Inter', system-ui, sans-serif (UI elements, headers)
- Code/Logs: 'JetBrains Mono', 'Fira Code', Consolas, monospace (terminal, logs)

**Scale**:
- Display: 32px/40px, font-weight 600 (dashboard title)
- Heading: 20px/28px, font-weight 600 (section headers)
- Body: 14px/20px, font-weight 400 (default)
- Small: 12px/16px, font-weight 500 (labels, timestamps)
- Code: 13px/18px, font-weight 400 (logs, terminal)

**Log Typography**:
- Fixed-width mono font for perfect alignment
- Slightly increased letter-spacing (0.01em) for clarity
- Line height 1.5 for comfortable scanning

### C. Layout System

**Spacing Primitives**: Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16, 24
- Micro spacing: 1, 2 (icon gaps, tight elements)
- Component spacing: 4, 6 (card padding, inline gaps)
- Section spacing: 8, 12 (between major sections)
- Layout spacing: 16, 24 (page margins, modal padding)

**Grid Structure**:
- Container max-width: 1600px (wide for multi-panel layouts)
- Sidebar: 280px fixed (container list)
- Main content: flex-1 (logs, terminal, timeline)
- Timeline strip: 120px height (sparklines + markers)

**Responsive Breakpoints**:
- Mobile: Single column, stacked views
- Tablet (768px): Sidebar collapses to drawer
- Desktop (1024px+): Full sidebar + main layout

### D. Component Library

**ContainerCard**:
- Compact height (80px), scannable at a glance
- Health badge (8px dot + text, top-right)
- Resource pills (CPU/Mem/Net as small chips with icons)
- Port links as clickable badges with external link icon
- Quick action icons on hover (restart/stop/start/remove)
- State indicator: 4px left border color-coded by status

**LogTail**:
- Full-height virtualized list with 1px row borders
- Timestamp column: 80px fixed width, muted color
- Level badge: 48px, color pill with abbreviation (ERR/WRN/INF)
- Message: flex-1, mono font, word-wrap enabled
- Search highlight: background 60 100% 50% with 30% opacity

**TimelineStrip**:
- Sticky at top, 120px height, glass morphism background
- Three sparkline rows (CPU/Mem/Net), 32px each
- Event markers: vertical lines with icon tooltip on hover
- Drag-to-select: semi-transparent blue overlay
- Time labels every 10s along bottom

**Terminal**:
- Full xterm.js integration with dark Dracula theme
- Minimal chrome: only connection status indicator
- Resize handle (bottom-right corner, subtle)
- Copy-on-select enabled by default
- Blinking cursor with 600ms interval

**SearchBar**:
- Prominent 48px height, full-width in header
- Pill-based active filters (dismissible with X)
- Autocomplete dropdown for saved snippets
- Regex toggle icon, DSL syntax hints on focus
- Keyboard shortcut hint (/) in placeholder

**QuickActions**:
- Icon-only buttons in card header
- Tooltip on hover with action name + keyboard shortcut
- Destructive actions (remove) require confirmation modal
- Loading spinner replaces icon during execution
- Success/error toast notifications

**Modals**:
- Centered overlay with backdrop blur
- Max-width 600px for confirmations, 900px for env vars panel
- Title + description + action buttons
- ESC to close, focus trap enabled
- Smooth slide-up animation (200ms ease-out)

**Keyboard Shortcuts Help**:
- Full-screen overlay (50% opacity backdrop)
- Grouped by category in 2-column grid
- Shortcut key badges with subtle borders
- Animated entry (fade + scale from 95%)

### E. Interactions & Animations

**Principles**: Use sparingly, prioritize performance
- State transitions: 150ms ease-out (color, opacity)
- Layout shifts: 200ms ease-in-out (drawer open/close)
- Micro-interactions: 100ms (button hover, badge appear)
- No decorative animations in log tail (performance critical)

**Key Interactions**:
- Container card hover: Lift shadow + show quick actions
- Log line hover: Subtle background highlight
- Timeline drag: Instant feedback, no lag
- Terminal typing: Zero latency, direct passthrough
- Button clicks: Ripple effect (Material-style, 300ms)

---

## Feature-Specific Design

### Live Log Tail
- Autoscroll indicator: Fixed bottom-right, blue pill "Live"
- Pause state: Amber "Paused" badge with resume button
- Smart level detection: Regex-matched keywords get color pills
- Line numbers: Optional toggle, 60px gutter when enabled

### Container Status Visualization
- Health badge prominence: Always visible, 12px font-weight 600
- Port mapping: Grouped badges with protocol icons (TCP/UDP)
- Quick stats: Minimal pill design, icon + value only
- State timeline: Horizontal bars with gaps for restarts

### Dark Mode Implementation
- Toggle: Sun/moon icon in top-right, 40px button
- Transition: 200ms all colors, smooth eye comfort
- Persistence: localStorage key 'containeryard-theme'
- System detection: matchMedia on initial load

### Keyboard Shortcuts
- Visual feedback: Highlight active shortcut key in UI
- Help overlay: Triggered by ?, categorized list
- Toast notifications: Bottom-right, 4s duration
- Conflicting shortcuts: ESC always resets/closes

---

## Accessibility & Performance

- Focus indicators: 2px blue outline with 2px offset
- Color contrast: WCAG AA minimum (4.5:1 for text)
- Screen reader: ARIA labels on icon-only buttons
- Keyboard navigation: Full tab order, skip links
- Virtual scrolling: React-window for 10k+ log lines
- WebSocket buffering: Batch updates every 100ms max
- Dark mode first: Optimized for low-light environments

---

## Visual Hierarchy

1. **Primary**: Live log stream (largest surface area, center focus)
2. **Secondary**: Container list (left sidebar, persistent context)
3. **Tertiary**: Timeline strip (top, contextual glance)
4. **Quaternary**: Actions/search (header, supporting tools)

**Information Density Strategy**:
- Compact cards without sacrificing readability
- Collapsible panels for secondary info (env vars, volumes)
- Progressive disclosure: Details on demand, not upfront
- Smart truncation: Ellipsis with full text on hover/focus