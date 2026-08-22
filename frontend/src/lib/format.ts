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
 * Haversine distance between two WGS-84 points, in metres.
 * Used as a client-side fallback when the nearby endpoint's
 * distance_meters is unavailable (e.g. StationDetail in browse mode).
 */
export function haversineDistance(
  a: LatLng,
  b: LatLng,
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Convenience wrapper: distance from user to a station, formatted. */
export function formatDistanceFrom(
  user: LatLng | null,
  station: LatLng,
  serverMeters?: number,
): string {
  if (typeof serverMeters === "number") return formatDistance(serverMeters);
  if (!user) return "";
  return formatDistance(haversineDistance(user, station));
}

/**
 * Build a Google Maps directions URL — real routing without needing a
 * dedicated routing API key. The destination is ALWAYS the station's exact
 * latitude/longitude (never the name alone), safely URL-encoded via
 * URLSearchParams. Uses the user's location as the origin when available.
 *
 * Returns `null` (never a malformed URL) when the destination coordinates are
 * missing or not finite numbers — callers must render the link only when a
 * URL is returned. This guarantees no `destination=undefined,undefined` URL
 * can ever be emitted, and latitude/longitude are never swapped.
 */
export function directionsUrl(
  destination: LatLng,
  origin: LatLng | null,
): string | null {
  const destLat = Number(destination?.latitude);
  const destLon = Number(destination?.longitude);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLon)) {
    return null;
  }
  // Range sanity: reject impossible coordinates rather than sending them to
  // the navigation provider (e.g. a reversed lat/lon pair).
  if (destLat < -90 || destLat > 90 || destLon < -180 || destLon > 180) {
    return null;
  }

  const params = new URLSearchParams({
    api: "1",
    destination: `${destLat},${destLon}`,
    travelmode: "driving",
  });
  if (origin) {
    const originLat = Number(origin.latitude);
    const originLon = Number(origin.longitude);
    if (
      Number.isFinite(originLat) &&
      Number.isFinite(originLon) &&
      originLat >= -90 &&
      originLat <= 90 &&
      originLon >= -180 &&
      originLon <= 180
    ) {
      params.set("origin", `${originLat},${originLon}`);
    }
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Human-relative timestamp, e.g. `just now`, `12m ago`, `3h ago`, `2d ago`.
 * Pure – requires `nowMs` to be passed in so it never calls Date.now() during SSR.
 * Use the <RelativeTime /> client component for render paths to avoid hydration mismatch.
 */
export function formatRelative(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = nowMs - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Legacy wrapper that still uses Date.now() – only safe to call inside
 * useEffect / event handlers, never during SSR/render. Prefer formatRelative
 * with explicit nowMs or <RelativeTime />.
 */
export function formatRelativeFromNow(iso: string): string {
  return formatRelative(iso, Date.now());
}
