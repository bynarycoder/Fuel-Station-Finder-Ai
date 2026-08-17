/**
 * Button — the action primitive every screen composes.
 *
 * The point of these tests is a bug that shipped once and must not ship
 * again: the class merger dropped each variant's FOREGROUND colour whenever a
 * size class followed it, so `primary`, `accent`, `deep` and `danger` all
 * rendered with inherited body ink on a saturated fill (as low as 2.1:1).
 * jsdom cannot compute contrast, but it can prove the intended colour class
 * actually survives to the DOM — at every size.
 */

import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, ButtonLink } from "@/components/ui/button";

type Variant = NonNullable<React.ComponentProps<typeof Button>["variant"]>;

const FOREGROUND: Record<Variant, string> = {
  primary: "text-action-fg",
  deep: "text-slab-fg",
  accent: "text-[#2b1a02]",
  secondary: "text-ink-800",
  ghost: "text-ink-600",
  quiet: "text-brand-800",
  danger: "text-white",
};

const SIZES = ["xs", "sm", "md", "lg"] as const;

describe("every variant keeps its foreground at every size", () => {
  for (const [variant, expected] of Object.entries(FOREGROUND) as Array<[Variant, string]>) {
    for (const size of SIZES) {
      it(`${variant} @ ${size}`, () => {
        render(
          <Button variant={variant} size={size} className="shrink-0">
            Label
          </Button>,
        );
        const button = screen.getByRole("button", { name: "Label" });
        expect(button.className).toContain(expected);
        // …and the size class it was competing with is still there.
        expect(button.className).toMatch(/\b(h-8|h-9|h-11|h-12)\b/);
      });
    }
  }
});

describe("visual hierarchy", () => {
  it("primary is the brand fill, deep is the dark-green supporting action", () => {
    render(
      <>
        <Button variant="primary">Get Directions</Button>
        <Button variant="deep">Browse all</Button>
        <Button variant="accent">Near me</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Get Directions" }).className).toContain("bg-action");
    expect(screen.getByRole("button", { name: "Browse all" }).className).toContain("bg-slab");
    expect(screen.getByRole("button", { name: "Near me" }).className).toContain("bg-accent-400");
  });

  it("a caller-supplied colour still wins over the variant", () => {
    render(
      <Button variant="secondary" className="text-accent-700">
        Favourites
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Favourites" });
    expect(button.className).toContain("text-accent-700");
    expect(button.className).not.toContain("text-ink-800");
  });

  it("ButtonLink carries the same treatment", () => {
    render(
      <ButtonLink href="https://example.test" variant="primary" size="lg">
        Get Directions
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Get Directions" });
    expect(link.className).toContain("bg-action");
    expect(link.className).toContain("text-action-fg");
  });
});
