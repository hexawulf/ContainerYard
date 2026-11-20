/**
 * Runtime values set on window by lib/authBootstrap.ts from
 * GET /api/runtime-config (server/src/routes/runtimeConfig.ts).
 */
export {};

declare global {
  interface CyFeatures {
    logs?: boolean;
    multiHost?: boolean;
    alerts?: boolean;
    savedSearches?: boolean;
    logBookmarks?: boolean;
    historicalMetrics?: boolean;
    restartTracking?: boolean;
  }

  interface Window {
    __CY_API_BASE__?: string;
    __CY_APP_NAME__?: string;
    __CY_AUTO_DISMISS__?: string;
    __CY_FEATURES__?: CyFeatures;
  }

  interface ImportMetaEnv {
    readonly VITE_API_BASE?: string;
    readonly VITE_AUTH_DISABLED?: string;
  }
}
