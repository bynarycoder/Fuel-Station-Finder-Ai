/**
 * Small presentation helpers for the map UI (distance + routing links).
 */

import type { LatLng } from "@/types/station";

/** Human-readable distance, e.g. `850 m` or `4.2 km`. */
export function formatDistance(meters?: number): string {
  if (meters == null || Number.isNaN(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

/**
 * Build a Google Maps turn-by-turn directions URL — real routing without
 * needing a dedicated routing API key. Uses the user's location as the origin
 * when available, otherwise just the destination.
 */
export function directionsUrl(
  destination: LatLng,
  origin: LatLng | null,
): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: "driving",
  });
  if (origin) {
    params.set("origin", `${origin.latitude},${origin.longitude}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
