"use client";

/**
 * Scrollable list of stations with loading / error / empty states.
 *
 * Each row shows the station summary, its offered fuels, the distance (in
 * nearby mode), a "Focus" action (selects the station on the map) and a
 * "Directions" deep link.
 *
 * In nearby mode the list additionally renders a prominent "Closest to you"
 * card for the nearest station, as required by the capstone spec.
 */

import { Crown, Fuel, MapPin, Navigation, SearchX } from "lucide-react";
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

  // In nearby mode, nearest is first (already server-sorted); otherwise sort by name.
  const sorted = isNearby
    ? items
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
        />
      )}

      {/* Remaining stations (or all if not nearby) */}
      {(isNearby ? sorted.slice(1) : sorted).map((station) => {
        const isSelected = station.id === selectedId;
        // In nearby mode the closest is already shown above; highlight none of the rest as closest.
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

function ClosestCard({
  station,
  userLocation,
  onSelect,
  isSelected,
}: {
  station: StationItem;
  userLocation: LatLng | null;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const hasPms = station.fuel_types.some((f) => f.code === "PMS");
  const hasAgo = station.fuel_types.some((f) => f.code === "AGO");
  const hasDpk = station.fuel_types.some((f) => f.code === "DPK");
  const hasLpg = station.fuel_types.some((f) => f.code === "LPG");

  // Build a short availability summary that mirrors the spec example.
  const availabilityParts: string[] = [];
  if (hasPms) availabilityParts.push("PMS");
  if (hasAgo) availabilityParts.push("AGO");
  if (hasDpk) availabilityParts.push("DPK");
  if (hasLpg) availabilityParts.push("CNG/LPG");
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
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
        <Crown className="h-3.5 w-3.5" /> Closest to you
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

      {/* Spec example fields: availability, price, queue — show what we know */}
      <div className="mt-3 space-y-1.5 rounded-xl bg-white/80 p-2.5 ring-1 ring-amber-100">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          {hasPms ? "🟢 PMS available" : availabilityLabel}
        </p>
        {/* Price / queue are per-report; the list endpoint carries fuel_types but not prices.
            We surface fuels and direct the user to the details for live prices/queue. */}
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
          <Fuel className="h-3.5 w-3.5 text-gray-400" />
          {station.fuel_types.length > 0 ? (
            station.fuel_types.map((f) => (
              <span
                key={f.code}
                className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"
              >
                {f.code}
              </span>
            ))
          ) : (
            <span className="text-gray-500">Fuel options in details →</span>
          )}
          <span className="text-gray-400">· Tap View for prices & queue</span>
        </p>
        <p className="text-[11px] leading-relaxed text-gray-500">
          Live prices, queue length and community confidence are shown in <strong>View Station</strong>.
          Verified reports are highlighted there.
        </p>
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
