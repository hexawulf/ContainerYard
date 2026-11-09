import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ship, Terminal, GitFork, Activity, Search, ShieldCheck } from "lucide-react";
import { Helmet } from "react-helmet-async";

const SAMPLE_LOGS = [
  { ts: "07:14:02.104", level: "INFO", cls: "log-info", msg: "container=api-gateway status=healthy latency_ms=4.2" },
  { ts: "07:14:02.418", level: "INFO", cls: "log-info", msg: "container=worker-queue job=sync_metrics duration_ms=19" },
  { ts: "07:14:03.009", level: "WARN", cls: "log-warn", msg: "container=redis-cache memory_pct=82.4 threshold=80" },
  { ts: "07:14:03.512", level: "DEBUG", cls: "log-debug", msg: "container=traefik route=/api/hosts/edge-01/containers 200" },
  { ts: "07:14:04.110", level: "ERROR", cls: "log-error", msg: "container=billing-svc upstream_timeout retry=1/3" },
];

const LandingPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>ContainerYard - Self-Hosted Docker Management</title>
      </Helmet>

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden border-b border-border/70 bg-background">
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 transform-gpu overflow-hidden blur-3xl"
          aria-hidden="true"
        >
          <div className="mx-auto aspect-[1155/420] w-[56rem] max-w-full bg-gradient-to-tr from-primary/15 via-[hsl(var(--chart-5))]/15 to-transparent opacity-70" />
        </div>

        <div className="mx-auto max-w-container px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Badge variant="secondary" className="mb-4 gap-1.5 px-2.5 py-0.5 text-xs font-medium">
                <span className="h-2 w-2 rounded-full bg-status-running" />
                Self-Hosted Docker Observability
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl lg:leading-[1.12]">
                A self-hosted container management platform
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Deploy, manage, and monitor your containerized applications with a calm, high-signal interface built around real-time log streaming and host telemetry.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/dashboard">
                  <Button size="lg">Open Dashboard</Button>
                </Link>
                <Link href="/styleguide">
                  <Button size="lg" variant="outline">
                    Style Guide
                  </Button>
                </Link>
              </div>
            </div>

            {/* Live Telemetry & Log Tail Preview */}
            <div className="lg:col-span-5">
              <Card className="overflow-hidden border-border/90 shadow-md">
                <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-status-running" />
                    <span className="font-mono text-xs font-medium text-foreground">edge-01 • live tail</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-[11px] text-status-running border-status-running/30 bg-status-running/10">
                    SSE Connected
                  </Badge>
                </div>
                <CardContent className="divide-y divide-border/60 p-0 font-mono text-xs">
                  {SAMPLE_LOGS.map((row) => (
                    <div key={row.ts} className="flex items-start gap-2.5 px-3.5 py-2 hover:bg-muted/40">
                      <span className="shrink-0 text-muted-foreground tabular-nums">{row.ts}</span>
                      <span className={`w-11 shrink-0 font-semibold ${row.cls}`}>{row.level}</span>
                      <span className="break-all text-foreground/90">{row.msg}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-container px-4 sm:px-6">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
              High-Signal Observability
            </h2>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Everything you need to inspect and debug your fleet
            </p>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              ContainerYard provides a fast, read-first interface for multi-host container monitoring, structured log search, and metric correlation.
            </p>
          </div>

          <div className="mx-auto mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Ship className="h-4 w-4" />
                  </div>
                  Containerization
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Inspect container state, Compose stacks, port bindings, networks, and mounts across multiple Docker and cAdvisor hosts.
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Terminal className="h-4 w-4" />
                  </div>
                  Real-time Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Stream container and host logs in real time with virtualized scrolling, regex filtering, and severity highlighting.
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Activity className="h-4 w-4" />
                  </div>
                  Metric-to-Log Jump
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Click any CPU, memory, or network spike on the live timeline to jump straight to that exact moment in the container logs.
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Search className="h-4 w-4" />
                  </div>
                  Host Log Whitelist
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Read whitelisted host logs (Nginx, PM2, Prometheus, Grafana) safely from the browser with instant client and server grep.
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  Hardened Security
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                Session authentication, CSRF protection on all mutations, role-based access control, and read-only UNIX socket defaults.
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <GitFork className="h-4 w-4" />
                  </div>
                  Open Source
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                ContainerYard is open source and built for self-hosted homelabs and edge nodes—lightweight, fast, and customizable.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
};

export default LandingPage;
