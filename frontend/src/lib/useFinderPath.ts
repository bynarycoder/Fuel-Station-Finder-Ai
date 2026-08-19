import { usePathname } from "next/navigation";

import type { FinderTab } from "@/components/shell/MobileBottomNav";

/**
 * The five finder destinations are shareable, refresh-safe URLs
 * (`/map`, `/stations`, `/ai`, `/report`, `/account`) that are served by the
 * single shell in `app/page.tsx` (see the rewrites in `next.config.mjs`).
 *
 * The browser URL is the source of truth for the active destination: it
 * restores the right tab on refresh/direct entry, drives back/forward via the
 * popstate listener, and stays in sync as the user taps a tab. Anything that
 * isn't a known tab path (e.g. `/`, `/about`, `/admin`) resolves to `"map"`,
 * which keeps the shell correct when mounted elsewhere (tests, previews).
 */
export const TAB_PATH: Record<FinderTab, string> = {
  map: "/map",
  stations: "/stations",
  ai: "/ai",
  report: "/report",
  account: "/account",
};

const PATH_TO_TAB: Record<string, FinderTab> = {
  "/map": "map",
  "/stations": "stations",
  "/ai": "ai",
  "/report": "report",
  "/account": "account",
};

/**
 * Read the active tab from the current URL. `usePathname()` is SSR-safe, so
 * deep links render their destination on first paint (no flash of the map),
 * and it reflects the address bar even though all five paths rewrite to `/`.
 */
export function useFinderTabFromUrl(): FinderTab {
  const pathname = usePathname();
  return PATH_TO_TAB[pathname ?? ""] ?? "map";
}
