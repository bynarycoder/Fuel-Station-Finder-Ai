/**
 * Types for the backend geocoding proxy (`/api/v1/geocode`).
 *
 * The backend resolves place names via Nominatim server-side; the browser
 * only ever talks to our own API (no third-party geocoding keys, ever).
 * A `GeocodePlace` is a REAL provider-resolved location — the location
 * picker must never invent or default coordinates, and the user must
 * explicitly confirm a place before it becomes the manual location.
 */

export interface GeocodePlace {
  latitude: number;
  longitude: number;
  /** Human-readable name, e.g. "Kaduna, Kaduna State, Nigeria". */
  display_name: string;
  name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  type: string | null;
}

export interface GeocodeSearchResponse {
  query: string;
  results: GeocodePlace[];
}
