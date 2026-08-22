"use client";

/**
 * Small Leaflet map for the location picker — one marker, draggable.
 *
 * Uses the SAME map infrastructure as the main finder map (Leaflet +
 * react-leaflet + the shared OpenStreetMap tiles), so the picker never
 * introduces a second mapping system. Only rendered inside the open
 * LocationPicker modal (via a lazy dynamic import), so it never exists while
 * the picker is closed.
 *
 * Camera discipline matches the main map: the initial fly-to goes through
 * `safeFlyTo` (never a NaN crash), and once the user drags the marker the
 * camera does NOT fight them — the map is keyed on the selected place, so a
 * NEW selection remounts this component and centers fresh; a drag just
 * reports the new coordinates upward.
 */

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import { userLocationIcon } from "@/components/map/icons";
import { safeFlyTo } from "@/lib/leafletSafety";

function FlyToSelected({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();
  useEffect(() => {
    // Centered once per selected place; dragging never re-flies (the parent
    // keys this map on the selection, not on every marker move).
    safeFlyTo(map, latitude, longitude, 14, { duration: 0.6 });
  }, [map, latitude, longitude]);
  return null;
}

export default function LocationMap({
  latitude,
  longitude,
  onMove,
}: {
  latitude: number;
  longitude: number;
  onMove: (latitude: number, longitude: number) => void;
}) {
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-hairline">
      <MapContainer
        center={[latitude, longitude]}
        zoom={13}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToSelected latitude={latitude} longitude={longitude} />
        <Marker
          position={[latitude, longitude]}
          draggable
          icon={userLocationIcon}
          alt="Selected location — drag to fine-tune"
          eventHandlers={{
            dragend: (event) => {
              const point = event.target.getLatLng();
              onMove(point.lat, point.lng);
            },
          }}
        />
      </MapContainer>
    </div>
  );
}
