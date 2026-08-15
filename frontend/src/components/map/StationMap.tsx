"use client";

/**
 * SSR-safe wrapper around the Leaflet map.
 *
 * Leaflet requires `window`, so the actual map is lazy-imported with
 * `ssr: false`. Because this file is itself a Client Component, using
 * `ssr: false` here is allowed (the restriction only applies inside Server
 * Components in the App Router).
 *
 * The loading fallback is a designed map surface — a tinted grid with a
 * pulsing pin — rather than the old "Loading map…" grey box, so the most
 * important surface in the product never flashes as an empty rectangle.
 */

import dynamic from "next/dynamic";

import type { StationItem } from "@/hooks/useStations";
import type { LatLng } from "@/types/station";

function MapLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-ink-100"
    >
      {/* Suggestion of a street grid so the surface reads as "map". */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(#e4e9ed 1px, transparent 1px), linear-gradient(90deg, #e4e9ed 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative flex flex-col items-center gap-3">
        <span className="relative flex h-10 w-10 items-center justify-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-pill bg-brand-500/40" />
          <span className="relative h-4 w-4 rounded-pill border-[3px] border-white bg-brand-700 shadow-e1" />
        </span>
        <p className="text-caption font-medium text-ink-500">Loading map…</p>
      </div>
    </div>
  );
}

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <MapLoading />,
});

interface StationMapProps {
  items: StationItem[];
  userLocation: LatLng | null;
  selectedStationId: string | null;
  isNearby: boolean;
  closestStationId?: string | null;
  onSelect: (id: string) => void;
  controlsClassName?: string;
}

export default function StationMap(props: StationMapProps) {
  return <MapView {...props} />;
}
