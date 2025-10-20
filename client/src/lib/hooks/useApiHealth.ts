import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/api';

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

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
