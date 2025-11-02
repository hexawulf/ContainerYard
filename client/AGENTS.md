# Client - Frontend Application

## Package Identity
React 18 frontend for ContainerYard. Provides Docker container monitoring UI with real-time logs, metrics dashboards, and web-based terminal. Built with Vite, TypeScript, shadcn/ui, and TanStack Query.

## Setup & Run

```bash
# Install dependencies (from root)
npm install

# Start dev server (client + server together)
npm run dev                    # Frontend at http://localhost:5000

# Build client only
npm run build:client           # Output: dist/public/

# Preview production build
npm run preview:e2e            # Serves on http://127.0.0.1:4173

# Type checking (includes client)
npm run check

# Lint (includes client)
npm run lint

# Check for circular dependencies
npx madge client/src --circular
```

## Patterns & Conventions

### File Organization
```
client/src/
├── components/          Component library
│   ├── ui/             shadcn/ui components (Radix primitives)
│   ├── *.tsx           Custom components (colocated, no separate folders)
│   └── AuthGate.tsx    Auth context provider (special case)
├── pages/              Page-level components (one per route)
│   ├── Dashboard.tsx   Main container list + actions
│   ├── HostLogs.tsx    Host-level log viewer
│   ├── Login.tsx       Login form
│   └── Landing.tsx     Public landing page
├── features/           Feature modules (currently unused, reserved for future)
├── hooks/              Custom React hooks
│   ├── useTheme.ts     Dark/light mode toggle
│   ├── use-toast.ts    Toast notifications (shadcn/ui)
│   ├── useKeyboardShortcuts.ts  Keyboard navigation
│   └── use-mobile.tsx  Mobile detection
├── lib/                Utilities & clients
│   ├── queryClient.ts  TanStack Query config + CSRF handling
│   ├── api.ts          Low-level fetch wrapper
│   ├── utils.ts        Helper functions (cn, etc.)
│   ├── authBootstrap.ts  Pre-fetch CSRF token
│   ├── queryParser.ts  Log search query DSL parser
│   └── logParser.ts    Log parsing utilities
├── assets/             Static assets (images, icons)
├── App.tsx             Root component (routing)
├── main.tsx            Entry point (ReactDOM.render)
├── ErrorBoundary.tsx   Top-level error handling
└── index.css           Global styles (Tailwind + custom)
```

### Component Patterns

**✅ DO: Use Functional Components**
```tsx
// client/src/components/LogsViewer.tsx
export function LogsViewer({ containerId, autoScroll = true }: LogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // ...
  return <div>...</div>;
}
```

**✅ DO: Use shadcn/ui Components**
```tsx
// Import from @/components/ui
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

<Button variant="outline" size="sm" onClick={handleClick}>
  Click Me
</Button>
```

**✅ DO: Export Named Functions (not default)**
```tsx
// Good
export function ContainerCard({ container }: ContainerCardProps) { ... }

// Avoid
export default function ContainerCard({ container }: ContainerCardProps) { ... }
```

**❌ DON'T: Use Class Components**
```tsx
// Avoid - all components should be functional
class ContainerCard extends React.Component { ... }
```

### Data Fetching Pattern

**✅ DO: Use TanStack Query for API Calls**
```tsx
// client/src/pages/Dashboard.tsx
import { useQuery } from "@tanstack/react-query";

function Dashboard() {
  const { data: containers, isLoading, error } = useQuery({
    queryKey: ["/api/containers"],
    refetchInterval: 5000, // Poll every 5s for live updates
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return <div>{containers.map(c => <ContainerCard key={c.id} container={c} />)}</div>;
}
```

**✅ DO: Use apiRequest() for Mutations (CSRF auto-handled)**
```tsx
// client/src/lib/queryClient.ts exports apiRequest
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

const mutation = useMutation({
  mutationFn: async (containerId: string) => {
    const res = await apiRequest("POST", `/api/containers/${containerId}/start`);
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/containers"] });
  },
});
```

**❌ DON'T: Bypass queryClient or Skip CSRF**
```tsx
// Bad - doesn't handle CSRF tokens
fetch("/api/containers/123/start", { method: "POST" });

// Bad - doesn't use TanStack Query caching
const [data, setData] = useState(null);
useEffect(() => {
  fetch("/api/containers").then(r => r.json()).then(setData);
}, []);
```

### Auth Pattern

**✅ DO: Use AuthGate and useAuth Hook**
```tsx
// client/src/components/AuthGate.tsx provides context
import { useAuth } from "@/components/AuthGate";

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth();
  
  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }
  
  return <div>Welcome {user.email}</div>;
}
```

### Styling Pattern

**✅ DO: Use Tailwind Classes + cn() Utility**
```tsx
// client/src/lib/utils.ts exports cn() for conditional classes
import { cn } from "@/lib/utils";

<div className={cn(
  "rounded-lg border p-4",
  isActive && "bg-accent",
  isError && "border-destructive"
)}>
  Content
</div>
```

**✅ DO: Use CSS Variables for Theme Support**
```css
/* Defined in client/src/index.css */
background-color: hsl(var(--background));
color: hsl(var(--foreground));
```

### Routing Pattern (Wouter)

**✅ DO: Define Routes in App.tsx**
```tsx
// client/src/App.tsx
import { Route, Switch } from "wouter";
import { Dashboard } from "@/pages/Dashboard";
import { HostLogs } from "@/pages/HostLogs";

<Switch>
  <Route path="/" component={Landing} />
  <Route path="/dashboard" component={Dashboard} />
  <Route path="/host-logs" component={HostLogs} />
  <Route component={NotFound} />
</Switch>
```

**✅ DO: Use Link or useLocation for Navigation**
```tsx
import { Link, useLocation } from "wouter";

<Link href="/dashboard">
  <Button>Dashboard</Button>
</Link>

// Programmatic navigation
const [_, setLocation] = useLocation();
setLocation("/dashboard");
```

### Path Aliases

**✅ DO: Use @/ for Client Imports**
```tsx
// vite.config.ts defines @/ → client/src/
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/components/AuthGate";
```

**✅ DO: Use @shared/ for Shared Types**
```tsx
// tsconfig.json defines @shared/ → shared/
import { ContainerStatus } from "@shared/schema";
```

## Touch Points / Key Files

**Entry & Config**
- `client/src/main.tsx` - ReactDOM render + QueryClientProvider + ThemeProvider
- `client/src/App.tsx` - Routing definition (Wouter) + AuthGate wrapper
- `client/index.html` - HTML template (Vite injects script tag)
- `vite.config.ts` - Build config, path aliases, plugins

**Core Infrastructure**
- `client/src/lib/queryClient.ts` - TanStack Query client + CSRF handling
- `client/src/lib/api.ts` - Low-level fetch wrapper with ApiError class
- `client/src/components/AuthGate.tsx` - Auth context (useAuth hook)
- `client/src/lib/utils.ts` - cn() utility, type helpers

**Reusable Components**
- `client/src/components/ui/*` - shadcn/ui library (48 components)
- `client/src/components/LogsViewer.tsx` - Virtual scrolling log viewer
- `client/src/components/Terminal.tsx` - xterm.js wrapper
- `client/src/components/ContainerCard.tsx` - Container status card
- `client/src/components/Navbar.tsx` - Top navigation

**Page Components**
- `client/src/pages/Dashboard.tsx` - Main container list (useQuery example)
- `client/src/pages/HostLogs.tsx` - Host-level logs (LogsViewer usage)
- `client/src/pages/Login.tsx` - Login form (react-hook-form + Zod)

**Custom Hooks**
- `client/src/hooks/useTheme.ts` - Dark/light mode (next-themes)
- `client/src/hooks/useKeyboardShortcuts.ts` - Keyboard navigation (react-hotkeys-hook)
- `client/src/hooks/use-toast.ts` - Toast notifications (shadcn/ui)

## JIT Index Hints

```bash
# Find a component export
rg -n "^export function [A-Z]\w+" client/src/components

# Find page components
ls client/src/pages

# Find hooks
rg -n "^export (function|const) use\w+" client/src/hooks

# Find API calls (TanStack Query)
rg -n "useQuery|useMutation" client/src

# Find path alias usage
rg -n "from ['\"]@/" client/src

# Find shadcn/ui component imports
rg -n "from ['\"]@/components/ui/" client/src

# Find Tailwind classes
rg -n "className=" client/src | head -20

# Find routing definitions
rg -n "<Route" client/src/App.tsx

# Find auth usage
rg -n "useAuth\(\)" client/src
```

## Common Gotchas

1. **Path Aliases**: `@/` only works in client code. Use `@shared/` for shared types.
2. **CSRF Tokens**: All POST/PUT/PATCH/DELETE requests must use `apiRequest()` from `lib/queryClient.ts` (auto-handles CSRF).
3. **TanStack Query**: Default config disables refetchOnWindowFocus and sets staleTime: Infinity. Override per-query if needed.
4. **shadcn/ui**: Components are copied into repo (not imported from npm). Customize directly in `components/ui/`.
5. **Theme Variables**: Always use CSS variables (`hsl(var(--background))`) instead of hardcoded colors.
6. **Wouter Routes**: No nested routes. All routes defined flat in `App.tsx`.
7. **Import Extensions**: TypeScript imports allow `.ts`/`.tsx` extensions (`allowImportingTsExtensions: true`).
8. **SVG Imports**: Use SVGR plugin for importing SVGs as React components: `import Logo from "./logo.svg?react"`.

## Pre-PR Checks

```bash
# Must pass before PR
npm run check                          # TypeScript type checking
npm run lint                           # ESLint
npm run build:client                   # Vite production build
npx madge client/src --circular        # No circular dependencies

# Optional but recommended
npm run e2e                            # Playwright tests (if UI changes)
```

## Design System Quick Reference

**Button Variants** (from `components/ui/button.tsx`)
- `default` - Primary action (blue)
- `destructive` - Danger action (red)
- `outline` - Secondary action (transparent)
- `secondary` - Subtle action (gray)
- `ghost` - Minimal action (no background)

**Sizes**: `default`, `sm`, `lg`, `icon`

**Card Layout** (from `components/ui/card.tsx`)
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Subtitle</CardDescription>
  </CardHeader>
  <CardContent>
    Body content
  </CardContent>
  <CardFooter>
    Footer actions
  </CardFooter>
</Card>
```

**Toast Notifications** (from `hooks/use-toast.ts`)
```tsx
import { useToast } from "@/hooks/use-toast";

const { toast } = useToast();

toast({
  title: "Success",
  description: "Operation completed",
  variant: "default", // or "destructive"
});
```
