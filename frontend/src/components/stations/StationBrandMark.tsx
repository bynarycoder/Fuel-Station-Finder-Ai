"use client";

/**
 * StationBrandMark — the square "station logo" slot the reference design puts
 * at the leading edge of every station row (cards, AI recommendations, the
 * report station selector).
 *
 * We do NOT ship brand artwork: the catalogue is community/OSM sourced, so a
 * TotalEnergies or NNPC logo would be both a trademark problem and a lie for
 * the many rows whose brand is null. Instead this renders a deterministic
 * monogram derived from the station's own `brand`/`name` — real data, stable
 * per station, and visually consistent at every size — falling back to a fuel
 * pump glyph when there is nothing to derive.
 *
 * The tint is chosen by hashing the same string, so a given station always
 * gets the same colour and a list reads as a set of distinct places rather
 * than a column of identical green squares.
 */

import { Fuel } from "lucide-react";

import { cn } from "@/lib/utils";

/** Tints are token-based, so they re-theme in dark mode with everything else. */
const TINTS = [
  "bg-brand-100 text-brand-800",
  "bg-info-soft text-info-strong",
  "bg-accent-100 text-accent-800",
  "bg-success-soft text-success-strong",
  "bg-ink-100 text-ink-700",
] as const;

const SIZES = {
  sm: { box: "h-10 w-10 rounded-lg text-[13px]", icon: "h-4 w-4" },
  md: { box: "h-12 w-12 rounded-xl text-[15px]", icon: "h-5 w-5" },
  lg: { box: "h-16 w-16 rounded-2xl text-xl", icon: "h-7 w-7" },
} as const;

/** Stable, non-cryptographic hash so the tint never changes between renders. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Up to two initials from the brand (preferred) or the station name. */
export function stationMonogram(
  brand: string | null | undefined,
  name: string | null | undefined,
): string {
  const source = (brand?.trim() || name?.trim() || "").replace(/[^\p{L}\p{N} ]/gu, " ");
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function StationBrandMark({
  brand,
  name,
  size = "md",
  className,
}: {
  brand: string | null | undefined;
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const monogram = stationMonogram(brand, name);
  const tint = TINTS[hashString(brand || name || "station") % TINTS.length];
  const dimensions = SIZES[size];

  return (
    <span
      // Decorative: the station name is always adjacent in the DOM, so the
      // monogram must not be announced twice.
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-bold leading-none tracking-tight",
        dimensions.box,
        tint,
        className,
      )}
    >
      {monogram || <Fuel className={dimensions.icon} />}
    </span>
  );
}
