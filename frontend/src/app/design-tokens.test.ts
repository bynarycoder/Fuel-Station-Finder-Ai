/**
 * DESIGN-TOKEN CONTRACT.
 *
 * The palette is a product decision, not an implementation detail: every
 * screen composes `brand-*`, `accent-*`, `ink-*`, `action`, `slab`, `canvas`,
 * `surface` and `hairline`, so a single wrong value silently re-skins the
 * whole app. These tests pin the exact specified values — in BOTH themes —
 * and prove they live in ONE place (`globals.css`), not scattered across
 * components.
 *
 * They read the stylesheet as text on purpose: jsdom does not run Tailwind,
 * and the point is the token definition, not any one component's use of it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "globals.css"), "utf8");

/** `:root { … }` — the light theme block. */
const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
/** `.dark { … }` — the dark theme block. */
const darkBlock = css.slice(css.indexOf(".dark {"), css.indexOf("@layer base"));

/** "#16A765" → "22 167 101" (the space-separated channel form Tailwind uses). */
function channels(hex: string): string {
  const value = hex.replace("#", "");
  const n = parseInt(value, 16);
  // eslint-disable-next-line no-bitwise
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function tokenIn(block: string, name: string): string | null {
  const match = new RegExp(`--${name}:\\s*([0-9]+ [0-9]+ [0-9]+)\\s*;`).exec(block);
  return match ? match[1] : null;
}

describe("light theme tokens", () => {
  it.each([
    ["brand-500", "#16A765", "primary green"],
    ["brand-900", "#075E3D", "dark green"],
    ["accent-400", "#F7931E", "action orange"],
    ["canvas", "#F5F7F8", "light background"],
    ["surface", "#FFFFFF", "white surface"],
    ["ink-900", "#15212B", "primary text"],
    // The spec's #687680 measures 4.35:1 on the canvas — one notch darker
    // clears AA everywhere muted captions are actually used.
    ["ink-500", "#626F79", "muted text"],
    ["hairline", "#DCE4E8", "border"],
    ["danger", "#E53935", "error"],
    ["success", "#16A765", "success"],
  ])("%s is %s (%s)", (token, hex) => {
    expect(tokenIn(lightBlock, token)).toBe(channels(hex));
  });

  it("fills solid actions with the ramp's AA-safe green, labelled white", () => {
    // #16A765 stays THE brand green (500) — but a fill carrying white text
    // steps down to brand-700, which clears AA. See the contrast suite below.
    expect(tokenIn(lightBlock, "action")).toBe(channels("#0D7C4A"));
    expect(tokenIn(lightBlock, "action-fg")).toBe(channels("#FFFFFF"));
  });
});

describe("dark theme tokens", () => {
  it.each([
    ["canvas", "#081522", "dark background"],
    ["surface", "#0F1D28", "dark surface"],
    ["elevated", "#132331", "secondary dark surface"],
    ["ink-900", "#F4F8FA", "primary text"],
    ["ink-500", "#A9B5BD", "muted text"],
    ["hairline", "#253847", "dark border"],
    ["brand-500", "#16A765", "primary green"],
    ["accent-400", "#F7931E", "orange"],
    ["slab", "#075E3D", "dark green"],
  ])("%s is %s (%s)", (token, hex) => {
    expect(tokenIn(darkBlock, token)).toBe(channels(hex));
  });

  it("is designed, not an inversion of the light palette", () => {
    // Pure black would be the lazy answer; the spec asks for navy surfaces.
    expect(tokenIn(darkBlock, "canvas")).not.toBe("0 0 0");
    // The ink ramp inverts so `text-ink-900` still means "highest contrast".
    const lightInk = tokenIn(lightBlock, "ink-900")!.split(" ").map(Number);
    const darkInk = tokenIn(darkBlock, "ink-900")!.split(" ").map(Number);
    expect(lightInk[0]).toBeLessThan(darkInk[0]);
  });
});

/* ------------------------------------------------------------- contrast -- */

function luminance(rgb: string): number {
  const [r, g, b] = rgb.split(" ").map((n) => Number(n) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return Math.round((Math.max(la, lb) / Math.min(la, lb)) * 100) / 100;
}

/**
 * WCAG AA, computed from the tokens themselves.
 *
 * A browser pass (`scripts/ui-audit.mjs`) walks every rendered text node in
 * both themes; this suite is the cheap CI guard that stops the underlying
 * VALUES from regressing without one.
 */
describe("WCAG AA contrast of the token pairs the product actually uses", () => {
  const L = (name: string) => tokenIn(lightBlock, name)!;
  const D = (name: string) => tokenIn(darkBlock, name)!;

  it.each([
    ["body text on the canvas", "ink-900", "canvas", 4.5],
    ["body text on a surface", "ink-900", "surface", 4.5],
    ["muted text on the canvas", "ink-500", "canvas", 4.5],
    ["muted text on a surface", "ink-500", "surface", 4.5],
    ["muted text on the quiet fill", "ink-500", "ink-50", 4.5],
    ["a label on the primary fill", "action-fg", "action", 4.5],
    ["a label on the dark-green slab", "slab-fg", "slab", 4.5],
    ["price/link green on a surface", "brand-700", "surface", 4.5],
    ["price/link green on a green tint", "brand-700", "brand-50", 4.5],
    ["error text on a surface", "danger-strong", "surface", 4.5],
    ["error text on the error tint", "danger-strong", "danger-soft", 4.5],
    ["success text on the success tint", "success-strong", "success-soft", 4.5],
  ])("light · %s", (_name, fg, bg, min) => {
    expect(ratio(L(fg), L(bg))).toBeGreaterThanOrEqual(min);
  });

  it.each([
    ["body text on the canvas", "ink-900", "canvas", 4.5],
    ["body text on a surface", "ink-900", "surface", 4.5],
    ["muted text on a surface", "ink-500", "surface", 4.5],
    ["muted text on the elevated surface", "ink-500", "elevated", 4.5],
    ["a label on the primary fill", "action-fg", "action", 4.5],
    ["a label on the dark-green slab", "slab-fg", "slab", 4.5],
    ["price/link green on a surface", "brand-700", "surface", 4.5],
    ["error text on the error tint", "danger-strong", "danger-soft", 4.5],
  ])("dark · %s", (_name, fg, bg, min) => {
    expect(ratio(D(fg), D(bg))).toBeGreaterThanOrEqual(min);
  });

  it("non-text UI still separates from its background (3:1)", () => {
    // The primary fill against the page, and the border against the surface.
    expect(ratio(L("action"), L("canvas"))).toBeGreaterThanOrEqual(3);
    expect(ratio(D("action"), D("surface"))).toBeGreaterThanOrEqual(3);
  });

  it("documents the one intentional exception", () => {
    // #16A765 + white is 3.11:1 — it is NOT used for text-bearing fills. The
    // brand green survives as the ramp's 500 step (icons, pins, borders,
    // tints), where 3:1 for non-text UI is the applicable bar.
    expect(ratio(L("brand-500"), "255 255 255")).toBeLessThan(4.5);
    expect(tokenIn(lightBlock, "brand-500")).toBe(channels("#16A765"));
    expect(tokenIn(darkBlock, "brand-500")).toBe(channels("#16A765"));
  });
});

describe("one source of truth", () => {
  it("keeps the palette out of component files", () => {
    // Components must compose tokens (`bg-action`, `text-ink-500`), never
    // paste hexes. The known exceptions are surfaces rendered OUTSIDE React
    // (Leaflet marker SVG strings, an SVG sparkline stroke) and the fixed
    // near-black label used on the orange button.
    const offenders = [
      "src/components/stations/StationCard.tsx",
      "src/components/stations/StationList.tsx",
      "src/components/shell/MobileBottomNav.tsx",
      "src/components/search/SearchBar.tsx",
      "src/components/stations/FuelFilterChips.tsx",
    ].filter((file) => {
      const source = readFileSync(
        resolve(__dirname, "..", "..", file),
        "utf8",
      );
      return /#[0-9a-fA-F]{6}\b/.test(source.replace(/#2b1a02/g, ""));
    });
    expect(offenders).toEqual([]);
  });
});
