import React from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Logo from "@/components/Logo";
import { useTheme } from "@/components/theme-provider";
import { Helmet } from "react-helmet-async";

const TOKEN_SWATCHES = [
  { name: "background", className: "bg-background text-foreground border" },
  { name: "card", className: "bg-card text-card-foreground border" },
  { name: "muted", className: "bg-muted text-muted-foreground border" },
  { name: "primary", className: "bg-primary text-primary-foreground" },
  { name: "secondary", className: "bg-secondary text-secondary-foreground" },
  { name: "destructive", className: "bg-destructive text-destructive-foreground" },
];

const StyleGuidePage: React.FC = () => {
  const { resolvedTheme, setTheme, toggleTheme } = useTheme();

  return (
    <Layout>
      <Helmet>
        <title>Style Guide - ContainerYard</title>
      </Helmet>
      <div className="mx-auto max-w-container px-4 py-10 sm:px-6 space-y-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
          <div>
            <h1 className="text-display">Style Guide</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              ContainerYard design system tokens, typography, log severity colors, and dual-theme surface previews.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              Active: {resolvedTheme}
            </Badge>
            <Button
              size="sm"
              variant={resolvedTheme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
            >
              Light
            </Button>
            <Button
              size="sm"
              variant={resolvedTheme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
            >
              Dark
            </Button>
            <Button size="sm" variant="secondary" onClick={toggleTheme}>
              Toggle
            </Button>
          </div>
        </div>

        {/* Dual-Theme Comparison */}
        <section className="space-y-4">
          <h2 className="text-heading">Dual-Theme Preview (Light Default + Dark)</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Light Surface Preview */}
            <div className="light rounded-lg border border-[hsl(214,28%,86%)] bg-[hsl(210,33%,99%)] p-6 text-[hsl(222,47%,11%)] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(215,22%,36%)]">
                  Light Mode (:root default)
                </span>
                <span className="rounded border border-[hsl(142,72%,29%)]/30 bg-[hsl(142,72%,29%)]/10 px-2 py-0.5 text-xs font-medium text-[hsl(142,72%,29%)]">
                  running
                </span>
              </div>
              <div className="rounded-md border border-[hsl(214,32%,89%)] bg-white p-4 space-y-2">
                <div className="font-semibold text-sm">api-gateway (piapps)</div>
                <div className="font-mono text-xs space-y-1">
                  <div className="text-[hsl(201,90%,34%)]">INFO  07:14:02 Ready on port 5008</div>
                  <div className="text-[hsl(32,95%,33%)]">WARN  07:14:05 Memory usage above 80%</div>
                  <div className="text-[hsl(0,78%,44%)]">ERROR 07:14:09 Upstream timeout (502)</div>
                  <div className="text-[hsl(268,70%,46%)]">DEBUG 07:14:10 Health probe succeeded</div>
                </div>
              </div>
            </div>

            {/* Dark Surface Preview */}
            <div className="dark rounded-lg border border-[hsl(220,15%,20%)] bg-[hsl(222,24%,7%)] p-6 text-[hsl(210,25%,96%)] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(215,16%,72%)]">
                  Dark Mode (.dark)
                </span>
                <span className="rounded border border-[hsl(142,70%,55%)]/30 bg-[hsl(142,70%,55%)]/10 px-2 py-0.5 text-xs font-medium text-[hsl(142,70%,55%)]">
                  running
                </span>
              </div>
              <div className="rounded-md border border-[hsl(220,16%,18%)] bg-[hsl(222,21%,10%)] p-4 space-y-2">
                <div className="font-semibold text-sm">api-gateway (piapps)</div>
                <div className="font-mono text-xs space-y-1">
                  <div className="text-[hsl(199,92%,62%)]">INFO  07:14:02 Ready on port 5008</div>
                  <div className="text-[hsl(38,95%,60%)]">WARN  07:14:05 Memory usage above 80%</div>
                  <div className="text-[hsl(0,86%,68%)]">ERROR 07:14:09 Upstream timeout (502)</div>
                  <div className="text-[hsl(272,76%,72%)]">DEBUG 07:14:10 Health probe succeeded</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Semantic Color Swatches */}
        <section className="space-y-4">
          <h2 className="text-heading">Semantic Tokens</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {TOKEN_SWATCHES.map((swatch) => (
              <div
                key={swatch.name}
                className={`rounded-lg p-4 text-xs font-mono font-medium ${swatch.className}`}
              >
                --{swatch.name}
              </div>
            ))}
          </div>
        </section>

        {/* Status & Log Severity Badges */}
        <section className="space-y-4">
          <h2 className="text-heading">Status &amp; Log Level Tokens</h2>
          <div className="flex flex-wrap gap-3 items-center">
            <Badge variant="outline" className="text-status-running border-status-running/30 bg-status-running/10">
              running / healthy
            </Badge>
            <Badge variant="outline" className="text-status-warning border-status-warning/30 bg-status-warning/10">
              restarting / warning
            </Badge>
            <Badge variant="outline" className="text-status-danger border-status-danger/30 bg-status-danger/10">
              unhealthy / error
            </Badge>
            <Badge variant="outline" className="text-muted-foreground border-border bg-muted/50">
              stopped / exited
            </Badge>
            <span className="font-mono text-xs font-semibold log-info">INFO</span>
            <span className="font-mono text-xs font-semibold log-warn">WARN</span>
            <span className="font-mono text-xs font-semibold log-error">ERROR</span>
            <span className="font-mono text-xs font-semibold log-debug">DEBUG</span>
            <span className="font-mono text-xs font-semibold log-fatal">FATAL</span>
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-4">
          <h2 className="text-heading">Typography</h2>
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-display">Display: The quick brown fox jumps over the lazy dog.</p>
              <p className="text-heading">Heading: The quick brown fox jumps over the lazy dog.</p>
              <p className="text-body">Body: The quick brown fox jumps over the lazy dog.</p>
              <p className="text-small text-muted-foreground">Small: The quick brown fox jumps over the lazy dog.</p>
              <p className="text-code font-mono">Code: The quick brown fox jumps over the lazy dog.</p>
            </CardContent>
          </Card>
        </section>

        {/* Buttons */}
        <section className="space-y-4">
          <h2 className="text-heading">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </section>

        {/* Cards */}
        <section className="space-y-4">
          <h2 className="text-heading">Cards</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Card Title</CardTitle>
                <CardDescription>Elevated surface with crisp 1px border</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This is the content of the card. It adapts cleanly between light and dark themes.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Another Card</CardTitle>
                <CardDescription>Secondary information panel</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  High-signal density with WCAG AA contrast across body and muted text.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Brand Logo */}
        <section className="space-y-4">
          <h2 className="text-heading">Brand Logo</h2>
          <div className="flex flex-wrap gap-8 items-end">
            <div>
              <p className="text-small text-muted-foreground mb-2">Extra Small (xs)</p>
              <Logo size="xs" />
            </div>
            <div>
              <p className="text-small text-muted-foreground mb-2">Small (sm)</p>
              <Logo size="sm" />
            </div>
            <div>
              <p className="text-small text-muted-foreground mb-2">Medium (md)</p>
              <Logo size="md" />
            </div>
            <div>
              <p className="text-small text-muted-foreground mb-2">Large (lg)</p>
              <Logo size="lg" />
            </div>
            <div>
              <p className="text-small text-muted-foreground mb-2">Extra Large (xl)</p>
              <Logo size="xl" />
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default StyleGuidePage;
