"use client";

/**
 * Scrollable list of stations with loading / error / empty states.
 *
 * Each row shows the station summary, its offered fuels, the distance (in
 * nearby mode), a "Focus" action (selects the station on the map) and a
 * "Directions" deep link.
 */

import { Navigation, MapPin, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { StationItem } from "@/hooks/useStations";
import type { LatLng } from "@/types/station";
import { directionsUrl, formatDistance } from "@/lib/format";

interface StationListProps {
  items: StationItem[];
  isLoading: boolean;
  isError: boolean;
  isNearby: boolean;
  selectedId: string | null;
  userLocation: LatLng | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
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
}: StationListProps) {
  if (isLoading) {
    return (
      <ListShell>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl bg-gray-100"
            aria-hidden
          />
        ))}
      </ListShell>
    );
  }

  if (isError) {
    return (
      <ListShell>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <SearchX className="h-8 w-8 text-red-400" />
          <p className="text-sm font-medium text-gray-700">
            Couldn&apos;t load stations.
          </p>
          <p className="max-w-xs text-xs text-gray-500">
            Make sure the backend is running and reachable.
          </p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </ListShell>
    );
  }

  if (items.length === 0) {
    return (
      <ListShell>
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <MapPin className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">No stations found</p>
          <p className="max-w-xs text-xs text-gray-500">
            {isNearby
              ? "Try widening the search radius, or browse all stations."
              : "Adjust your filters to see more results."}
          </p>
        </div>
      </ListShell>
    );
  }

  // In nearby mode, nearest is first (already server-sorted); otherwise sort by name.
  const sorted = isNearby
    ? items
    : [...items].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ListShell>
      <p className="px-1 pb-2 text-xs font-medium text-gray-500">
        {sorted.length} station{sorted.length === 1 ? "" : "s"}
        {isNearby ? " near you" : ""}
      </p>
      {sorted.map((station) => {
        const isSelected = station.id === selectedId;
        return (
          <button
            key={station.id}
            type="button"
            onClick={() => onSelect(station.id)}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              isSelected
                ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900">
                  {station.brand && (
                    <span className="text-emerald-700">{station.brand} · </span>
                  )}
                  {station.name}
                </p>
                {(station.address || station.city) && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {[station.address, station.city]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
              {typeof station.distance_meters === "number" && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  {formatDistance(station.distance_meters)}
                </span>
              )}
            </div>

            {station.fuel_types.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {station.fuel_types.map((fuel) => (
                  <span
                    key={fuel.code}
                    className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                  >
                    {fuel.code}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <a
                href={directionsUrl(
                  {
                    latitude: station.latitude,
                    longitude: station.longitude,
                  },
                  userLocation,
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <Navigation className="h-3 w-3" /> Directions
              </a>
              <span className="text-[11px] font-medium text-gray-400">
                {isSelected ? "Focused on map" : "Click to focus"}
              </span>
            </div>
          </button>
        );
      })}
    </ListShell>
  );
}

function ListShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
      {children}
    </div>
  );
}
