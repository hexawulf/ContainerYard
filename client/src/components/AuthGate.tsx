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
    throw new Error("useAuth must be used within an AuthGate");
  }
  return ctx;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  // ✅ ALWAYS call hooks at top level (Rules of Hooks compliance)
  const { data, isLoading, refetch } = useQuery<{ user: SessionUser } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<{ user: SessionUser } | null>({ on401: "returnNull" }),
    staleTime: 0,
    refetchOnMount: true,
    enabled: !AUTH_DISABLED, // Disable query when auth is off
  });

  useEffect(() => {
    if (AUTH_DISABLED) return; // Guard logic inside hook
    if (!isLoading && !data?.user) {
      setLocation("/login");
    }
  }, [data, isLoading, setLocation]);

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

  // ✅ Conditional rendering AFTER all hooks
  if (!AUTH_DISABLED && isLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">
        Checking authentication…
      </div>
    );
  }

  if (!AUTH_DISABLED && !data?.user) {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
