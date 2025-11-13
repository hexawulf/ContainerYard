import { apiFetch, ApiError } from './api';

/**
 * Bootstraps runtime config from the server when build-time env is missing.
 * Sets window.__CY_API_BASE__ and related runtime values.
 */
export async function bootstrapRuntimeConfig() {
  if (!(window as any).__CY_API_BASE__) {
    try {
      const response = await fetch('/api/runtime-config', { credentials: 'include' });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const cfg = await response.json().catch(() => null);
      
      // Safe defaults
      const defaultConfig = {
        apiBase: window.location.origin,
        appName: 'ContainerYard',
        autoDismiss: 'true',
        hosts: [],
        features: {}
      };
      
      // Validate and use config with fallbacks
      (window as any).__CY_API_BASE__ = cfg?.apiBase || defaultConfig.apiBase;
      (window as any).__CY_APP_NAME__ = cfg?.appName || defaultConfig.appName;
      (window as any).__CY_AUTO_DISMISS__ = cfg?.autoDismiss ?? defaultConfig.autoDismiss;
      (window as any).__CY_HOSTS__ = Array.isArray(cfg?.hosts) ? cfg.hosts : defaultConfig.hosts;
      (window as any).__CY_FEATURES__ = cfg?.features || defaultConfig.features;
    } catch (error) {
      console.warn('[RuntimeConfig] Failed to load runtime config, using defaults:', error);
      // Set safe defaults on error
      (window as any).__CY_API_BASE__ = window.location.origin;
      (window as any).__CY_APP_NAME__ = 'ContainerYard';
      (window as any).__CY_AUTO_DISMISS__ = 'true';
      (window as any).__CY_HOSTS__ = [];
      (window as any).__CY_FEATURES__ = {};
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
