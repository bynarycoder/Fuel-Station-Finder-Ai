"use client";

/**
 * Scrollable list of stations, built entirely from `StationCard`.
 *
 * Responsibilities kept from the previous implementation:
 * - nearby mode sorts nearest → farthest using the server distance, falling
 *   back to Haversine, so ordering never depends on API ordering;
 * - browse mode sorts by name;
 * - the nearest station is flagged (now via the card's `isClosest` treatment
 *   instead of a whole separate, differently-designed card).
 *
 * Loading / empty / error are the shared designed states, and every empty
 * state offers the user a way forward (widen the radius, clear filters, retry).
 */

import { MapPinOff, SearchX, Fuel } from "lucide-react";
import { useTranslation } from "react-i18next";

import { StationCard } from "@/components/stations/StationCard";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useStationPrices } from "@/hooks/useStationPrices";
import type { StationItem } from "@/hooks/useStations";
import { haversineDistance } from "@/lib/format";
import { useMapStore } from "@/store/useMapStore";
import type { LatLng } from "@/types/station";

interface StationListProps {
  items: StationItem[];
  isLoading: boolean;
  isError: boolean;
  isNearby: boolean;
  selectedId: string | null;
  userLocation: LatLng | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  /** Favorites support (optional — omitted when favorites are unavailable). */
  favoriteIds?: Set<string>;
  onToggleFavorite?: (stationId: string) => void;
  /** Widen the nearby radius from an empty state. */
  onExpandRadius?: () => void;
  /** Clear all active filters from an empty state. */
  onClearFilters?: () => void;
  /** Hide the "N stations" summary line (the sheet header shows its own). */
  hideCount?: boolean;
  /** Override the default nearby→distance / browse→name sort. */
  sortBy?: "auto" | "distance" | "name";
}

export function StationList({
  items,
  isLoading,
  isError,
  isNearby,
  selectedId,
  userLocation,
  onSelect,
  onRetry,
  favoriteIds,
  onToggleFavorite,
  onExpandRadius,
  onClearFilters,
  hideCount = false,
  sortBy = "auto",
}: StationListProps) {
  const { t } = useTranslation();
  const activeFuelType = useMapStore((s) => s.filters.fuelType);
  const prices = useStationPrices();

  if (isLoading) {
    return <LoadingSkeleton count={4} label={t("list.loading")} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t("list.errorTitle")}
        description={t("list.errorBody")}
        onRetry={onRetry}
      />
    );
  }

  if (items.length === 0) {
    if (isNearby) {
      return (
        <EmptyState
          icon={MapPinOff}
          title={t("list.emptyNearbyTitle")}
          description={
            activeFuelType
              ? t("list.emptyNearbyFuel", { fuel: activeFuelType })
              : t("list.emptyNearbyAny")
          }
          action={
            <>
              {onExpandRadius && (
                <Button size="sm" onClick={onExpandRadius}>
                  {t("list.expandRadius")}
                </Button>
              )}
              {activeFuelType && onClearFilters && (
                <Button variant="secondary" size="sm" onClick={onClearFilters}>
                  {t("list.clearFilters")}
                </Button>
              )}
            </>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={SearchX}
        title={t("list.emptySearchTitle")}
        description={t("list.emptySearchBody")}
        action={
          onClearFilters && (
            <Button size="sm" onClick={onClearFilters}>
              {t("list.clearFilters")}
            </Button>
          )
        }
      />
    );
  }

  // Nearby: nearest → farthest (server value, else Haversine). Browse: by name.
  // `sortBy` lets the stations screen override without a second list.
  const resolvedSort =
    sortBy === "auto" ? (isNearby ? "distance" : "name") : sortBy;
  const sorted =
    resolvedSort === "distance"
      ? [...items].sort((a, b) => distanceOf(a, userLocation) - distanceOf(b, userLocation))
      : [...items].sort((a, b) => a.name.localeCompare(b.name));

  const closestId = isNearby && sorted.length > 0 ? sorted[0].id : null;

  return (
    <div className="space-y-3">
      {!hideCount && (
        <p
          className="flex items-center gap-1.5 px-0.5 text-caption text-ink-500"
          aria-live="polite"
        >
          <Fuel className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
          <span className="font-semibold text-ink-700">{sorted.length}</span>
          {/* No separating space: the pre-i18n JSX had none (the newline
              between the <span> and the text was stripped by JSX), and the
              English output must stay byte-identical. */}
          {isNearby
            ? t("list.countNearby", { count: sorted.length })
            : t("list.count", { count: sorted.length })}
        </p>
      )}

      {sorted.map((station) => (
        <StationCard
          key={station.id}
          station={station}
          summary={prices.summaryFor(station.id)}
          pricesLoading={prices.isLoading}
          userLocation={userLocation}
          isSelected={station.id === selectedId}
          isClosest={station.id === closestId}
          isFavorite={favoriteIds?.has(station.id) ?? false}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}

function distanceOf(station: StationItem, user: LatLng | null): number {
  if (typeof station.distance_meters === "number") return station.distance_meters;
  if (user) return haversineDistance(user, station);
  return Number.MAX_SAFE_INTEGER;
}
