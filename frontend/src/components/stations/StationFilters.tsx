"use client";

/**
 * Filter + search controls for the station finder — complete Near Me experience.
 *
 * Wires the form to the Zustand map store and exposes:
 * - "Near me" — requests permission once, stores location, starts continuous watchPosition
 * - "Recenter on Me" — flies back to the last known location without re-prompting
 * - Radius selector, fuel filters, text search
 * - User-friendly geolocation error states (permission denied / unavailable / timeout / unsupported)
 *   and a network-failure hint, without re-requesting permission in a loop.
 */

import { AlertCircle, LocateFixed, Map as MapIcon, Navigation, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  DEFAULT_RADIUS_METERS,
  RADIUS_OPTIONS,
  useMapStore,
} from "@/store/useMapStore";
import {
  FUEL_TYPE_CODES,
  FUEL_TYPE_LABELS,
} from "@/types/station";

export function StationFilters() {
  const { filters, mode, radiusMeters, userLocation, setFilters, setMode, setUserLocation, setRadiusMeters, setSelectedStationId } =
    useMapStore();
  const { request, startWatch, stopWatch, loading, isWatching, error: geoError, errorCode } = useGeolocation();
  const [localGeoError, setLocalGeoError] = useState<string | null>(null);

  const isNearby = mode === "nearby";
  const displayError = localGeoError || geoError;

  // When the user leaves nearby mode, stop continuous tracking to save battery.
  useEffect(() => {
    if (!isNearby) {
      stopWatch();
    }
  }, [isNearby, stopWatch]);

  // Cleanup watch on unmount (hook also does this, but belt-and-suspenders).
  useEffect(() => {
    return () => stopWatch();
  }, [stopWatch]);

  async function handleNearMe() {
    setLocalGeoError(null);
    try {
      const location = await request();
      setUserLocation(location);
      setMode("nearby");
      setSelectedStationId(null);
      // Start continuous tracking after the initial fix — updates the store
      // silently as the user moves, without re-prompting for permission.
      startWatch((newLoc) => {
        setUserLocation(newLoc);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not get your location.";
      setLocalGeoError(message);
      // Keep in browse mode so the list/map still show stations.
    }
  }

  function handleBrowseAll() {
    setMode("browse");
    setSelectedStationId(null);
    stopWatch();
    setLocalGeoError(null);
  }

  function handleRecenter() {
    if (!userLocation) {
      // No known location — treat as a fresh Near Me request.
      void handleNearMe();
      return;
    }
    // Location is already known; the MapView recenter button handles the flyTo.
    // This button is a convenience duplicate for the filter bar — dispatch an
    // event that MapView listens to, and also ensure we're in nearby mode.
    if (!isNearby) setMode("nearby");
    window.dispatchEvent(new CustomEvent("recenter-on-me"));
  }

  const isPermissionDenied = errorCode === 1;

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={isNearby ? "secondary" : "primary"}
          size="sm"
          onClick={handleBrowseAll}
        >
          <MapIcon className="h-4 w-4" /> Browse all
        </Button>
        <Button
          type="button"
          variant={isNearby ? "accent" : "secondary"}
          size="sm"
          onClick={handleNearMe}
          disabled={loading}
          title={isWatching ? "Live location tracking is active" : undefined}
        >
          <LocateFixed className={`h-4 w-4 ${isWatching ? "animate-pulse" : ""}`} />
          {loading ? "Locating…" : isWatching ? "Tracking you" : "Near me"}
        </Button>

        {isNearby && userLocation && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRecenter}
            title="Center the map on your current location"
          >
            <Navigation className="h-4 w-4" /> Recenter on Me
          </Button>
        )}

        {isNearby && (
          <label className="ml-auto flex items-center gap-2 text-xs font-medium text-gray-600">
            Radius
            <select
              className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-sm"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
            >
              {RADIUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value >= 1000 ? `${value / 1000} km` : `${value} m`}
                </option>
              ))}
              {![...RADIUS_OPTIONS, DEFAULT_RADIUS_METERS].includes(
                radiusMeters,
              ) && <option value={radiusMeters}>{radiusMeters} m</option>}
            </select>
          </label>
        )}
      </div>

      {displayError && (
        <div
          role="alert"
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
            isPermissionDenied
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {isPermissionDenied ? "Location access denied" : "Could not get your location"}
            </p>
            <p className="mt-0.5 opacity-90">{displayError}</p>
            {isPermissionDenied ? (
              <p className="mt-1.5 text-[11px] opacity-80">
                Tip: In your browser address bar, click the lock/location icon → allow location,
                then click <strong>Near me</strong> again. You can still browse all stations in the meantime.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void handleNearMe()}>
                  Try again
                </Button>
                <Button variant="ghost" size="sm" onClick={handleBrowseAll}>
                  Browse all stations
                </Button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setLocalGeoError(null)}
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-black/5 hover:text-gray-600"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {isNearby && userLocation && !displayError && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Showing stations near you
          {isWatching ? " — live tracking on" : ""} · {userLocation.latitude.toFixed(4)},{" "}
          {userLocation.longitude.toFixed(4)}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search station name…"
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value })}
            className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <input
          type="text"
          placeholder="Brand (e.g. NNPC)"
          value={filters.brand}
          onChange={(e) => setFilters({ brand: e.target.value })}
          className="h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <input
          type="text"
          placeholder="City"
          value={filters.city}
          onChange={(e) => setFilters({ city: e.target.value })}
          className="h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Fuel
        </span>
        <button
          type="button"
          onClick={() => setFilters({ fuelType: "" })}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            filters.fuelType === ""
              ? "bg-emerald-700 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Any
        </button>
        {FUEL_TYPE_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setFilters({ fuelType: code })}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filters.fuelType === code
                ? "bg-emerald-700 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {FUEL_TYPE_LABELS[code]}
          </button>
        ))}
      </div>
    </div>
  );
}
