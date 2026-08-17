/**
 * Frontend domain types mirroring the backend Pydantic schemas (Phase 4 API).
 *
 * Coordinates are plain numbers; the backend stores them as a PostGIS
 * `geography` point and returns `latitude`/`longitude`.
 *
 * Provenance fields (Phase 2/4): every station exposes where its catalogue
 * row came from (`data_source`) and whether the row itself is independently
 * verified by this app (`verification_status`). These are intentionally
 * separate: an OpenStreetMap/external import can be a real station while
 * remaining `unverified`; seed/demo rows are never presented as verified.
 */

export interface FuelTypeBrief {
  code: string;
  name: string;
}

/** Where a station record came from (mirrors the backend enum). */
export type StationDataSource =
  | "seed"
  | "official"
  | "government"
  | "partner"
  | "community"
  | "imported"
  | "other";

/** Verification state of the station record itself (backend enum). */
export type StationVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

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
  /** Provenance / verification state of the catalogue row. */
  data_source: StationDataSource;
  verification_status: StationVerificationStatus;
  verified_at: string | null;
  last_verified_at: string | null;
  source_id: string | null;
  fuel_types: FuelTypeBrief[];
  created_at: string;
  updated_at: string;
  /**
   * FORWARD-COMPATIBLE, OPTIONAL station facts.
   *
   * The detail screen has designed sections for amenities and opening hours
   * (spec §17). The current API does NOT return them, and this app never
   * invents station facts — so these stay optional and the sections render
   * only when a real payload carries them. Adding them here means the day the
   * backend serves the fields the UI lights up with no further frontend work.
   */
  services?: string[] | null;
  opening_hours?: string | null;
  is_open_now?: boolean | null;
}

/** Amenity codes the detail screen knows how to draw an icon tile for. */
export const STATION_SERVICE_LABELS: Record<string, string> = {
  restroom: "Restroom",
  air_pump: "Air Pump",
  card_payment: "Card Payment",
  shop: "Shop",
  atm: "ATM",
  car_wash: "Car Wash",
  mechanic: "Mechanic",
};

/**
 * User-facing labels for a station's verification status, keyed by the actual
 * database value (never hard-coded per-station). Written for Nigerian users.
 */
export const VERIFICATION_STATUS_LABELS: Record<
  StationVerificationStatus,
  string
> = {
  verified: "Verified",
  pending: "Awaiting Verification",
  rejected: "Rejected",
  unverified: "Unverified",
};

/**
 * Labels for data sources. Seed rows are the built-in demo catalogue and are
 * shown as "Demo Data" so users can distinguish them from independently
 * verified listings.
 */
export const DATA_SOURCE_LABELS: Record<StationDataSource, string> = {
  seed: "Demo Data",
  official: "Official",
  government: "Government Source",
  partner: "Partner Data",
  community: "Community Report",
  imported: "Imported",
  other: "Other Source",
};

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
