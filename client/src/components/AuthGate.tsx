import { createContext, useContext, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, queryClient, apiRequest, clearCsrfToken } from "@/lib/queryClient";
import type { SessionUser } from "@shared/monitoring";

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

interface AuthContextValue {
  user: SessionUser | null;
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
        refresh: async () => { await refetch(); },
        logout: async () => {
          setLocation("/login");
        },
      };
    }

    return {
      user: data.user,
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
  }, [data?.user, refetch, setLocation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (AUTH_DISABLED) return;
    
    // If user is null (not authenticated), redirect to login
    if (!user) {
      setLocation("/login");
    }
  }, [user, setLocation]);

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
