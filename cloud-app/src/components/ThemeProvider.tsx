"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_STORAGE_KEY = "iris-theme";

function readDomTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-safe initial state. The real value is read from the DOM after mount,
  // where THEME_BOOTSTRAP_SCRIPT has already applied the user's preference.
  const [theme, setThemeState] = useState<Theme>("light");

  const apply = useCallback((next: Theme, persist: boolean) => {
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    if (persist) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // private mode or quota: ignore
      }
    }
    setThemeState(next);
  }, []);

  const setTheme = useCallback((next: Theme) => apply(next, true), [apply]);

  // Read DOM as source of truth (bootstrap script already ran), not React state,
  // so toggle stays correct even before the mount-effect syncs state.
  const toggle = useCallback(() => {
    const current = readDomTheme();
    apply(current === "dark" ? "light" : "dark", true);
  }, [apply]);

  // Sync React state with the DOM exactly once after mount.
  useEffect(() => {
    setThemeState(readDomTheme());
  }, []);

  // Follow system changes only when the user has not made an explicit choice.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (window.localStorage.getItem(THEME_STORAGE_KEY) != null) return;
      } catch {
        return;
      }
      apply(media.matches ? "dark" : "light", false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [apply]);

  // Sync state across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      if (e.newValue === "light" || e.newValue === "dark") {
        apply(e.newValue, false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [apply]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return ctx;
}

/**
 * Inline bootstrap script. Runs before React hydration so the initial paint
 * already matches the user's preference. Reads localStorage first, falls back
 * to prefers-color-scheme. Failures are swallowed so a broken localStorage
 * never blocks page load.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
(function(){try{
var k='${THEME_STORAGE_KEY}';
var t=localStorage.getItem(k);
if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
var r=document.documentElement;
if(t==='dark')r.classList.add('dark');
r.style.colorScheme=t;
}catch(e){}})();
`.trim();
