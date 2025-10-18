import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Logo from "@/components/Logo";
import { getQueryFn, apiRequest, prefetchCsrfToken, queryClient, clearCsrfToken } from "@/lib/queryClient";
import { ApiError } from "@/lib/api";
import type { SessionUser } from "@shared/monitoring";

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If auth is disabled, redirect to dashboard immediately
  useEffect(() => {
    if (AUTH_DISABLED) {
      setLocation("/dashboard");
    }
  }, [setLocation]);

  const { data: me, isLoading } = useQuery<{ user: SessionUser } | null>({
    queryKey: ["/api/auth/me", "login"],
    queryFn: getQueryFn<{ user: SessionUser } | null>({ on401: "returnNull" }),
    staleTime: 0,
    enabled: !AUTH_DISABLED,
  });

  useEffect(() => {
    if (!isLoading && me?.user) {
      setLocation("/dashboard");
    }
  }, [me, isLoading, setLocation]);

  useEffect(() => {
    if (!AUTH_DISABLED) {
      prefetchCsrfToken().catch(() => {
        // ignore; subsequent submissions will retry
      });
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = (await res.json()) as { user: SessionUser };
      clearCsrfToken();
      await prefetchCsrfToken();
      queryClient.setQueryData(["/api/auth/me"], data);
      setLocation("/dashboard");
    } catch (err: any) {
      // Handle API errors gracefully - no raw HTML in UI
      if (err instanceof ApiError) {
        if (err.status === 'disabled') {
          setError('Authentication is disabled in this environment');
        } else if (err.status === 502 || err.status === 503) {
          setError('API unavailable (502). Please try again later.');
        } else {
          setError(err.message || 'Login failed. Please check your credentials.');
        }
      } else {
        setError(err.message ?? "Login failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show static mode message when auth is disabled
  if (AUTH_DISABLED) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Logo size="xl" className="mx-auto mb-8" />
            <CardTitle>ContainerYard</CardTitle>
            <CardDescription>Running in static mode</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                Authentication is disabled. You will be redirected to the dashboard.
              </AlertDescription>
            </Alert>
            <Button 
              className="w-full" 
              onClick={() => setLocation("/dashboard")}
            >
              Open Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Logo size="xl" className="mx-auto mb-8" />
          <CardTitle>Sign in to ContainerYard</CardTitle>
          <CardDescription>Use your administrator-provided credentials.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
