import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  type ResolvedTheme,
  type Theme,
  applyTheme,
  readStoredTheme,
  themeFromDocument,
  writeStoredTheme,
} from "@/lib/theme";

// Load:    client/index.html script resolves + sets <html class="light|dark">; we adopt it.
// Runtime: toggleTheme() switches light <-> dark and persists the explicit choice.

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ResolvedTheme) => void;
  toggleTheme: () => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    () => themeFromDocument() ?? readStoredTheme(),
  );

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ResolvedTheme) => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.classList.add("theme-transition");
      window.setTimeout(() => {
        root.classList.remove("theme-transition");
      }, 200);
    }
    writeStoredTheme(next);
    setResolvedTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeProviderContext.Provider
      value={{
        theme: resolvedTheme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
