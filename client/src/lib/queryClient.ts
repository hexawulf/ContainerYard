import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiFetch, ApiError, API_BASE } from "./api";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

let csrfTokenCache: string | null = null;

export function clearCsrfToken() {
  csrfTokenCache = null;
}

async function fetchCsrfToken(): Promise<string> {
  if (AUTH_DISABLED) {
    return "disabled";
  }
  const res = await apiFetch("/auth/csrf");
  const data = (await res.json()) as { csrfToken: string };
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }
  return fetchCsrfToken();
}

export async function prefetchCsrfToken() {
  if (AUTH_DISABLED) {
    return "disabled";
  }
  return ensureCsrfToken();
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    
    // If we got HTML instead of JSON, provide a cleaner error message
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new ApiError(
        res.status,
        text.slice(0, 500),
        `API unavailable (${res.status}). The server may be offline.`
      );
    }
    
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
  // Defensive programming: ensure method is defined
  if (!method || typeof method !== 'string') {
    throw new Error('apiRequest: method parameter is required and must be a string');
  }
  const upperMethod = method.toUpperCase();
  const headers: Record<string, string> = {
    ...(options?.headers ?? {}),
  };

  if (data && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (!options?.skipCsrf && MUTATING_METHODS.has(upperMethod)) {
    const token = headers["x-csrf-token"] ?? (await ensureCsrfToken());
    headers["x-csrf-token"] = token;
  }

  // Use apiFetch for consistent error handling
  const res = await apiFetch(url, {
    method: upperMethod,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build path from query key, encoding container IDs that contain slashes
    const pathSegments: string[] = [];
    
    for (const segment of queryKey) {
      if (typeof segment === 'string') {
        pathSegments.push(segment);
      }
      // Skip non-string segments (like query params objects)
    }
    
    // Join segments with `/`, properly encoding any special characters
    // For paths like: ["/api/hosts", "piapps2", "containers", "/system.slice/docker-xxx.scope"]
    // We need to encode the container ID part but not the path structure
    const fullPath = pathSegments
      .map((seg, idx) => {
        // First segment is usually "/api/hosts" - keep as-is
        if (idx === 0) return seg;
        // For container IDs that start with /, encode them
        if (seg.startsWith('/') && idx > 0) {
          return encodeURIComponent(seg);
        }
        return seg;
      })
      .join('/');

    try {
      const res = await apiFetch(fullPath);
      return await res.json();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
      }
      throw err;
    }
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
