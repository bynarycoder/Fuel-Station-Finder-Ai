/**
 * Global map UI state (Zustand).
 *
 * Holds the search mode (browse vs. near-me), the active catalogue filters,
 * the user's geolocation, the nearby search radius and the currently selected
 * station. Components subscribe to slices of this store; React Query reads the
 * same values to decide which endpoint to hit.
 */

import { create } from "zustand";

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
  userLocation: UserLocation | null;
  /** Nearby search radius, in metres. */
  radiusMeters: number;
  selectedStationId: string | null;

  setMode: (mode: SearchMode) => void;
  setFilters: (patch: Partial<StationFilters>) => void;
  resetFilters: () => void;
  setUserLocation: (location: UserLocation | null) => void;
  setRadiusMeters: (radius: number) => void;
  setSelectedStationId: (id: string | null) => void;
}

const DEFAULT_FILTERS: StationFilters = {
  q: "",
  brand: "",
  city: "",
  fuelType: "",
};

export const DEFAULT_RADIUS_METERS = 5000;
export const RADIUS_OPTIONS = [2000, 5000, 10000, 25000];

export const useMapStore = create<MapState>((set) => ({
  mode: "browse",
  filters: DEFAULT_FILTERS,
  userLocation: null,
  radiusMeters: DEFAULT_RADIUS_METERS,
  selectedStationId: null,

  setMode: (mode) => set({ mode }),
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setUserLocation: (userLocation) => set({ userLocation }),
  setRadiusMeters: (radiusMeters) => set({ radiusMeters }),
  setSelectedStationId: (selectedStationId) => set({ selectedStationId }),
}));
