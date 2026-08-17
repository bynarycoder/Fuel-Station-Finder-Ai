"use client";

/**
 * The small, shared "fact" displays a station card and the detail page both
 * use, so the same fact never looks different in two places:
 *
 * - `PriceDisplay`            ₦ per litre (or an honest "no price" state)
 * - `FuelAvailabilityBadge`   PMS/AGO/… with availability encoded by icon+text
 * - `DistanceDisplay`         metres/kilometres from the user
 * - `FreshnessLine`           "Updated 18 min ago", coloured by staleness
 */

import { CircleHelp, CircleSlash, Fuel, MapPin, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { cn } from "@/lib/utils";
import { formatDistance } from "@/lib/format";
import { freshnessOf, type FuelAvailability } from "@/lib/stationSummary";

/* ------------------------------------------------------------------ price */

export function PriceDisplay({
  price,
  fuelCode,
  size = "md",
  emphasis = false,
  className,
}: {
  /** Naira per litre, or null when nothing has been reported. */
  price: number | null;
  fuelCode?: string;
  size?: "sm" | "md" | "lg";
  /**
   * Renders the figure in brand green. The reference design uses green to
   * mark the *current price* on station cards and the fuel-price list; it is
   * never used to imply "cheap" or "verified".
   */
  emphasis?: boolean;
  className?: string;
}) {
  if (price == null) {
    return (
      <span
        className={cn("text-caption font-medium text-ink-500", className)}
        data-testid="price-unavailable"
      >
        No recent price
      </span>
    );
  }

  const numberClass =
    size === "lg"
      ? "text-display"
      : size === "md"
        ? "text-h2"
        : "text-body-sm font-semibold";

  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <span
        className={cn(
          numberClass,
          "tabular-nums",
          emphasis ? "font-bold text-brand-700" : "text-ink-900",
        )}
      >
        ₦{price.toLocaleString()}
      </span>
      <span className="text-caption font-medium text-ink-500">
        /L{fuelCode ? ` · ${fuelCode}` : ""}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------- availability */

const AVAILABILITY_META: Record<
  FuelAvailability,
  { tone: "success" | "danger" | "neutral"; Icon: typeof Fuel; label: string }
> = {
  available: { tone: "success", Icon: CircleCheck, label: "Available" },
  unavailable: { tone: "danger", Icon: CircleSlash, label: "Unavailable" },
  unknown: { tone: "neutral", Icon: CircleHelp, label: "Not reported" },
};

/**
 * A fuel chip. `availability` is only ever "available"/"unavailable" when a
 * real report says so; otherwise it reads "Not reported" rather than implying
 * the station has no fuel.
 */
export function FuelAvailabilityBadge({
  code,
  availability = "unknown",
  showLabel = false,
  className,
}: {
  code: string;
  availability?: FuelAvailability;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = AVAILABILITY_META[availability];
  return (
    <Badge
      tone={meta.tone}
      className={className}
      title={`${code}: ${meta.label}`}
    >
      <meta.Icon className="h-3 w-3" aria-hidden="true" />
      <span className="font-bold">{code}</span>
      {showLabel && <span className="font-medium opacity-80">{meta.label}</span>}
      {!showLabel && <span className="sr-only">{meta.label}</span>}
    </Badge>
  );
}

/* --------------------------------------------------------------- distance */

export function DistanceDisplay({
  meters,
  className,
  withIcon = true,
}: {
  meters: number | null | undefined;
  className?: string;
  withIcon?: boolean;
}) {
  if (typeof meters !== "number" || Number.isNaN(meters)) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-caption font-semibold text-ink-600",
        className,
      )}
    >
      {withIcon && <MapPin className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />}
      <span className="tabular-nums">{formatDistance(meters)}</span>
      <span className="sr-only">away</span>
    </span>
  );
}

/* -------------------------------------------------------------- freshness */

const FRESHNESS_CLASS = {
  fresh: "text-success-strong",
  recent: "text-ink-500",
  stale: "text-warning-strong",
  none: "text-ink-500",
} as const;

/**
 * "Updated 18 min ago" with staleness encoded in colour AND wording — amber
 * copy explicitly says the data is old rather than relying on the hue.
 */
export function FreshnessLine({
  iso,
  className,
  emptyLabel = "No reports yet",
}: {
  iso: string | null;
  className?: string;
  emptyLabel?: string;
}) {
  // nowMs only after mount, so SSR and first client render agree.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!iso) {
    return (
      <span className={cn("text-caption", FRESHNESS_CLASS.none, className)}>
        {emptyLabel}
      </span>
    );
  }

  const level = nowMs == null ? "recent" : freshnessOf(iso, nowMs);
  return (
    <span className={cn("text-caption", FRESHNESS_CLASS[level], className)}>
      {level === "stale" ? "Last update " : "Updated "}
      <RelativeTime iso={iso} />
      {level === "stale" ? " — may be out of date" : ""}
    </span>
  );
}
