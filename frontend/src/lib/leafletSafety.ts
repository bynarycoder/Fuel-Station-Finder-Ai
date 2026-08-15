/**
 * Leaflet camera-movement safety layer (framework-independent).
 *
 * The production crash — `Uncaught Error: Invalid LatLng object: (NaN, NaN)`
 * from `flyTo -> unproject -> pointToLatLng` — happens when Leaflet is asked
 * to move the camera on a map whose container has a 0×0 size (e.g. a second,
 * CSS-hidden map instance), or with a coordinate that is NaN/Infinity.
 * Leaflet's projection then divides by zero and throws, which bubbles into
 * React and blanks the whole app.
 *
 * Every camera move in the app MUST go through these helpers. They:
 *   - validate coordinates before Leaflet ever sees them;
 *   - refuse to move a map whose measured size is not strictly positive;
 *   - wrap the Leaflet call so a throw can never reach React;
 *   - return a boolean instead of throwing.
 *
 * Deliberately framework- and Leaflet-independent: the map is described by a
 * tiny structural interface, so these are unit-testable with no Leaflet import.
 */

/** The slice of a Leaflet map these helpers need. Structural, not imported. */
export interface SafeMapLike {
  /** Leaflet `getSize()`. May throw when the map has been destroyed. */
  getSize(): { x: number; y: number };
  /** Leaflet `flyTo(latlng, zoom?, options?)`. */
  flyTo(latlng: unknown, zoom?: number, options?: Record<string, unknown>): unknown;
  /** Leaflet `fitBounds(bounds, options?)`. Accepts an array of LatLng tuples. */
  fitBounds(bounds: unknown, options?: Record<string, unknown>): unknown;
}

/**
 * True when a coordinate pair is safe to hand to Leaflet.
 *
 * Rejects NaN, ±Infinity and anything outside the valid geographic range, so
 * no coordinate can ever reach Leaflet's `unproject` and divide by zero.
 */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * True when the map has a measured, strictly-positive size and is healthy.
 *
 * A 0×0 container (a hidden/duplicated map) is treated as "not ready", as is a
 * destroyed map whose `getSize()` throws. Never throws.
 */
export function isMapReady(map: SafeMapLike | null | undefined): boolean {
  if (!map) return false;
  try {
    const size = map.getSize();
    return (
      !!size &&
      Number.isFinite(size.x) &&
      Number.isFinite(size.y) &&
      size.x > 0 &&
      size.y > 0
    );
  } catch {
    return false;
  }
}

/**
 * Fly the camera to a coordinate only when it is safe to do so.
 *
 * @returns true when the move was issued successfully, false when it was
 *          rejected (invalid coordinate / unready map) or Leaflet threw.
 */
export function safeFlyTo(
  map: SafeMapLike | null | undefined,
  lat: number,
  lng: number,
  zoom: number,
  options?: Record<string, unknown>,
): boolean {
  if (!isValidLatLng(lat, lng)) return false;
  if (!isMapReady(map)) return false;
  try {
    map!.flyTo([lat, lng], zoom, options);
    return true;
  } catch (error) {
    // Never surface a Leaflet internals error to the user; keep it for devs.
    console.error("[leafletSafety] flyTo rejected", error);
    return false;
  }
}

/**
 * Fit the camera to a set of points only when they are all valid and the map
 * is ready. Mirrors `safeFlyTo`'s guarantees for `fitBounds`.
 *
 * @returns true when the move was issued, false when rejected or thrown.
 */
export function safeFitBounds(
  map: SafeMapLike | null | undefined,
  points: ReadonlyArray<readonly [number, number]>,
  options?: Record<string, unknown>,
): boolean {
  if (!isMapReady(map)) return false;
  if (points.length === 0) return false;
  for (const [lat, lng] of points) {
    if (!isValidLatLng(lat, lng)) return false;
  }
  try {
    map!.fitBounds(points, options);
    return true;
  } catch (error) {
    console.error("[leafletSafety] fitBounds rejected", error);
    return false;
  }
}
