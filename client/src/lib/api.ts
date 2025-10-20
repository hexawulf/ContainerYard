// client/src/lib/api.ts
// Pure utility for API requests - NO React imports, NO hooks

// Runtime base: allow server to set window.__CY_API_BASE__
const runtimeBase =
  typeof window !== 'undefined' && (window as any).__CY_API_BASE__
    ? (window as any).__CY_API_BASE__
    : '';

const envBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
const API_BASE_RAW = (envBase?.trim() || runtimeBase || '/api').replace(/\/+$/, '');

export const API_BASE = API_BASE_RAW;

// Build a fully-qualified API path: accepts '/x', 'x', or 'http(s)://...'
function buildApiUrl(path: string): string {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  const p = ('/' + path).replace(/\/{2,}/g, '/');
  // If API_BASE already includes /api, don't duplicate it
  return API_BASE + (p.startsWith('/api/') ? p.slice(4) : p);
}

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

export class ApiError extends Error {
  constructor(
    public status: number | string,
    public body: string,
    message?: string
  ) {
    super(message || `API Error ${status}`);
    this.name = 'ApiError';
  }
}

/**
 * Centralized fetch wrapper that:
 * - Respects VITE_AUTH_DISABLED for auth endpoints
 * - Validates JSON responses (rejects HTML 502 bodies)
 * - Provides consistent error handling
 * - Supports cache control for auth endpoints
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  // Skip auth requests when auth is disabled
  if (AUTH_DISABLED && path.startsWith('/auth')) {
    throw new ApiError('disabled', '', 'Authentication is disabled in this environment');
  }

  const url = buildApiUrl(path);

  const headers: HeadersInit = {
    'Accept': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  // Force no-store cache for auth endpoints to avoid stale sessions
  const isAuthEndpoint = path.includes('/auth/');
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: options?.credentials || 'include',
    ...(isAuthEndpoint && { cache: 'no-store' }),
  };

  try {
    const res = await fetch(url, fetchOptions);

    // Check if response is JSON
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!res.ok) {
      const body = await res.text();
      
      // If we got HTML/text instead of JSON, it's likely a proxy error (502, etc.)
      if (!isJson && (body.includes('<!DOCTYPE') || body.includes('<html'))) {
        throw new ApiError(
          res.status,
          body.slice(0, 500),
          `API unavailable (${res.status}). The server may be offline.`
        );
      }

      throw new ApiError(res.status, body, `API Error ${res.status}: ${body.slice(0, 200)}`);
    }

    // Validate that successful responses are JSON when expected
    if (!isJson) {
      const body = await res.text().catch(() => '');
      throw new ApiError(
        'not-json',
        body.slice(0, 500),
        `Expected JSON response but got ${contentType.split(';')[0]} @ ${url}. Snippet: ${body.slice(0, 120)}...`
      );
    }

    return res;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network errors, CORS, etc.
    throw new ApiError('network', '', err instanceof Error ? err.message : 'Network error');
  }
}

