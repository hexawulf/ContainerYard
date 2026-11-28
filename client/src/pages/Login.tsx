import { errorMessage } from "@/lib/errors";
import { mapFirebaseLoginError } from "@/lib/firebaseErrors";
import type { FirebaseClientConfig } from "@/lib/firebase";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Logo from "@/components/Logo";
import { getQueryFn, apiRequest, prefetchCsrfToken, queryClient, clearCsrfToken } from "@/lib/queryClient";
import { ApiError } from "@/lib/api";
import type { SessionUser } from "@shared/monitoring";

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === "true";

// Split Firebase SDK into its own lazy chunk: only loaded on /login when enabled.
type FirebaseModule = typeof import("@/lib/firebase");
let firebaseModulePromise: Promise<FirebaseModule> | null = null;
function loadFirebase(): Promise<FirebaseModule> {
  firebaseModulePromise ??= import("@/lib/firebase").catch((err) => {
    firebaseModulePromise = null;
    throw err;
  });
  return firebaseModulePromise;
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <path
        fill="#4285F4" // theme-ok: Google brand colour
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853" // theme-ok: Google brand colour
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
      />
      <path
        fill="#FBBC05" // theme-ok: Google brand colour
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335" // theme-ok: Google brand colour
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  );
}

interface AuthConfigResponse {
  firebase?: FirebaseClientConfig;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  useEffect(() => {
    if (AUTH_DISABLED) {
      setLocation("/dashboard");
    }
  }, [setLocation]);

  const { data: me, isLoading } = useQuery<{ user: SessionUser } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<{ user: SessionUser } | null>({ on401: "returnNull" }),
    staleTime: 0,
    enabled: !AUTH_DISABLED,
  });

  const { data: authConfig } = useQuery<AuthConfigResponse | null>({
    queryKey: ["/api/auth/config"],
    queryFn: getQueryFn<AuthConfigResponse | null>({ on401: "returnNull" }),
    staleTime: 60_000,
    enabled: !AUTH_DISABLED,
  });

  const firebaseConfig = authConfig?.firebase;
  const firebaseEnabled = firebaseConfig?.enabled === true;

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

  // Prefetch the Firebase lazy chunk as soon as Google sign-in is known to be enabled,
  // so clicking the button resolves immediately within user activation (avoids popup blockers).
  useEffect(() => {
    if (firebaseEnabled) {
      void loadFirebase().catch(() => undefined);
    }
  }, [firebaseEnabled]);

  const completeLogin = async (data: { user: SessionUser }) => {
    clearCsrfToken();
    await prefetchCsrfToken().catch(() => undefined);
    queryClient.setQueryData(["/api/auth/me"], data);
    queryClient.removeQueries({ queryKey: ["/api/hosts"] });
    setLocation("/dashboard");
  };

  const handleGoogleLogin = async () => {
    if (!firebaseEnabled || !firebaseConfig) return;
    setIsGoogleSigningIn(true);
    setError(null);
    try {
      const { signInWithGooglePopup } = await loadFirebase();
      const idToken = await signInWithGooglePopup(firebaseConfig);
      const res = await apiRequest("POST", "/auth/firebase-login", { idToken });
      const data = (await res.json()) as { user: SessionUser };
      await completeLogin(data);
    } catch (err: unknown) {
      const msg = mapFirebaseLoginError(err);
      if (msg !== null) {
        setError(msg);
      }
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiRequest("POST", "/auth/login", { email, password });
      const data = (await res.json()) as { user: SessionUser };
      await completeLogin(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === "disabled") {
          setError("Authentication is disabled in this environment");
        } else if (err.status === 502 || err.status === 503) {
          setError("API unavailable (502). Please try again later.");
        } else {
          setError(err.message || "Login failed. Please check your credentials.");
        }
      } else {
        setError(errorMessage(err) ?? "Login failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isGoogleSigningIn;

  if (AUTH_DISABLED) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
        <title>Login - ContainerYard</title>
        <Card className="w-full max-w-md border-border/80 shadow-sm">
          <CardHeader className="space-y-2 text-center">
            <Logo size="lg" className="mx-auto mb-2" />
            <CardTitle className="text-xl">ContainerYard</CardTitle>
            <CardDescription>Running in static mode</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                Authentication is disabled. You will be redirected to the dashboard.
              </AlertDescription>
            </Alert>
            <Button className="w-full" onClick={() => setLocation("/dashboard")}>
              Open Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <title>Login - ContainerYard</title>
      <Card className="w-full max-w-md border-border/80 shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <Logo size="lg" className="mx-auto mb-2" />
          <CardTitle className="text-xl font-semibold tracking-tight">
            Sign in to ContainerYard
          </CardTitle>
          <CardDescription>
            Use your administrator-provided credentials to access host telemetry and logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4" data-testid="login-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {firebaseEnabled && (
            <div className="mb-4 space-y-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleGoogleLogin()}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-3"
                data-testid="google-login-button"
              >
                {isGoogleSigningIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="h-5 w-5 shrink-0" />
                )}
                <span>{isGoogleSigningIn ? "Signing in with Google…" : "Sign in with Google"}</span>
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={isBusy}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isBusy}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
