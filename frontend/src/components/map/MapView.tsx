"use client";

/**
 * The interactive Leaflet map (client-only — Leaflet needs `window`).
 *
 * Rendered through `StationMap`, which lazy-imports this module with
 * `ssr: false`, so it is never executed during server-side prerendering.
 *
 * Behaviour preserved from the previous implementation (all of it deliberate):
 * - centers on the user when first entering nearby mode, then NEVER fights a
 *   manual pan on subsequent watchPosition ticks;
 * - fits user + stations once per nearby session;
 * - "recenter-on-me" window event flies back to the user;
 * - flies to a station when it is selected from the list.
 *
 * Redesigned here:
 * - map is a full-bleed product surface, not a boxed widget;
 * - markers differentiate available / unavailable / verified / closest /
 *   selected / user (see ./icons);
 * - a compact floating control stack replaces the wide text button;
 * - popups are a short teaser that hands off to the real detail panel instead
 *   of duplicating an entire station card inside Leaflet.
 */

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { clusterIcon, iconForStation, userLocationIcon } from "./icons";
import { MapControls } from "@/components/map/MapControls";
import { useMapStore } from "@/store/useMapStore";
import type { StationItem } from "@/hooks/useStations";
import type { LatLng } from "@/types/station";
import { formatDistance } from "@/lib/format";
import {
  isValidLatLng,
  safeFitBounds,
  safeFlyTo,
} from "@/lib/leafletSafety";
import { stationNameParts } from "@/lib/stationName";

// Visual-only map start (Lagos mainland). NEVER used as the nearby-search
// origin — userSearchLocation lives in the Zustand store and starts as null.
const DEFAULT_CENTER: L.LatLngExpression = [6.5244, 3.3792];
const DEFAULT_ZOOM = 12;

interface MapViewProps {
  items: StationItem[];
  userLocation: LatLng | null;
  selectedStationId: string | null;
  isNearby: boolean;
  /** Id of the nearest station (highlighted with the accent pin). */
  closestStationId?: string | null;
  onSelect: (id: string) => void;
  /** Extra bottom padding for the controls, so they clear the bottom sheet. */
  controlsClassName?: string;
}

/**
 * Imperatively handle map movements: initial nearby centering + station focus +
 * recenter. Must be rendered inside <MapContainer> to access the map instance.
 */
function MapController({
  items,
  userLocation,
  selectedStationId,
  isNearby,
  recenterKey,
  onReady,
}: {
  items: StationItem[];
  userLocation: LatLng | null;
  selectedStationId: string | null;
  isNearby: boolean;
  recenterKey: number;
  onReady: (map: L.Map) => void;
}) {
  const map = useMap();
  const hasCenteredNearbyRef = useRef(false);
  const prevNearbyRef = useRef(false);

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  // When entering nearby mode for the first time, center on the user.
  // We do NOT auto-center on every watchPosition tick — that would fight
  // manual panning. Subsequent location updates are reflected only by the
  // marker moving; the user can recenter explicitly.
  useEffect(() => {
    if (!isNearby) {
      hasCenteredNearbyRef.current = false;
      prevNearbyRef.current = false;
      return;
    }

    const enteredNearby = !prevNearbyRef.current;

    if (enteredNearby && userLocation) {
      // 1) initial nearby centering — guarded, never throws to React.
      safeFlyTo(map, userLocation.latitude, userLocation.longitude, 13, {
        duration: 0.75,
      });
    }

    if (userLocation && items.length > 0 && !hasCenteredNearbyRef.current) {
      // 2) fitBounds — guarded. Only valid coordinates reach Leaflet.
      const points: Array<[number, number]> = [
        [userLocation.latitude, userLocation.longitude],
        ...items.map((s) => [s.latitude, s.longitude] as [number, number]),
      ];
      safeFitBounds(map, points, { padding: [40, 40], maxZoom: 14, animate: true });
      hasCenteredNearbyRef.current = true;
    }

    prevNearbyRef.current = true;
  }, [isNearby, userLocation, items, map]);

  // Explicit recenter (button or event) — always flies to user.
  useEffect(() => {
    if (recenterKey === 0) return;
    if (!userLocation) return;
    // 3) explicit recenter — guarded.
    safeFlyTo(map, userLocation.latitude, userLocation.longitude, 14, {
      duration: 0.6,
    });
  }, [recenterKey, userLocation, map]);

  // Fly to a station when it is selected from the list.
  useEffect(() => {
    if (!selectedStationId) return;
    const station = items.find((s) => s.id === selectedStationId);
    if (station) {
      // 4) fly-to-selected-station — guarded.
      safeFlyTo(map, station.latitude, station.longitude, 15, { duration: 0.75 });
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
  controlsClassName,
}: MapViewProps) {
  const [recenterKey, setRecenterKey] = useState(0);
  const mapRef = useRef<L.Map | null>(null);
  const radiusMeters = useMapStore((s) => s.radiusMeters);
  // The store owns the location lifecycle; the control only reflects/triggers.
  const requestLocation = useMapStore((s) => s.requestLocation);
  const recenterLocation = useMapStore((s) => s.recenterLocation);
  const locating = useMapStore((s) => s.locationStatus === "requesting");
  const isWatching = useMapStore((s) => s.isWatching);
  // Label manual (user-picked) locations honestly — never "live" or "GPS".
  const locationSource = useMapStore((s) => s.locationSource);
  const manualLocationLabel = useMapStore((s) => s.manualLocationLabel);

  const triggerRecenter = useCallback(() => {
    setRecenterKey((k) => k + 1);
  }, []);

  const handleReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  // Skip stations with coordinates Leaflet cannot project (NaN/Infinity or
  // outside the valid geographic range). A single malformed row must never be
  // handed to Leaflet, which would throw `Invalid LatLng object: (NaN, NaN)`.
  const validItems = useMemo(
    () => items.filter((s) => isValidLatLng(s.latitude, s.longitude)),
    [items],
  );

  const hasValidUserLocation =
    userLocation !== null &&
    isValidLatLng(userLocation.latitude, userLocation.longitude);

  // Listen for the store's "recenter-on-me" event.
  useEffect(() => {
    const handler = () => triggerRecenter();
    window.addEventListener("recenter-on-me", handler as EventListener);
    return () => window.removeEventListener("recenter-on-me", handler as EventListener);
  }, [triggerRecenter]);

  /**
   * Locate control: if we already have a position, recenter (never re-prompt);
   * otherwise start the shared acquisition lifecycle.
   */
  const handleLocate = useCallback(() => {
    if (userLocation) {
      recenterLocation();
      return;
    }
    void requestLocation();
  }, [userLocation, recenterLocation, requestLocation]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        zoomControl={false}
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
          onReady={handleReady}
        />

        <MarkerClusterGroup
          iconCreateFunction={clusterIcon}
          showCoverageOnHover={false}
          chunkedLoading
          maxClusterRadius={50}
        >
          {validItems.map((station) => (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={iconForStation({
                isSelected: station.id === selectedStationId,
                isClosest: closestStationId === station.id,
                isVerified: station.verification_status === "verified",
                isActive: station.is_active,
              })}
              eventHandlers={{ click: () => onSelect(station.id) }}
              alt={stationNameParts(station.brand, station.name).label}
            >
              {/* A teaser, not a duplicate card — details open in the panel. */}
              <Popup closeButton={false}>
                <div className="min-w-[200px] p-3">
                  <p className="text-h3 leading-tight text-ink-900">
                    {(() => {
                      const parts = stationNameParts(station.brand, station.name);
                      return (
                        <>
                          {parts.brandPrefix && (
                            <span className="font-medium text-ink-500">
                              {parts.brandPrefix}{" "}
                            </span>
                          )}
                          {parts.name}
                        </>
                      );
                    })()}
                  </p>
                  {(station.city || station.state) && (
                    <p className="mt-0.5 text-caption text-ink-500">
                      {[station.city, station.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {typeof station.distance_meters === "number" && (
                      <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                        {formatDistance(station.distance_meters)}
                      </span>
                    )}
                    {station.verification_status === "verified" && (
                      <span className="rounded-pill bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-strong">
                        Verified
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(station.id);
                    }}
                    className="mt-2.5 inline-flex h-9 w-full items-center justify-center rounded-md bg-brand-700 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-brand-800"
                  >
                    View station
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>

        {hasValidUserLocation && userLocation && (
          <>
            {/* Nearby-search radius visualization (nearby mode only) */}
            {isNearby && radiusMeters > 0 && (
              <Circle
                center={[userLocation.latitude, userLocation.longitude]}
                radius={radiusMeters}
                pathOptions={{
                  color: "#059669",
                  weight: 1.5,
                  dashArray: "5 6",
                  fillColor: "#12b886",
                  fillOpacity: 0.05,
                }}
              />
            )}
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={userLocationIcon}
              alt={locationSource === "manual" ? "Selected location" : "Your location"}
            >
              <Popup closeButton={false}>
                <div className="p-3">
                  <p className="text-body-sm font-semibold text-ink-900">
                    {locationSource === "manual" ? "Selected location" : "You are here"}
                  </p>
                  {locationSource === "manual" && manualLocationLabel && (
                    <p className="mt-0.5 text-caption text-ink-500">
                      {manualLocationLabel}
                    </p>
                  )}
                  {isNearby && (
                    <p className="mt-0.5 text-caption text-ink-500">
                      Searching within{" "}
                      {radiusMeters >= 1000
                        ? `${radiusMeters / 1000} km`
                        : `${radiusMeters} m`}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      <MapControls
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onLocate={handleLocate}
        locating={locating}
        tracking={isWatching}
        className={controlsClassName ?? "bottom-4"}
      />
    </div>
  );
}
