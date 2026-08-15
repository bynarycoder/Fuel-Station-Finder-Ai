"use client";

/**
 * SSR-safe media query hook.
 *
 * Layout that only differs by CSS should use Tailwind breakpoints. This hook
 * is for the cases where the *behaviour* differs — e.g. a surface that is an
 * inline panel on desktop but a modal sheet on mobile, where rendering both
 * and hiding one with `lg:hidden` would leave a stray scrim and duplicate
 * focus traps.
 *
 * Returns `false` on the server and on the first client render, then settles
 * to the real value after mount, so hydration never mismatches.
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Matches the Tailwind `lg` breakpoint — the finder's split-layout threshold. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
