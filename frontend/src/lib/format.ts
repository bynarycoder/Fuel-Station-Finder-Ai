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

/** Human-relative timestamp, e.g. `just now`, `12m ago`, `3h ago`, `2d ago`. */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
