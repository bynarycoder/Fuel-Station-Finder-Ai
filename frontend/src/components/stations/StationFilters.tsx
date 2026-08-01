"use client";

/**
 * Filter + search controls for the station finder.
 *
 * Wires the form to the Zustand map store and exposes a "Near me" action that
 * uses the browser geolocation hook to switch into spatial nearby mode.
 */

import { LocateFixed, Map as MapIcon, Search } from "lucide-react";

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
  const { filters, mode, radiusMeters, setFilters, setMode, setUserLocation, setRadiusMeters, setSelectedStationId } =
    useMapStore();
  const { request, loading } = useGeolocation();

  const isNearby = mode === "nearby";

  async function handleNearMe() {
    try {
      const location = await request();
      setUserLocation(location);
      setMode("nearby");
      setSelectedStationId(null);
    } catch {
      // The hook surfaces the error message; nothing more to do here.
    }
  }

  function handleBrowseAll() {
    setMode("browse");
    setSelectedStationId(null);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
        >
          <LocateFixed className="h-4 w-4" />
          {loading ? "Locating…" : "Near me"}
        </Button>

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
