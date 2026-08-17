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
    ["ink-500", "#687680", "muted text"],
    ["hairline", "#DCE4E8", "border"],
    ["danger", "#E53935", "error"],
    ["success", "#16A765", "success"],
  ])("%s is %s (%s)", (token, hex) => {
    expect(tokenIn(lightBlock, token)).toBe(channels(hex));
  });

  it("uses the primary green as the solid action fill, with white labels", () => {
    expect(tokenIn(lightBlock, "action")).toBe(channels("#16A765"));
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
