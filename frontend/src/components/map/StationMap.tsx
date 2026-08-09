"use client";

/**
 * SSR-safe wrapper around the Leaflet map.
 *
 * Leaflet requires `window`, so the actual map is lazy-imported with
 * `ssr: false`. Because this file is itself a Client Component, using
 * `ssr: false` here is allowed (the restriction only applies inside Server
 * Components in the App Router).
 */

import dynamic from "next/dynamic";

import type { StationItem } from "@/hooks/useStations";
import type { LatLng } from "@/types/station";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

interface StationMapProps {
  items: StationItem[];
  userLocation: LatLng | null;
  selectedStationId: string | null;
  isNearby: boolean;
  closestStationId?: string | null;
  onSelect: (id: string) => void;
}

export default function StationMap(props: StationMapProps) {
  return <MapView {...props} />;
}
