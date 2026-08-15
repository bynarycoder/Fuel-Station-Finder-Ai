"use client";

/**
 * StationCard — the product's primary decision unit.
 *
 * It answers, in this visual order, the six questions a driver actually has:
 *
 *   What?        station name (+ brand as the quieter prefix)
 *   Where?       distance
 *   What fuel?   PMS / AGO / DPK / LPG / CNG chips
 *   How much?    latest REPORTED price (never invented)
 *   Trustworthy? data source + verification, kept as separate facts
 *   Current?     report freshness, with staleness spelled out
 *
 * Structure: a semantic <article> whose title is a button (selects the station
 * and opens detail). Secondary controls (favourite, Directions) are siblings,
 * never nested inside that button — the previous implementation nested a
 * role="button" and an <a> inside a <button>, which broke keyboard use.
 */

import { Heart, Navigation, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  DistanceDisplay,
  FreshnessLine,
  FuelAvailabilityBadge,
  PriceDisplay,
} from "@/components/stations/facts";
import { StationProvenanceBadge } from "@/components/stations/StationProvenanceBadge";
import { Skeleton } from "@/components/ui/states";
import type { StationItem } from "@/hooks/useStations";
import { directionsUrl } from "@/lib/format";
import { stationNameParts } from "@/lib/stationName";
import type { StationSummary } from "@/lib/stationSummary";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/types/station";

export interface StationCardProps {
  station: StationItem;
  summary: StationSummary;
  /** True while the shared price feed is still loading. */
  pricesLoading?: boolean;
  userLocation: LatLng | null;
  isSelected: boolean;
  /** Marks the nearest station in nearby mode. */
  isClosest?: boolean;
  isFavorite?: boolean;
  onSelect: (stationId: string) => void;
  onToggleFavorite?: (stationId: string) => void;
  className?: string;
}

export function StationCard({
  station,
  summary,
  pricesLoading = false,
  userLocation,
  isSelected,
  isClosest = false,
  isFavorite = false,
  onSelect,
  onToggleFavorite,
  className,
}: StationCardProps) {
  const directions = directionsUrl(
    { latitude: station.latitude, longitude: station.longitude },
    userLocation,
  );

  // Price headline: prefer the fuel the user filtered on if we have it,
  // otherwise the most recently reported fuel at this station.
  const headline = summary.latest;
  const offered = station.fuel_types;

  const { brandPrefix, name, label } = stationNameParts(station.brand, station.name);

  return (
    <article
      data-testid="station-card"
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface transition-all duration-base ease-entrance",
        isSelected
          ? "border-brand-500 shadow-e2 ring-1 ring-brand-500"
          : "border-hairline shadow-e1 hover:border-brand-300 hover:shadow-e2",
        className,
      )}
    >
      {isClosest && (
        <div className="flex items-center gap-1.5 bg-brand-800 px-4 py-1.5 text-label uppercase text-brand-100">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Closest to you
        </div>
      )}

      <div className="p-4">
        {/* Row 1 — What? + Where? */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(station.id)}
                className="block w-full truncate text-left text-h3 text-ink-900 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:underline"
                aria-label={`${label} — view station details`}
              >
                {brandPrefix && (
                  <span className="font-medium text-ink-500">{brandPrefix} </span>
                )}
                {name}
              </button>
            </h3>
            {(station.address || station.city) && (
              <p className="mt-0.5 truncate text-caption text-ink-500">
                {[station.address, station.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {typeof station.distance_meters === "number" && (
              <Badge tone={isClosest ? "solid-accent" : "neutral"} size="md">
                <DistanceDisplay
                  meters={station.distance_meters}
                  withIcon={false}
                  className={isClosest ? "text-brand-950" : "text-ink-700"}
                />
              </Badge>
            )}
            {onToggleFavorite && (
              <button
                type="button"
                aria-label={
                  isFavorite
                    ? `Remove ${label} from favourites`
                    : `Add ${label} to favourites`
                }
                aria-pressed={isFavorite}
                onClick={() => onToggleFavorite(station.id)}
                className={cn(
                  "-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
                  isFavorite
                    ? "text-accent-500 hover:bg-accent-50"
                    : "text-ink-300 hover:bg-ink-100 hover:text-accent-400",
                )}
              >
                <Heart
                  className={cn("h-5 w-5", isFavorite && "fill-accent-400")}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>

        {/* Row 2 — What fuel? + How much? */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {offered.length > 0 ? (
              offered.map((fuel) => (
                <FuelAvailabilityBadge
                  key={fuel.code}
                  code={fuel.code}
                  availability={
                    summary.byFuel.get(fuel.code)?.availability ?? "unknown"
                  }
                />
              ))
            ) : (
              <span className="text-caption text-ink-500">
                Fuel types not listed
              </span>
            )}
          </div>

          <div className="shrink-0">
            {pricesLoading && !headline ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <PriceDisplay
                price={headline?.price ?? null}
                fuelCode={headline?.price != null ? headline.fuelCode : undefined}
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Row 3 — Can I trust this? */}
        <div className="mt-3">
          <StationProvenanceBadge
            dataSource={station.data_source}
            verificationStatus={station.verification_status}
            compact
          />
        </div>

        {/* Row 4 — Is it current? + actions */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
          <FreshnessLine
            iso={summary.lastReportedAt}
            emptyLabel="No price reports yet"
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onSelect(station.id)}>
              View
            </Button>
            {directions && (
              <ButtonLink
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                variant="primary"
                size="sm"
                aria-label={`Get driving directions to ${label}`}
              >
                <Navigation className="h-4 w-4" aria-hidden="true" />
                Directions
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
