import { QueryClient, QueryFunction } from "@tanstack/react-query";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let csrfTokenCache: string | null = null;

export function clearCsrfToken() {
  csrfTokenCache = null;
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf", { credentials: "include" });
  await throwIfResNotOk(res);
  const data = (await res.json()) as { token: string };
  csrfTokenCache = data.token;
  return csrfTokenCache;
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }
  return fetchCsrfToken();
}

export async function prefetchCsrfToken() {
  return ensureCsrfToken();
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: {
    headers?: Record<string, string>;
    skipCsrf?: boolean;
  },
): Promise<Response> {
  const upperMethod = method.toUpperCase();
  const headers: Record<string, string> = {
    ...(options?.headers ?? {}),
  };

  if (data && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (!options?.skipCsrf && MUTATING_METHODS.has(upperMethod)) {
    const token = headers["X-CSRF-Token"] ?? (await ensureCsrfToken());
    headers["X-CSRF-Token"] = token;
  }

  const res = await fetch(url, {
    method: upperMethod,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
