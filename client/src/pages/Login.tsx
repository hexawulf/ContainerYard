import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandLogo } from "@/components/BrandLogo";
import { getQueryFn, apiRequest, prefetchCsrfToken, queryClient, clearCsrfToken } from "@/lib/queryClient";
import type { SessionUser } from "@shared/monitoring";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: me, isLoading } = useQuery<{ user: SessionUser } | null>({
    queryKey: ["/api/auth/me", "login"],
    queryFn: getQueryFn<{ user: SessionUser } | null>({ on401: "returnNull" }),
    staleTime: 0,
  });

  useEffect(() => {
    if (!isLoading && me?.user) {
      setLocation("/");
    }
  }, [me, isLoading, setLocation]);

  useEffect(() => {
    prefetchCsrfToken().catch(() => {
      // ignore; subsequent submissions will retry
    });
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
      setLocation("/");
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BrandLogo variant="mark" size={32} className="text-brand-700 dark:text-white" />
            <BrandLogo variant="wordmark" size={120} className="text-foreground" />
          </div>
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
