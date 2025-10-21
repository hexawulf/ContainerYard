import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import HostLogs from "@/pages/HostLogs";
import { useTheme } from "@/hooks/useTheme";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import LandingPage from "@/pages/Landing";
import Layout from "@/components/Layout";
import StyleGuidePage from "@/pages/StyleGuide";
import { checkApiHealthSafe, bootstrapRuntimeConfig } from "@/lib/authBootstrap";

function Router() {
  const ProtectedDashboard = () => (
    <AuthGate>
      <Layout>
        <Dashboard />
      </Layout>
    </AuthGate>
  );

  const ProtectedHostLogs = () => (
    <AuthGate>
      <Layout>
        <HostLogs />
      </Layout>
    </AuthGate>
  );

  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login">
        <Layout>
          <Login />
        </Layout>
      </Route>
      <Route path="/dashboard" component={ProtectedDashboard} />
      <Route path="/host-logs" component={ProtectedHostLogs} />
      <Route path="/styleguide" component={StyleGuidePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { effectiveTheme } = useTheme();
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootChecking, setBootChecking] = useState(true);

  useEffect(() => {
    // Bootstrap runtime config and perform health check
    (async () => {
      try {
        // Load runtime config first (sets window.__CY_* vars)
        await bootstrapRuntimeConfig();

        // Log resolved config
        console.log('[ContainerYard] Runtime config:', {
          API_BASE: import.meta.env.VITE_API_BASE,
          APP_NAME: import.meta.env.VITE_APP_NAME,
          AUTH_DISABLED: import.meta.env.VITE_AUTH_DISABLED,
          __CY_API_BASE__: (window as any).__CY_API_BASE__,
          __CY_APP_NAME__: (window as any).__CY_APP_NAME__,
        });

        // Then check API health
        const healthy = await checkApiHealthSafe();

        if (!healthy) {
          setBootError("API health check failed - server may be offline");
        }
      } catch (e: any) {
        // Catch any unexpected errors during bootstrap
        const message = e?.message ?? "Unknown boot error";
        setBootError(message);
        console.error("[ContainerYard] Boot health check failed", e);
      } finally {
        // Always complete boot check, even if it failed
        setBootChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [effectiveTheme]);

  // Show boot error screen if API is unreachable
  if (bootError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <div className="text-destructive text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-semibold text-foreground">Startup Error</h1>
          <p className="text-muted-foreground">{bootError}</p>
          <p className="text-sm text-muted-foreground/75">
            Check server logs and verify <code className="px-1 py-0.5 bg-muted rounded">/api/health</code> is accessible.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show loading while checking boot health
  if (bootChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Initializing...</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
