/** @type {import('next').NextConfig} */

/**
 * The finder's five destinations — Map, Stations, AI, Report and Account —
 * are tabs of a single, stateful shell (`app/page.tsx`). They have
 * shareable, refresh-safe URLs (`/map`, `/stations`, …) but share ONE React
 * tree so the map (and its Leaflet instance) never remounts between tabs.
 *
 * These rewrites make every destination URL serve that same shell on hard
 * navigation / refresh / direct entry, while the client reads the pathname
 * to restore the active tab. `destination` stays `'/'` internally so the
 * shell's HTML/JS is always what renders; the browser URL is unchanged.
 *
 * Real route segments (`/about`, `/admin`, `/offline`) are NOT rewritten.
 */
const TAB_DESTINATIONS = ["/map", "/stations", "/ai", "/report", "/account"];

const nextConfig = {
  async rewrites() {
    return TAB_DESTINATIONS.map((source) => ({
      source,
      destination: "/",
    }));
  },
};

export default nextConfig;
