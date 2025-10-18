import { useApiHealth } from "@/lib/api";

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

export function ApiStatusBanner() {
  const { online, checking } = useApiHealth();

  // Don't show banner while checking or if API is online
  if (checking || (online && !AUTH_DISABLED)) {
    return null;
  }

  // Show offline/static mode banner
  if (!online || AUTH_DISABLED) {
    return (
      <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-b border-amber-500/30 px-4 py-2">
        <div className="container mx-auto">
          <p className="text-sm text-center">
            {AUTH_DISABLED 
              ? "⚠️ Running in static mode - API disabled" 
              : "⚠️ API offline - Running in static mode"}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
