"use client";

/**
 * The interactive Leaflet map (client-only — Leaflet needs `window`).
 *
 * Rendered through `StationMap`, which lazy-imports this module with
 * `ssr: false`, so it is never executed during server-side prerendering.
 *
 * Near Me experience:
 * - Shows the user's location with a distinct "You are here" marker
 * - Centers on the user when they first enter nearby mode, but does NOT fight
 *   manual pans on every watchPosition update (recenter is explicit)
 * - Provides a "Recenter on Me" control that flies back to the user without
 *   re-requesting permission
 * - Keeps station markers visible, fits bounds responsibly
 */

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

import {
  closestStationIcon,
  clusterIcon,
  selectedStationIcon,
  stationIcon,
  userLocationIcon,
} from "./icons";
import { useMapStore } from "@/store/useMapStore";
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
  /** Id of the nearest station (highlighted with a crown pin). */
  closestStationId?: string | null;
  onSelect: (id: string) => void;
}

/**
 * Imperatively handle map movements: initial nearby centering + station focus + recenter.
 * Must be rendered inside <MapContainer> to access the map instance.
 */
function MapController({
  items,
  userLocation,
  selectedStationId,
  isNearby,
  recenterKey,
}: {
  items: StationItem[];
  userLocation: LatLng | null;
  selectedStationId: string | null;
  isNearby: boolean;
  recenterKey: number;
}) {
  const map = useMap();
  const hasCenteredNearbyRef = useRef(false);
  const prevNearbyRef = useRef(false);

  // When entering nearby mode for the first time, center on the user.
  // We do NOT auto-center on every watchPosition tick — that would fight
  // manual panning. Subsequent location updates are reflected only by the
  // marker moving; the user can recenter explicitly.
  useEffect(() => {
    if (!isNearby) {
      // Reset the "has centered" flag when leaving nearby mode.
      hasCenteredNearbyRef.current = false;
      prevNearbyRef.current = false;
      return;
    }

    const enteredNearby = !prevNearbyRef.current;

    if (enteredNearby && userLocation) {
      // Entering nearby mode: center on the user right away (don't wait for
      // the nearby query), at a sensible zoom.
      map.flyTo([userLocation.latitude, userLocation.longitude], 13, {
        duration: 0.75,
      });
    }

    // Fit user + stations once results are available (either immediately on
    // entry, or when they arrive a moment later). Never re-fits afterwards,
    // so manual pans are respected.
    if (userLocation && items.length > 0 && !hasCenteredNearbyRef.current) {
      try {
        const bounds = L.latLngBounds(
          [userLocation.latitude, userLocation.longitude],
          [userLocation.latitude, userLocation.longitude],
        );
        for (const s of items) bounds.extend([s.latitude, s.longitude]);
        // Don't zoom out too far if stations are spread; maxZoom 14 keeps detail.
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
        hasCenteredNearbyRef.current = true;
      } catch {
        // Malformed coordinates — keep the flyTo center from above.
        hasCenteredNearbyRef.current = true;
      }
    }

    prevNearbyRef.current = true;
  }, [isNearby, userLocation, items, map]);

  // Explicit recenter (button or event) — always flies to user.
  useEffect(() => {
    if (recenterKey === 0) return;
    if (!userLocation) return;
    map.flyTo([userLocation.latitude, userLocation.longitude], 14, {
      duration: 0.6,
    });
  }, [recenterKey, userLocation, map]);

  // Fly to a station when it is selected from the list (same as before).
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
  closestStationId,
  onSelect,
}: MapViewProps) {
  const [recenterKey, setRecenterKey] = useState(0);
  const radiusMeters = useMapStore((s) => s.radiusMeters);

  const triggerRecenter = useCallback(() => {
    setRecenterKey((k) => k + 1);
  }, []);

  // Listen for the filter bar's "recenter-on-me" custom event.
  useEffect(() => {
    const handler = () => triggerRecenter();
    window.addEventListener("recenter-on-me", handler as EventListener);
    return () => window.removeEventListener("recenter-on-me", handler as EventListener);
  }, [triggerRecenter]);

  return (
    <div className="relative h-full w-full">
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
          recenterKey={recenterKey}
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
                  : closestStationId === station.id
                    ? closestStationIcon
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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(station.id);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-xs font-bold text-emerald-950 hover:bg-amber-400"
                    >
                      ℹ️ View details
                    </button>
                    <a
                      href={directionsUrl(
                        { latitude: station.latitude, longitude: station.longitude },
                        userLocation,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white no-underline hover:bg-emerald-800"
                    >
                      🧭 Get directions
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>

        {userLocation && (
          <>
            {/* Nearby-search radius visualization (nearby mode only) */}
            {isNearby && radiusMeters > 0 && (
              <Circle
                center={[userLocation.latitude, userLocation.longitude]}
                radius={radiusMeters}
                pathOptions={{
                  color: "#10b981",
                  weight: 1,
                  dashArray: "4 4",
                  fillColor: "#10b981",
                  fillOpacity: 0.04,
                }}
              />
            )}
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={userLocationIcon}
            >
              <Popup>
                <p className="text-xs font-bold text-gray-900">You are here</p>
                {isNearby && (
                  <p className="text-[11px] text-gray-500">
                    Searching within {radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`}
                  </p>
                )}
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      {/* Recenter control — visible only when we know the user's location */}
      {userLocation && (
        <button
          type="button"
          onClick={triggerRecenter}
          className="absolute bottom-4 right-4 z-[400] inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          title="Center the map on your current location"
          aria-label="Recenter on me"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
          Recenter on Me
        </button>
      )}
    </div>
  );
}
