import { useState, useEffect } from 'react';

// Robust API base resolution: env → runtime window var → fallback origin
const FALLBACK_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const runtimeBase = typeof window !== 'undefined' ? (window as any).__CY_API_BASE__ : '';
const API_BASE_RAW =
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ||
  runtimeBase ||
  FALLBACK_ORIGIN;

// API base URL - must be initialized first to avoid TDZ issues
export const API_BASE = API_BASE_RAW.replace(/\/+$/, ''); // strip trailing slash

// Build a correct API URL no matter what callers pass.
// Accepts: '/auth/login', 'auth/login', '/api/auth/login', 'api/auth/login'
// Always produces: <BASE>/api/<path...>
const ABSOLUTE = /^https?:\/\//i.test(API_BASE);
function buildApiUrl(path: string): string {
  // Normalize caller path to begin with /api/...
  const p = path.startsWith('/api/')
    ? path
    : path.startsWith('/api')
      ? path.replace(/^\/?api/, '/api')
      : path.startsWith('/')
        ? '/api' + path
        : '/api/' + path;
  return ABSOLUTE ? API_BASE + p : (API_BASE || '') + p;
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

/**
 * Hook to check API health status
 * Stable implementation that won't cause re-render loops
 */
export function useApiHealth(): { online: boolean; checking: boolean } {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (AUTH_DISABLED) {
      setOnline(false);
      setChecking(false);
      return;
    }

    let mounted = true;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        const res = await fetch(`${API_BASE}/health`, {
          signal: controller.signal,
          credentials: 'include',
          cache: 'no-store',
        });
        
        clearTimeout(timeout);
        
        if (mounted) {
          setOnline(res.ok);
          setChecking(false);
        }
      } catch {
        if (mounted) {
          setOnline(false);
          setChecking(false);
        }
      }
    };

    check();
    const interval = setInterval(check, 30000); // Check every 30s
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []); // Empty deps - only run once on mount

  return { online, checking };
}

