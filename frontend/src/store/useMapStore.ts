/**
 * Global map UI state (Zustand).
 *
 * Holds the search mode (browse vs. near-me), the active catalogue filters,
 * the user's geolocation, the nearby search radius and the currently selected
 * station. Components subscribe to slices of this store; React Query reads the
 * same values to decide which endpoint to hit.
 *
 * Location lifecycle:
 * - `userLocation` is the **last known position**. Once set it is NEVER
 *   cleared by a transient geolocation failure (timeout / unavailable) —
 *   only replaced by a newer fix or reset when the user leaves the app.
 * - `locationStatus` / `locationMessage` describe the live state machine
 *   (see `lib/geo.ts`): fatal states are only ever entered when no valid
 *   position exists at all.
 */

import { create } from "zustand";

import type { LocationStatus } from "@/lib/geo";

export type SearchMode = "browse" | "nearby";

export interface StationFilters {
  q: string;
  brand: string;
  city: string;
  fuelType: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

interface MapState {
  mode: SearchMode;
  filters: StationFilters;
  /** Last known user position — never cleared by transient errors. */
  userLocation: UserLocation | null;
  /** Location lifecycle status (idle/requesting/tracking/…). */
  locationStatus: LocationStatus;
  /** User-facing message for the current location status. */
  locationMessage: string | null;
  /** Nearby search radius, in metres. */
  radiusMeters: number;
  selectedStationId: string | null;
  /** When true, the station list/map show only the user's favorites. */
  favoritesOnly: boolean;

  setMode: (mode: SearchMode) => void;
  setFilters: (patch: Partial<StationFilters>) => void;
  resetFilters: () => void;
  setUserLocation: (location: UserLocation | null) => void;
  setLocationStatus: (status: LocationStatus, message?: string | null) => void;
  setRadiusMeters: (radius: number) => void;
  setSelectedStationId: (id: string | null) => void;
  setFavoritesOnly: (favoritesOnly: boolean) => void;
}

const DEFAULT_FILTERS: StationFilters = {
  q: "",
  brand: "",
  city: "",
  fuelType: "",
};

export const DEFAULT_RADIUS_METERS = 5000;
export const RADIUS_OPTIONS = [2000, 5000, 10000, 25000];

function sameLocation(a: UserLocation, b: UserLocation): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export const useMapStore = create<MapState>((set) => ({
  mode: "browse",
  filters: DEFAULT_FILTERS,
  userLocation: null,
  locationStatus: "idle",
  locationMessage: null,
  radiusMeters: DEFAULT_RADIUS_METERS,
  selectedStationId: null,
  favoritesOnly: false,

  setMode: (mode) => set({ mode }),
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setUserLocation: (userLocation) =>
    set((state) => {
      // Skip no-op updates (identical coordinates) so the nearby query key
      // doesn't churn on repeated fixes of the same position.
      if (
        userLocation !== null &&
        state.userLocation !== null &&
        sameLocation(state.userLocation, userLocation)
      ) {
        return state;
      }
      return { userLocation };
    }),
  setLocationStatus: (locationStatus, locationMessage = null) =>
    set({ locationStatus, locationMessage }),
  setRadiusMeters: (radiusMeters) => set({ radiusMeters }),
  setSelectedStationId: (selectedStationId) => set({ selectedStationId }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
}));
