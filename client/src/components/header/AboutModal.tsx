import { Copy, ExternalLink, Info } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/components/AuthGate";
import { useTheme } from "@/components/theme-provider";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION =
  typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;
export const BUILD_DATE =
  typeof __BUILD_DATE__ === "undefined" ? "dev" : __BUILD_DATE__;

const TAGLINE =
  "Fast, log-first Docker container observability with live tail, status visualization, and debugging tools";

const TECH_SPECS = [
  {
    group: "Frontend",
    items: [
      "React 18, Vite, TypeScript",
      "TailwindCSS 3, shadcn/ui + Radix UI",
      "TanStack Query & Virtual, wouter",
      "xterm.js, Recharts, lucide-react",
    ],
  },
  {
    group: "Backend",
    items: [
      "Node.js, Express, TypeScript",
      "dockerode (local UNIX socket) & cAdvisor",
      "helmet, express-rate-limit, zod",
      "prom-client (Prometheus metrics)",
    ],
  },
  {
    group: "Data & Auth",
    items: [
      "Prisma + SQLite in production",
      "Redis sessions (connect-redis + ioredis)",
      "bcrypt (cost 12), CSRF tokens, audit log",
      "Drizzle/PostgreSQL optional (alerts & metrics history, disabled on SQLite)",
    ],
  },
  {
    group: "Tooling",
    items: [
      "Playwright E2E & node:test unit/integration",
      "esbuild, ESLint, Madge",
    ],
  },
];

function getShortUserAgent(): string {
  if (typeof navigator === "undefined" || !navigator.userAgent) return "unknown";
  const ua = navigator.userAgent;
  const browser =
    /Edg\/([\d.]+)/.exec(ua)?.[0] ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0] ??
    /Firefox\/([\d.]+)/.exec(ua)?.[0] ??
    /Version\/([\d.]+).*Safari/.exec(ua)?.[0] ??
    "Browser";
  const platform = /Linux|Mac OS X|Windows|Android|iPhone|iPad/.exec(ua)?.[0] ?? "OS";
  return `${browser} (${platform})`;
}

export function AboutModal() {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();

  const diagnostics = [
    `v${APP_VERSION}`,
    `build ${BUILD_DATE}`,
    `theme=${resolvedTheme}`,
    `role=${user ? user.role : "guest"}`,
    getShortUserAgent(),
  ].join(" · ");

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      toast({ title: "Diagnostics copied" });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the line and copy it manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="About ContainerYard"
              title="About ContainerYard"
              data-testid="button-about"
              className={HEADER_ICON_BUTTON_CLASS}
            >
              <Info className="h-4 w-4 text-foreground" />
              <span className="sr-only">About ContainerYard</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>About ContainerYard</TooltipContent>
      </Tooltip>

      <DialogContent
        data-testid="about-dialog"
        className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div>
              <DialogTitle className="text-lg font-semibold">
                About ContainerYard
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge
                  variant="secondary"
                  className="font-mono text-xs"
                  data-testid="about-version"
                >
                  v{APP_VERSION}
                </Badge>
                <span aria-hidden="true">·</span>
                <span data-testid="about-build-date">Built {BUILD_DATE}</span>
                <span aria-hidden="true">·</span>
                <span>License: MIT</span>
              </div>
            </div>
          </div>
          <DialogDescription className="pt-2 text-sm text-muted-foreground">
            {TAGLINE}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {user && (
            <div
              data-testid="about-runtime"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-xs"
            >
              <span className="text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">{user.email}</span>
              </span>
              <Badge variant="outline" className="font-mono text-[11px] uppercase">
                {user.role}
              </Badge>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tech Stack
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {TECH_SPECS.map((section) => (
                <div
                  key={section.group}
                  className="rounded-md border border-border/80 bg-card p-3"
                >
                  <div className="mb-1.5 text-xs font-semibold text-foreground">
                    {section.group}
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border/80 bg-card p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Developer &amp; Contact
              </h3>
              <div className="space-y-1 text-xs">
                <p>
                  <span className="text-muted-foreground">Author:</span>{" "}
                  <span className="font-medium text-foreground">0xWulf (hexawulf)</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  <a
                    href="mailto:dev@0xwulf.dev"
                    className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    dev@0xwulf.dev
                  </a>
                </p>
                <p>
                  <span className="text-muted-foreground">GitHub:</span>{" "}
                  <a
                    href="https://github.com/hexawulf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    github.com/hexawulf
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border/80 bg-card p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Project Links
              </h3>
              <ul className="space-y-1 text-xs">
                <li>
                  <a
                    href="https://github.com/hexawulf/ContainerYard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    GitHub Repository
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://hub.docker.com/repository/docker/0xwulf/containeryard/general"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Docker Hub (0xwulf/containeryard)
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/hexawulf/ContainerYard#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Docs (README)
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/hexawulf/ContainerYard/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Issues
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://containeryard.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    containeryard.org
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Diagnostics
            </h3>
            <div className="flex items-start gap-2">
              <code
                data-testid="diagnostics-line"
                className="flex-1 select-all break-words rounded-md border border-border/80 bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-foreground"
              >
                {diagnostics}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Copy diagnostics"
                title="Copy diagnostics"
                data-testid="button-copy-diagnostics"
                onClick={() => void handleCopyDiagnostics()}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
