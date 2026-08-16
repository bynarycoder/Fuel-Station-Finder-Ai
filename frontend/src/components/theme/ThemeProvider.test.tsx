/**
 * Theme regression suite — Light / Dark / System.
 *
 * What these lock down:
 *  1. the default follows the SYSTEM preference, in both directions;
 *  2. an explicit choice overrides the system preference;
 *  3. the choice is PERSISTED and restored on the next mount;
 *  4. "system" keeps following the OS live (a user flipping appearance while
 *     the tab is open), while an explicit choice does NOT;
 *  5. the pre-hydration script applies the right class before first paint —
 *     the anti-flash guarantee;
 *  6. the visible control reports the real state to assistive tech.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ThemeProvider,
  THEME_STORAGE_KEY,
  themeScript,
  useTheme,
} from "@/components/theme/ThemeProvider";
import { ThemeSelector, ThemeToggleButton } from "@/components/theme/ThemeSelector";

/** Controllable `matchMedia` so the OS preference can be flipped at will. */
function installMatchMedia(dark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    get matches() {
      return current;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      void listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      void listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  };
  let current = dark;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return {
    setSystemDark(next: boolean) {
      current = next;
      for (const cb of listeners) cb({ matches: next } as MediaQueryListEvent);
    },
  };
}

function ThemeProbe() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
    </>
  );
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("system preference is the default", () => {
  it("renders dark when the OS prefers dark", async () => {
    installMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId("resolved")).toHaveTextContent("dark");
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(isDark()).toBe(true);
  });

  it("renders light when the OS prefers light", async () => {
    installMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId("resolved")).toHaveTextContent("light");
    expect(isDark()).toBe(false);
  });

  it("follows the OS live while on system", async () => {
    const media = installMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(await screen.findByTestId("resolved")).toHaveTextContent("light");

    act(() => media.setSystemDark(true));

    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(isDark()).toBe(true);
  });
});

describe("an explicit choice wins and persists", () => {
  it("selecting Dark overrides a light OS preference", async () => {
    installMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
        <ThemeSelector />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole("radio", { name: /dark/i }));

    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("ignores later OS changes once an explicit theme is chosen", async () => {
    const media = installMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
        <ThemeSelector />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole("radio", { name: /^light$/i }));
    act(() => media.setSystemDark(true));

    // Still light: the user asked for light, not "whatever the OS says".
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(isDark()).toBe(false);
  });

  it("restores the persisted preference on the next mount", async () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId("theme")).toHaveTextContent("dark");
    expect(isDark()).toBe(true);
  });

  it("can return to system after an explicit choice", async () => {
    const media = installMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
        <ThemeSelector />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole("radio", { name: /^light$/i }));
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");

    fireEvent.click(screen.getByRole("radio", { name: /system/i }));
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");

    act(() => media.setSystemDark(false));
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });
});

describe("no flash of the wrong theme before hydration", () => {
  it("the inline script applies the stored theme immediately", () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    // Exactly what layout.tsx injects into <head>.
    // eslint-disable-next-line no-eval
    eval(themeScript);

    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("falls back to the system preference when nothing is stored", () => {
    installMatchMedia(true);
    // eslint-disable-next-line no-eval
    eval(themeScript);
    expect(isDark()).toBe(true);
  });

  it("never throws when storage is unavailable", () => {
    installMatchMedia(false);
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: storage disabled");
      });

    // eslint-disable-next-line no-eval
    expect(() => eval(themeScript)).not.toThrow();
    getItem.mockRestore();
  });
});

describe("the theme controls are accessible", () => {
  it("exposes the selection as a radiogroup", async () => {
    installMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeSelector />
      </ThemeProvider>,
    );

    expect(screen.getByRole("radiogroup", { name: /colour theme/i })).toBeInTheDocument();
    const system = await screen.findByRole("radio", { name: /system/i });
    expect(system).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: /dark/i }));
    expect(screen.getByRole("radio", { name: /dark/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(system).toHaveAttribute("aria-checked", "false");
  });

  it("the compact toggle names the action and the resulting state", async () => {
    installMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeToggleButton />
      </ThemeProvider>,
    );

    const toggle = await screen.findByRole("button", { name: /switch to dark theme/i });
    fireEvent.click(toggle);

    expect(isDark()).toBe(true);
    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });
});
