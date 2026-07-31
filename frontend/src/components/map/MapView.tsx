"use client";

/**
 * The interactive Leaflet map (client-only — Leaflet needs `window`).
 *
 * Rendered through `StationMap`, which lazy-imports this module with
 * `ssr: false`, so it is never executed during server-side prerendering.
 */

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

import {
  clusterIcon,
  selectedStationIcon,
  stationIcon,
  userLocationIcon,
} from "./icons";
import type { StationItem } from "@/hooks/useStations";
import type { LatLng } from "@/types/station";
import { directionsUrl, formatDistance } from "@/lib/format";

// Default view: Lagos mainland (used before the user shares their location).
const DEFAULT_CENTER: L.LatLngExpression = [6.5244, 3.3792];
const DEFAULT_ZOOM = 12;

interface MapViewProps {
  items: StationItem[];
  userLocation: LatLng | null;
  selectedStationId: string | null;
  isNearby: boolean;
  onSelect: (id: string) => void;
}

/**
 * Imperatively recentre the map when the user's location or the selected
 * station changes. Must be rendered inside <MapContainer> to access the map.
 */
function MapController({
  items,
  userLocation,
  selectedStationId,
  isNearby,
}: {
  items: StationItem[];
  userLocation: LatLng | null;
  selectedStationId: string | null;
  isNearby: boolean;
}) {
  const map = useMap();

  // Recentre on the user's location when entering nearby mode.
  useEffect(() => {
    if (isNearby && userLocation) {
      map.flyTo([userLocation.latitude, userLocation.longitude], 13, {
        duration: 0.75,
      });
    }
  }, [isNearby, userLocation, map]);

  // Fly to a station when it is selected from the list.
  useEffect(() => {
    if (!selectedStationId) return;
    const station = items.find((s) => s.id === selectedStationId);
    if (station) {
      map.flyTo([station.latitude, station.longitude], 15, {
        duration: 0.75,
      });
    }
  }, [selectedStationId, items, map]);

  return null;
}

export default function MapView({
  items,
  userLocation,
  selectedStationId,
  isNearby,
  onSelect,
}: MapViewProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController
        items={items}
        userLocation={userLocation}
        selectedStationId={selectedStationId}
        isNearby={isNearby}
      />

      <MarkerClusterGroup
        iconCreateFunction={clusterIcon}
        showCoverageOnHover={false}
        chunkedLoading
        maxClusterRadius={50}
      >
        {items.map((station) => (
          <Marker
            key={station.id}
            position={[station.latitude, station.longitude]}
            icon={
              station.id === selectedStationId
                ? selectedStationIcon
                : stationIcon
            }
            eventHandlers={{ click: () => onSelect(station.id) }}
          >
            <Popup>
              <div className="min-w-[200px] space-y-1">
                <p className="text-sm font-bold text-gray-900">
                  {station.brand ? `${station.brand} · ` : ""}
                  {station.name}
                </p>
                {station.address && (
                  <p className="text-xs text-gray-600">{station.address}</p>
                )}
                {(station.city || station.state) && (
                  <p className="text-xs text-gray-500">
                    {[station.city, station.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {station.fuel_types.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
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
                {typeof station.distance_meters === "number" && (
                  <p className="pt-1 text-xs font-semibold text-amber-600">
                    {formatDistance(station.distance_meters)} away
                  </p>
                )}
                <a
                  href={directionsUrl(
                    { latitude: station.latitude, longitude: station.longitude },
                    userLocation,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white no-underline hover:bg-emerald-800"
                >
                  🧭 Get directions
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>

      {userLocation && (
        <Marker
          position={[userLocation.latitude, userLocation.longitude]}
          icon={userLocationIcon}
        >
          <Popup>You are here</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
