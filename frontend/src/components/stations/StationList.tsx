"use client";

/**
 * Scrollable list of stations with loading / error / empty states.
 *
 * Each row shows the station summary, its offered fuels, the distance (in
 * nearby mode), a favorite heart (authenticated), a "Focus" action (selects
 * the station on the map) and a "Directions" deep link.
 *
 * In nearby mode the list additionally renders a prominent "Closest to you"
 * card for the nearest station — with real latest prices, queue length and
 * report freshness pulled from the station's actual reports.
 */

import { Crown, Fuel, Heart, MapPin, Navigation, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useStationReports } from "@/hooks/useStationReports";
import type { StationItem } from "@/hooks/useStations";
import { QUEUE_LENGTH_LABELS } from "@/types/report";
import type { LatLng } from "@/types/station";
import { directionsUrl, formatDistance, formatRelative, haversineDistance } from "@/lib/format";

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
            Check your connection and try again. If the problem persists, the backend may be waking up — wait a moment and retry.
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

  // In nearby mode, sort nearest → farthest (server value, else Haversine
  // from the user's position) so the list never depends on API ordering.
  // In browse mode, sort by name.
  const sorted = isNearby
    ? [...items].sort((a, b) => {
        const da =
          typeof a.distance_meters === "number"
            ? a.distance_meters
            : userLocation
              ? haversineDistance(userLocation, a)
              : Number.MAX_SAFE_INTEGER;
        const db =
          typeof b.distance_meters === "number"
            ? b.distance_meters
            : userLocation
              ? haversineDistance(userLocation, b)
              : Number.MAX_SAFE_INTEGER;
        return da - db;
      })
    : [...items].sort((a, b) => a.name.localeCompare(b.name));

  const closest = isNearby ? sorted[0] : null;

  return (
    <ListShell>
      <p className="px-1 pb-1 text-xs font-medium text-gray-500">
        {sorted.length} station{sorted.length === 1 ? "" : "s"}
        {isNearby ? " near you" : ""} {isNearby && closest ? "· sorted by distance" : ""}
      </p>

      {/* Prominent "Closest to you" card — satisfies the capstone spec example */}
      {closest && (
        <ClosestCard
          station={closest}
          userLocation={userLocation}
          onSelect={onSelect}
          isSelected={closest.id === selectedId}
          isFavorite={favoriteIds?.has(closest.id) ?? false}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      {/* Remaining stations (or all if not nearby) */}
      {(isNearby ? sorted.slice(1) : sorted).map((station) => {
        const isSelected = station.id === selectedId;
        const isFavorite = favoriteIds?.has(station.id) ?? false;
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
              <div className="flex shrink-0 items-center gap-1.5">
                {typeof station.distance_meters === "number" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {formatDistance(station.distance_meters)}
                  </span>
                )}
                {onToggleFavorite && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={isFavorite}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(station.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleFavorite(station.id);
                      }
                    }}
                    className={`rounded-full p-1.5 transition-colors ${
                      isFavorite
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-gray-300 hover:text-amber-400"
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${isFavorite ? "fill-amber-500" : ""}`} />
                  </span>
                )}
              </div>
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

function ClosestCard({
  station,
  userLocation,
  onSelect,
  isSelected,
  isFavorite,
  onToggleFavorite,
}: {
  station: StationItem;
  userLocation: LatLng | null;
  onSelect: (id: string) => void;
  isSelected: boolean;
  isFavorite: boolean;
  onToggleFavorite?: (stationId: string) => void;
}) {
  // Pull the closest station's actual reports (prices, queue, freshness).
  const { data, isLoading: reportsLoading } = useStationReports(station.id);
  const reports = data?.items ?? [];
  const latest = reports[0] ?? null;

  const hasPms = station.fuel_types.some((f) => f.code === "PMS");
  const hasAgo = station.fuel_types.some((f) => f.code === "AGO");
  const hasDpk = station.fuel_types.some((f) => f.code === "DPK");
  const hasLpg = station.fuel_types.some((f) => f.code === "LPG");
  const hasCng = station.fuel_types.some((f) => f.code === "CNG");

  // Latest price per fuel type (from the latest reports, price-only rows).
  const latestByFuel = new Map<string, number>();
  for (const r of reports) {
    if (r.price_per_litre != null && !latestByFuel.has(r.fuel_type.code)) {
      latestByFuel.set(r.fuel_type.code, r.price_per_litre);
    }
  }

  const availabilityParts: string[] = [];
  if (hasPms) availabilityParts.push("PMS");
  if (hasAgo) availabilityParts.push("AGO");
  if (hasDpk) availabilityParts.push("DPK");
  if (hasLpg) availabilityParts.push("LPG");
  if (hasCng) availabilityParts.push("CNG");
  const availabilityLabel =
    availabilityParts.length > 0 ? availabilityParts.join(" · ") : "Fuel info in details";

  return (
    <div
      className={`rounded-2xl border-2 p-4 shadow-sm ${
        isSelected
          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
          : "border-amber-400 bg-gradient-to-br from-amber-50 to-white"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
          <Crown className="h-3.5 w-3.5" /> Closest to you
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(station.id)}
            className={`rounded-full p-1.5 transition-colors ${
              isFavorite ? "text-amber-500" : "text-gray-300 hover:text-amber-400"
            }`}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? "fill-amber-500" : ""}`} />
          </button>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold leading-tight text-gray-900">
            {station.brand ? `${station.brand} · ` : ""}
            {station.name}
          </p>
          {(station.address || station.city || station.state) && (
            <p className="mt-1 text-xs text-gray-600">
              {[station.address, [station.city, station.state].filter(Boolean).join(", ")]
                .filter(Boolean)
                .join(" — ")}
            </p>
          )}
        </div>
        {typeof station.distance_meters === "number" && (
          <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm">
            {formatDistance(station.distance_meters)} away
          </span>
        )}
      </div>

      {/* Latest prices + queue + freshness from real reports */}
      <div className="mt-3 space-y-1.5 rounded-xl bg-white/80 p-2.5 ring-1 ring-amber-100">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          {hasPms ? "🟢 Fuel available" : availabilityLabel}
        </p>
        {reportsLoading ? (
          <p className="text-xs text-gray-400">Loading latest prices…</p>
        ) : latestByFuel.size > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {[...latestByFuel.entries()].map(([code, price]) => (
              <span key={code} className="text-xs font-semibold text-gray-800">
                {code}: <span className="text-emerald-700">₦{price.toLocaleString()}/L</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No price reports yet — check View Station.</p>
        )}
        {latest?.queue_length && (
          <p className="text-xs font-medium text-gray-700">
            Queue: {QUEUE_LENGTH_LABELS[latest.queue_length]}
          </p>
        )}
        {latest && (
          <p className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
            <Fuel className="h-3 w-3 text-gray-400" />
            Reported {formatRelative(latest.created_at)}
            {latest.status === "verified" ? " · ✅ verified" : " · pending verification"}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={directionsUrl(
            { latitude: station.latitude, longitude: station.longitude },
            userLocation,
          )}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
        >
          <Navigation className="h-3.5 w-3.5" /> Get Directions
        </a>
        <button
          type="button"
          onClick={() => onSelect(station.id)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50"
        >
          <MapPin className="h-3.5 w-3.5" /> View Station
        </button>
      </div>
    </div>
  );
}

function ListShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
      {children}
    </div>
  );
}
