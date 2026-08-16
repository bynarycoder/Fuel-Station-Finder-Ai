"use client";

/**
 * Theme ownership for the whole product — Light / Dark / System.
 *
 * Design decisions:
 *
 * - THREE choices, one resolved value. `theme` is what the user picked
 *   ("system" included); `resolvedTheme` is the concrete light/dark actually
 *   applied. UI that renders a sun/moon must read `resolvedTheme`, while the
 *   segmented control reflects `theme`, otherwise "System" can never be shown
 *   as selected.
 *
 * - The class is applied to <html> (`darkMode: "class"` in tailwind.config).
 *   The very first paint is handled by the blocking script in `layout.tsx`
 *   (see `themeScript` below) so there is NO white flash before hydration on
 *   a dark-mode device.
 *
 * - "system" keeps LISTENING. A user who flips their OS appearance while the
 *   tab is open sees the app follow, which is the behaviour the option
 *   promises. Explicit light/dark ignore the media query entirely.
 *
 * - The preference is persisted in localStorage under one key shared with the
 *   pre-hydration script. Storage access is wrapped because Safari private
 *   mode throws on write.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "fuelfinder-theme";

interface ThemeContextValue {
  /** What the user chose, including "system". */
  theme: Theme;
  /** The concrete theme currently painted. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Runs BEFORE first paint (injected as a blocking inline script) so the
 * correct theme class exists on <html> from the very first frame. Kept tiny
 * and dependency-free — it is inlined into the document.
 */
export const themeScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=s==="dark"||((!s||s==="system")&&m);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    /* storage unavailable (private mode) — fall through to the default */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies the resolved theme to <html>. The single place that mutates it. */
function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // Native form controls, scrollbars and the URL bar follow this.
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start from "system" on the server AND the first client render so the
  // markup matches; the effect below immediately settles to the real value.
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemDark, setSystemDark] = useState(false);

  // Adopt the persisted choice + the current system preference after mount.
  useEffect(() => {
    setThemeState(readStoredTheme());
    setSystemDark(systemPrefersDark());
  }, []);

  // Follow the OS while (and only while) the user is on "system".
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* preference simply won't persist; the session still works */
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Theme accessor. Falls back to a light, no-op context when used outside the
 * provider so an isolated component test never crashes on it.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context) return context;
  return { theme: "system", resolvedTheme: "light", setTheme: () => {} };
}
