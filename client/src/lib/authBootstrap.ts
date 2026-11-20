import { apiFetch, ApiError } from './api';

/**
 * Bootstraps runtime config from the server when build-time env is missing.
 * Sets window.__CY_API_BASE__ and related runtime values.
 */
/** GET /api/runtime-config (server/src/routes/runtimeConfig.ts); every field optional. */
interface RuntimeConfigResponse {
  apiBase?: string;
  appName?: string;
  autoDismiss?: string;
  features?: CyFeatures;
}

export async function bootstrapRuntimeConfig() {
  if (!window.__CY_API_BASE__) {
    try {
      const response = await fetch('/api/runtime-config', { credentials: 'include' });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const cfg = (await response.json().catch(() => null)) as RuntimeConfigResponse | null;
      
      // Safe defaults
      const defaultConfig = {
        apiBase: window.location.origin,
        appName: 'ContainerYard',
        autoDismiss: 'true',
        features: {}
      };
      
      // Validate and use config with fallbacks
      window.__CY_API_BASE__ = cfg?.apiBase || defaultConfig.apiBase;
      window.__CY_APP_NAME__ = cfg?.appName || defaultConfig.appName;
      window.__CY_AUTO_DISMISS__ = cfg?.autoDismiss ?? defaultConfig.autoDismiss;
      window.__CY_FEATURES__ = cfg?.features || defaultConfig.features;
    } catch (error) {
      console.warn('[RuntimeConfig] Failed to load runtime config, using defaults:', error);
      // Set safe defaults on error
      window.__CY_API_BASE__ = window.location.origin;
      window.__CY_APP_NAME__ = 'ContainerYard';
      window.__CY_AUTO_DISMISS__ = 'true';
      window.__CY_FEATURES__ = {};
    }
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
