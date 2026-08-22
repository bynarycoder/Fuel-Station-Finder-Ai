import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import i18n from "@/i18n/config";

void i18n.changeLanguage("en");

/**
 * Minimal App Router stub. Finder tests render `app/page.tsx` directly (not
 * inside a real Next router), so `usePathname()` reads from jsdom's actual
 * `window.location.pathname` — which the shell updates via
 * `history.pushState/replaceState`, exactly as it would in a browser.
 *
 * `mockPathname(...)` simulates a hard refresh / direct address-bar entry by
 * replacing the jsdom history entry BEFORE render.
 */
vi.mock("next/navigation", () => ({
  usePathname: () =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

export function mockPathname(pathname: string): void {
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", pathname);
  }
}

// vitest runs without `globals`, so register RTL's automatic cleanup manually.
afterEach(() => {
  cleanup();
  mockPathname("/");
});
