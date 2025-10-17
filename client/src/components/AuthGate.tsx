import { createContext, useContext, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, queryClient, apiRequest, clearCsrfToken } from "@/lib/queryClient";
import type { SessionUser } from "@shared/monitoring";

interface AuthContextValue {
  user: SessionUser;
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
  const { data, isLoading, refetch } = useQuery<{ user: SessionUser } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<{ user: SessionUser } | null>({ on401: "returnNull" }),
    staleTime: 0,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!isLoading && !data?.user) {
      setLocation("/login");
    }
  }, [data, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">
        Checking authentication…
      </div>
    );
  }

  if (!data?.user) {
    return null;
  }

  const value = useMemo<AuthContextValue>(() => {
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
  }, [data.user, refetch, setLocation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
