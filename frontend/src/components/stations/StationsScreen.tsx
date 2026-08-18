"use client";

/**
 * Stations screen — station-focused browsing, separate from the map.
 *
 * The map stays mounted underneath (this is a FullPage overlay). Search,
 * fuel chips and the filter sheet write to the SAME `useMapStore` the map
 * already uses — no second filter system. Cards are revealed incrementally
 * so a 700+ catalogue never mounts every row at once.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Fuel, Heart, X } from "lucide-react";

import { FuelFilterChips } from "@/components/stations/FuelFilterChips";
import { LocationPrimer } from "@/components/stations/LocationPrimer";
import { StationFilters } from "@/components/stations/StationFilters";
import { StationList } from "@/components/stations/StationList";
import { SearchBar } from "@/components/search/SearchBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { StationItem } from "@/hooks/useStations";
import { haversineDistance } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMapStore } from "@/store/useMapStore";
import type { LatLng } from "@/types/station";

/** How many cards to mount at a time. */
export const STATIONS_PAGE_SIZE = 20;

export type StationSort = "auto" | "distance" | "name";

interface StationsScreenProps {
  items: StationItem[];
  isLoading: boolean;
  isError: boolean;
  isNearby: boolean;
  selectedId: string | null;
  userLocation: LatLng | null;
  showLoading: boolean;
  needsLocationPrimer: boolean;
  isLocating: boolean;
  favoriteIds: Set<string>;
  searchValue: string;
  onSearch: (term: string) => void;
  onAsk: (question: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onToggleFavorite: (stationId: string) => void;
  onExpandRadius: () => void;
  onClearFilters: () => void;
  onChooseLocation: () => void;
  onUseLocation: () => void;
  onClose: () => void;
}

export function StationsScreen({
  items,
  isLoading,
  isError,
  isNearby,
  selectedId,
  userLocation,
  showLoading,
  needsLocationPrimer,
  isLocating,
  favoriteIds,
  searchValue,
  onSearch,
  onAsk,
  onSelect,
  onRetry,
  onToggleFavorite,
  onExpandRadius,
  onClearFilters,
  onChooseLocation,
  onUseLocation,
  onClose,
}: StationsScreenProps) {
  const auth = useAuth();
  const favoritesOnly = useMapStore((s) => s.favoritesOnly);
  const setFavoritesOnly = useMapStore((s) => s.setFavoritesOnly);

  const [sortBy, setSortBy] = useState<StationSort>("auto");
  const [visible, setVisible] = useState(STATIONS_PAGE_SIZE);

  // A new result set (search, fuel chip, nearby refresh) resets the window
  // so we never keep a stale "page 4" over a 3-item filter.
  useEffect(() => {
    setVisible(STATIONS_PAGE_SIZE);
  }, [items, sortBy, favoritesOnly, searchValue]);

  const resolvedSort: Exclude<StationSort, "auto"> =
    sortBy === "auto" ? (isNearby ? "distance" : "name") : sortBy;

  const sorted = useMemo(() => {
    const copy = [...items];
    if (resolvedSort === "distance") {
      copy.sort((a, b) => distanceOf(a, userLocation) - distanceOf(b, userLocation));
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    return copy;
  }, [items, resolvedSort, userLocation]);

  const page = sorted.slice(0, visible);
  const remaining = Math.max(0, sorted.length - visible);

  function handleFavoritesToggle() {
    if (!auth.isAuthed) return;
    setFavoritesOnly(!favoritesOnly);
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-canvas"
      data-testid="stations-screen"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 bg-brand-sheen px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-white/15 text-white ring-1 ring-white/25">
            <Fuel className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="stations-screen-title" className="truncate text-h3 text-slab-fg">
              {isNearby ? "Nearby stations" : "All stations"}
            </h2>
            <p className="truncate text-caption text-white/85">
              {showLoading
                ? "Searching…"
                : `${items.length} station${items.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/15 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="shrink-0 space-y-2 border-b border-hairline bg-surface px-3 py-2.5">
        <SearchBar
          compact
          value={searchValue}
          onSearch={onSearch}
          onAsk={onAsk}
          placeholder="Search stations, areas or fuel..."
        />
        <FuelFilterChips compact />
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Sort stations"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar"
          >
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
            <SortChip
              label="Nearest"
              pressed={resolvedSort === "distance"}
              disabled={!userLocation && !isNearby}
              onClick={() => setSortBy("distance")}
            />
            <SortChip
              label="A–Z"
              pressed={resolvedSort === "name"}
              onClick={() => setSortBy("name")}
            />
          </div>
          <button
            type="button"
            onClick={handleFavoritesToggle}
            aria-pressed={favoritesOnly}
            aria-label={favoritesOnly ? "Showing favourites only" : "Show favourites only"}
            title={
              auth.isAuthed
                ? "Show only your favorite stations"
                : "Sign in to use favorites"
            }
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-caption font-semibold transition-colors",
              favoritesOnly
                ? "border-accent-300 bg-accent-50 text-accent-700"
                : "border-hairline bg-surface text-ink-600 hover:border-ink-300",
            )}
          >
            <Heart
              className={cn("h-3.5 w-3.5", favoritesOnly && "fill-accent-400 text-accent-500")}
              aria-hidden="true"
            />
            Saved
          </button>
          <StationFilters filtersOnly onChooseLocation={onChooseLocation} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {needsLocationPrimer && (
          <div className="mb-3">
            <LocationPrimer
              loading={isLocating}
              onUseLocation={onUseLocation}
              onSearchManually={onChooseLocation}
            />
          </div>
        )}
        <StationList
          items={page}
          isLoading={isLoading}
          isError={isError}
          isNearby={isNearby}
          selectedId={selectedId}
          userLocation={userLocation}
          onSelect={onSelect}
          onRetry={onRetry}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onExpandRadius={onExpandRadius}
          onClearFilters={onClearFilters}
          hideCount
          sortBy={resolvedSort}
        />
        {remaining > 0 && !isLoading && (
          <div className="mt-3 flex justify-center pb-2">
            <Button
              variant="secondary"
              onClick={() => setVisible((n) => n + STATIONS_PAGE_SIZE)}
            >
              Show more · {remaining} left
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function distanceOf(station: StationItem, user: LatLng | null): number {
  if (typeof station.distance_meters === "number") return station.distance_meters;
  if (user) return haversineDistance(user, station);
  return Number.MAX_SAFE_INTEGER;
}

function SortChip({
  label,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-pill border px-3 text-caption font-semibold transition-colors disabled:opacity-40",
        pressed
          ? "border-action bg-action text-action-fg"
          : "border-hairline bg-surface text-ink-600 hover:border-brand-300",
      )}
    >
      {label}
    </button>
  );
}
