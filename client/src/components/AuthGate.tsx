import { createContext, useContext, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, queryClient, apiRequest, clearCsrfToken } from "@/lib/queryClient";
import type { SessionUser } from "@shared/monitoring";

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

interface AuthContextValue {
  user: SessionUser | null;
  /** True until the first /api/auth/me check has finished. */
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Soft guard: return a benign shape to avoid crash on public pages
    return { user: null, loading: false, refresh: async () => {}, logout: async () => {} };
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  // ✅ ALWAYS call hooks at top level (Rules of Hooks compliance)
  const { data, isLoading, refetch } = useQuery<{ user: SessionUser } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<{ user: SessionUser } | null>({ on401: "returnNull" }),
    staleTime: 0,
    refetchOnMount: true,
    enabled: !AUTH_DISABLED, // Disable query when auth is off
  });

  // ✅ Compute value at top level, always calling useMemo
  const value = useMemo<AuthContextValue>(() => {
    if (AUTH_DISABLED) {
      return {
        user: null,
        loading: false,
        refresh: async () => {},
        logout: async () => {
          setLocation("/login");
        },
      };
    }

    if (!data?.user) {
      // Fallback for loading/unauthenticated state
      return {
        user: null,
        loading: isLoading,
        refresh: async () => { await refetch(); },
        logout: async () => {
          setLocation("/login");
        },
      };
    }

    return {
      user: data.user,
      loading: false,
      refresh: async () => {
        await refetch();
      },
      logout: async () => {
        await apiRequest("POST", "/api/auth/logout");
        clearCsrfToken();
        queryClient.clear();
        setLocation("/login");
      },
    };
  }, [data?.user, isLoading, refetch, setLocation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (AUTH_DISABLED) return;

    // Redirect only once the session check has finished. Redirecting while it
    // was still loading sent every page refresh/deep link to /login.
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  // Show loading while checking authentication
  if (!AUTH_DISABLED && !user) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">
        Checking authentication…
      </div>
    );
  }

  return <>{children}</>;
}
