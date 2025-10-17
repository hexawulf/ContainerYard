import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import { useTheme } from "@/hooks/useTheme";
import { useEffect } from "react";
import { AuthGate } from "@/components/AuthGate";
import LandingPage from "@/pages/Landing";
import Layout from "@/components/Layout";
import StyleGuidePage from "@/pages/StyleGuide";

function Router() {
  const ProtectedDashboard = () => (
    <AuthGate>
      <Layout>
        <Dashboard />
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
      <Route path="/styleguide" component={StyleGuidePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { effectiveTheme } = useTheme();

  useEffect(() => {
    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [effectiveTheme]);

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
