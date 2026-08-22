import { usePathname } from "next/navigation";

import type { FinderTab } from "@/components/shell/MobileBottomNav";

/**
 * The five finder destinations are shareable, refresh-safe URLs
 * (`/map`, `/stations`, `/ai`, `/report`, `/account`) that are served by the
 * single shell in `app/page.tsx` (see the rewrites in `next.config.mjs`).
 *
 * The browser URL is the source of truth for the active destination: it
 * restores the right tab on refresh/direct entry, drives back/forward, and
 * stays in sync as the user taps a tab. Anything that isn't a known tab path
 * (e.g. `/`, `/about`, `/admin`) resolves to `"map"`, which keeps the shell
 * correct when mounted elsewhere (tests, previews).
 */
export const TAB_PATH: Record<FinderTab, string> = {
  map: "/map",
  stations: "/stations",
  ai: "/ai",
  report: "/report",
  account: "/account",
};

export const PATH_TO_TAB: Record<string, FinderTab> = {
  "/map": "map",
  "/stations": "stations",
  "/ai": "ai",
  "/report": "report",
  "/account": "account",
};

/**
 * Return the current pathname. `usePathname()` is SSR-safe and re-renders on
 * every client navigation (including `history.pushState`), so the shell can
 * keep its surface state reconciled with the address bar regardless of
 * whether a destination was reached via a tab tap, the brand link,
 * back/forward or a hard refresh.
 */
export function useFinderPathname(): string {
  return usePathname() ?? "";
}

/** Derive the active tab from a pathname (defaults to `"map"`). */
export function tabFromPathname(pathname: string): FinderTab {
  return PATH_TO_TAB[pathname] ?? "map";
}
