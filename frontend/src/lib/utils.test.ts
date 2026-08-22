/**
 * `cn()` — the class merger every component funnels through.
 *
 * REGRESSION (found in the browser, invisible in jsdom):
 * tailwind-merge groups classes by prefix. It knows `text-sm` is a font size
 * and assumes anything else after `text-` is a COLOUR — so this project's
 * custom scale (`text-body-sm`, `text-h3`, `text-caption`, …) was filed as a
 * colour and silently evicted the real colour that came before it:
 *
 *     cn("bg-slab text-slab-fg", "h-11 text-body-sm")  ->  no text colour
 *
 * Every sized Button lost its foreground and inherited body ink: white-on-
 * green became near-black-on-green at 2.1:1. These tests pin both halves of
 * the contract — sizes and colours coexist, genuine conflicts still merge.
 */

import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("custom type scale vs. colours", () => {
  it("keeps a foreground colour that is followed by a font size", () => {
    const result = cn("bg-slab text-slab-fg", "h-11 rounded-md px-4 text-body-sm");
    expect(result).toContain("text-slab-fg");
    expect(result).toContain("text-body-sm");
  });

  it("keeps an arbitrary colour value that is followed by a font size", () => {
    const result = cn("bg-accent-400 text-[#2b1a02]", "h-9 text-body-sm");
    expect(result).toContain("text-[#2b1a02]");
    expect(result).toContain("text-body-sm");
  });

  it("keeps a font size that is followed by a colour", () => {
    const result = cn("text-h3", "text-ink-900");
    expect(result).toContain("text-h3");
    expect(result).toContain("text-ink-900");
  });

  it.each([
    ["text-display", "text-h1"],
    ["text-h2", "text-h3"],
    ["text-body", "text-body-sm"],
    ["text-caption", "text-label"],
  ])("still merges two competing font sizes (%s + %s)", (a, b) => {
    expect(cn(a, b)).toBe(b);
  });

  it("still merges two competing colours", () => {
    expect(cn("text-ink-500", "text-brand-700")).toBe("text-brand-700");
  });

  it("still merges other conflicting utilities", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("bg-surface", "bg-canvas")).toBe("bg-canvas");
  });
});
