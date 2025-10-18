// Centralized API client with error handling for non-JSON responses

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
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
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  // Skip auth requests when auth is disabled
  if (AUTH_DISABLED && path.startsWith('/auth')) {
    throw new ApiError('disabled', '', 'Authentication is disabled in this environment');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const headers: HeadersInit = {
    'Accept': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: options?.credentials || 'include',
    });

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
      const body = await res.text();
      throw new ApiError(
        'not-json',
        body.slice(0, 500),
        'Expected JSON response but got ' + contentType
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

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        await fetch(`${API_BASE}/health`, {
          signal: controller.signal,
          credentials: 'include',
        });
        
        clearTimeout(timeout);
        setOnline(true);
      } catch {
        setOnline(false);
      } finally {
        setChecking(false);
      }
    };

    check();
    const interval = setInterval(check, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  return { online, checking };
}

// Add React imports for the hook
import { useState, useEffect } from 'react';
