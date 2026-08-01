"use client";

/**
 * Fuel Station Finder — interactive map home (Phases 5 & 7).
 *
 * Orchestrates the filter bar, the station list, the Leaflet map, and a live
 * "Community reports" feed that updates in real time via Supabase Realtime.
 * Layout is a two-pane app on large screens and stacks on mobile.
 */

import Link from "next/link";
import { useState } from "react";
import { Flame, Info, MessageSquare, X } from "lucide-react";

import StationMap from "@/components/map/StationMap";
import { ReportsFeed } from "@/components/reports/ReportsFeed";
import { StationFilters } from "@/components/stations/StationFilters";
import { StationList } from "@/components/stations/StationList";
import { useStationsQuery } from "@/hooks/useStations";
import { useMapStore } from "@/store/useMapStore";

export default function FinderPage() {
  const { items, isLoading, isError, refetch, isNearby } = useStationsQuery();
  const userLocation = useMapStore((s) => s.userLocation);
  const selectedStationId = useMapStore((s) => s.selectedStationId);
  const setSelectedStationId = useMapStore((s) => s.setSelectedStationId);
  const [showReports, setShowReports] = useState(false);

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReports(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-amber-400"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Live reports
          </button>
          <Link
            href="/about"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950"
          >
            <Info className="h-3.5 w-3.5" /> About
          </Link>
        </div>
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

      {showReports && (
        <div className="fixed inset-0 z-[2000] flex justify-end">
          <button
            type="button"
            aria-label="Close reports"
            onClick={() => setShowReports(false)}
            className="flex-1 cursor-default bg-black/40"
          />
          <aside className="flex h-full w-full max-w-md flex-col bg-gray-50 shadow-2xl">
            <div className="flex items-center justify-end p-2">
              <button
                type="button"
                onClick={() => setShowReports(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 border-t border-gray-200 bg-white">
              <ReportsFeed />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
