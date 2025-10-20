import { apiFetch, ApiError } from './api';

/**
 * Bootstraps runtime config from the server when build-time env is missing.
 * Sets window.__CY_API_BASE__ and related runtime values.
 */
export async function bootstrapRuntimeConfig() {
  if (!(window as any).__CY_API_BASE__) {
    try {
      const cfg = await fetch('/api/runtime-config', { credentials: 'include' }).then(r => r.json());
      (window as any).__CY_API_BASE__ = cfg?.apiBase || window.location.origin;
      (window as any).__CY_APP_NAME__ = cfg?.appName || 'ContainerYard';
      (window as any).__CY_AUTO_DISMISS__ = cfg?.autoDismiss ?? 'true';
    } catch {
      (window as any).__CY_API_BASE__ = window.location.origin;
    }
  }
}

/**
 * Safely loads the current user session without throwing errors.
 * Used during app bootstrap to avoid crashing the UI if auth endpoint fails.
 *
 * @returns User object if authenticated, null otherwise
 */
export async function loadUserSafe(): Promise<any | null> {
  try {
    const res = await apiFetch('/auth/me', { cache: 'no-store' });
    const data = await res.json();
    return data?.user ?? null;
  } catch (err) {
    // Log but don't throw - auth failures should never crash the UI
    console.warn('[Auth Bootstrap] Failed to load user session:', err instanceof ApiError ? err.message : err);
    return null;
  }
}

/**
 * Checks if the API is healthy without throwing errors.
 * Used during app bootstrap to detect server availability.
 * 
 * @returns true if healthy, false otherwise
 */
export async function checkApiHealthSafe(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const res = await apiFetch('/health', { signal: controller.signal });
    clearTimeout(timeout);
    
    return res.ok;
  } catch (err) {
    console.warn('[Auth Bootstrap] API health check failed:', err instanceof ApiError ? err.message : err);
    return false;
  }
}
