"use client";

/**
 * Fuel Station Finder — interactive map home (Phase 5).
 *
 * Orchestrates the filter bar, the station list and the Leaflet map, sharing
 * one React Query result between them. Layout is a two-pane app on large
 * screens and stacks on mobile.
 */

import Link from "next/link";
import { Flame, Info } from "lucide-react";

import { StationFilters } from "@/components/stations/StationFilters";
import { StationList } from "@/components/stations/StationList";
import StationMap from "@/components/map/StationMap";
import { useStationsQuery } from "@/hooks/useStations";
import { useMapStore } from "@/store/useMapStore";

export default function FinderPage() {
  const { items, isLoading, isError, refetch, isNearby } = useStationsQuery();
  const userLocation = useMapStore((s) => s.userLocation);
  const selectedStationId = useMapStore((s) => s.selectedStationId);
  const setSelectedStationId = useMapStore((s) => s.setSelectedStationId);

  return (
    <main className="flex h-screen flex-col bg-gray-50">
      <header className="z-[1000] flex items-center justify-between border-b-4 border-amber-500 bg-emerald-900 px-4 py-3 text-white shadow-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500 p-2 shadow-inner">
            <Flame className="h-5 w-5 animate-pulse text-emerald-950" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight sm:text-lg">
              Fuel Station Finder AI
            </h1>
            <p className="text-[11px] text-emerald-200">
              Find fuel across Nigeria — live map &amp; nearby search
            </p>
          </div>
        </div>
        <Link
          href="/about"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950"
        >
          <Info className="h-3.5 w-3.5" /> About
        </Link>
      </header>

      <div className="shrink-0 space-y-3 p-4">
        <StationFilters />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <section className="order-2 min-h-0 lg:order-1">
          <StationList
            items={items}
            isLoading={isLoading}
            isError={isError}
            isNearby={isNearby}
            selectedId={selectedStationId}
            userLocation={userLocation}
            onSelect={setSelectedStationId}
            onRetry={() => void refetch()}
          />
        </section>

        <section className="order-1 isolate h-[55vh] min-h-0 overflow-hidden rounded-2xl border border-gray-200 shadow-sm lg:order-2 lg:h-full">
          <StationMap
            items={items}
            userLocation={userLocation}
            selectedStationId={selectedStationId}
            isNearby={isNearby}
            onSelect={setSelectedStationId}
          />
        </section>
      </div>
    </main>
  );
}
