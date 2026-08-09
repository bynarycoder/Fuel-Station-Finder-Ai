/**
 * Frontend domain types mirroring the backend Pydantic schemas (Phase 4 API).
 *
 * Coordinates are plain numbers; the backend stores them as a PostGIS
 * `geography` point and returns `latitude`/`longitude`.
 */

export interface FuelTypeBrief {
  code: string;
  name: string;
}

export interface Station {
  id: string;
  name: string;
  brand: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
  fuel_types: FuelTypeBrief[];
  created_at: string;
  updated_at: string;
}

/** A station returned by the nearby endpoint, augmented with distance. */
export interface StationWithDistance extends Station {
  distance_meters: number;
}

export interface PaginatedStations {
  items: Station[];
  total: number;
  page: number;
  page_size: number;
}

export interface NearbyStations {
  items: StationWithDistance[];
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Canonical Nigerian fuel product codes (for filter dropdowns). */
export const FUEL_TYPE_CODES = ["PMS", "AGO", "DPK", "LPG", "CNG"] as const;
export type FuelTypeCode = (typeof FUEL_TYPE_CODES)[number];

export const FUEL_TYPE_LABELS: Record<FuelTypeCode, string> = {
  PMS: "Petrol (PMS)",
  AGO: "Diesel (AGO)",
  DPK: "Kerosene (DPK)",
  LPG: "Cooking Gas (LPG)",
  CNG: "Compressed Natural Gas (CNG)",
};
