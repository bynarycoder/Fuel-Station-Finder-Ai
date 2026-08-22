/**
 * Test helper: a controllable viewport.
 *
 * jsdom has no layout engine, so `window.innerWidth` and `window.matchMedia`
 * are independent of one another and neither reacts to the other. Tests that
 * care about responsive behaviour therefore need a harness that keeps the two
 * in sync and notifies subscribers on resize — otherwise a component using
 * `matchMedia` (our `useMediaQuery`) simply never sees the breakpoint change.
 *
 * `setViewportWidth(px)` sets `innerWidth`, re-evaluates every media query
 * registered through `window.matchMedia`, fires `change` on the lists whose
 * result flipped, and dispatches a `resize` event — i.e. the observable part
 * of what a real browser does when the window is resized or a phone is
 * rotated.
 *
 * Only the width-based features this codebase actually queries are supported
 * (`min-width` / `max-width`), which covers all Tailwind breakpoints.
 */

import { vi } from "vitest";

/** Width in CSS pixels of the viewports the finder is verified against. */
export const BREAKPOINTS = {
  /** Smallest phone we support — Galaxy S8/A-series, iPhone SE landscape-free. */
  mobileSmall: 360,
  /** Small phone — iPhone 12/13/14, the most common Nigerian Android width. */
  mobile: 390,
  /** Large phone — iPhone 11/XR/14 Plus. */
  mobileLarge: 414,
  /** Largest common phone — iPhone 15/16 Pro Max. */
  mobileXl: 430,
  /** Tablet portrait — still the mobile layout (below Tailwind `lg`). */
  tablet: 768,
  /** Tailwind `lg` — the exact threshold where the split layout appears. */
  laptop: 1024,
  /** Large desktop — map + rail + panel at full width. */
  desktop: 1440,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

interface TrackedList {
  query: string;
  matches: boolean;
  listeners: Set<(e: MediaQueryListEvent) => void>;
}

let tracked: TrackedList[] = [];
let currentWidth = 1024;
let originalMatchMedia: typeof window.matchMedia | undefined;
let installed = false;

/** Evaluate a width-based media query against a viewport width. */
function evaluate(query: string, width: number): boolean {
  // Multiple comma-separated queries: any match wins.
  return query.split(",").some((part) => {
    const clauses = part.split(" and ").map((c) => c.trim());
    return clauses.every((clause) => {
      const min = /\(min-width:\s*(\d+(?:\.\d+)?)px\)/.exec(clause);
      if (min) return width >= Number(min[1]);
      const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(clause);
      if (max) return width <= Number(max[1]);
      // Anything we don't model (print, hover, reduced-motion…) stays false so
      // a test never passes because of an accidentally-true query.
      return false;
    });
  });
}

/**
 * Install the viewport harness. Call in `beforeEach`; pair with
 * `restoreViewport()` in `afterEach`.
 */
export function installViewport(initialWidth: number = BREAKPOINTS.mobile): void {
  if (!installed) {
    originalMatchMedia = window.matchMedia;
    installed = true;
  }
  tracked = [];

  window.matchMedia = ((query: string) => {
    const entry: TrackedList = {
      query,
      matches: evaluate(query, currentWidth),
      listeners: new Set(),
    };
    tracked.push(entry);

    const list = {
      get matches() {
        return entry.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) =>
        entry.listeners.add(cb),
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) =>
        entry.listeners.delete(cb),
      addListener: (cb: (e: MediaQueryListEvent) => void) => entry.listeners.add(cb),
      removeListener: (cb: (e: MediaQueryListEvent) => void) =>
        entry.listeners.delete(cb),
      dispatchEvent: vi.fn(),
    };
    return list as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;

  setViewportWidth(initialWidth);
}

/**
 * Resize the viewport: updates `innerWidth`, flips affected media queries and
 * notifies their listeners, then dispatches `resize`.
 *
 * Wrap calls in `act()` when a React component subscribes to the change.
 */
export function setViewportWidth(width: number): void {
  currentWidth = width;
  Object.defineProperty(window, "innerWidth", {
    value: width,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    writable: true,
    configurable: true,
  });

  for (const entry of tracked) {
    const next = evaluate(entry.query, width);
    if (next !== entry.matches) {
      entry.matches = next;
      const event = { matches: next, media: entry.query } as MediaQueryListEvent;
      for (const cb of entry.listeners) cb(event);
    }
  }

  window.dispatchEvent(new Event("resize"));
}

/** Restore the original `window.matchMedia`. */
export function restoreViewport(): void {
  if (installed && originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  }
  tracked = [];
  installed = false;
  originalMatchMedia = undefined;
}
