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
 *
 * THE SINGLE LOCATION OWNER:
 * Every geolocation acquisition/refresh/watch in the app flows through the
 * actions below (`requestLocation`, `recenterLocation`, `stopLocationWatch`),
 * which drive the shared state machine via `applyLocationEvent` and the
 * framework-free `lib/geolocator.ts` singleton. Components (StationFilters,
 * the Fuel Intelligence panel, …) MUST NOT run their own
 * `navigator.geolocation` lifecycle or write `userLocation` with a fresh
 * fix directly — that is what previously desynchronised `userLocation` from
 * `mode` / `locationStatus` / `isWatching` and produced duplicate,
 * conflicting error surfaces.
 */

import { create } from "zustand";

import {
  acquirePosition,
  isWatchActive,
  refreshPosition,
  startPositionWatch,
  stopPositionWatch,
} from "@/lib/geolocator";
import {
  applyLocationEvent,
  geoLog,
  hasMovedEnough,
  isPermissionDeniedCode,
  type GeoFailure,
  type LocationStatus,
} from "@/lib/geo";
import type { LatLng } from "@/types/station";

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
  /** True while the single continuous watcher is active (app-wide). */
  isWatching: boolean;
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

  /**
   * THE one-shot location acquisition ("Near me" / "Share my location").
   *
   * Runs the full lifecycle through the state machine:
   *   request_start → accepted fix → store it, enter nearby mode, start the
   *   single watcher; failure → state machine decides fatal vs.
   *   temporarily_unavailable based on whether a position already exists.
   *
   * Resolves with the accepted fix, or `null` on failure (the reason is in
   * `locationMessage`). Never throws; never invents coordinates.
   */
  requestLocation: () => Promise<LatLng | null>;
  /**
   * Recenter on the last known position immediately, then silently try to
   * freshen the fix. Never makes the user wait for GPS; a failed refresh
   * keeps the last known position untouched.
   */
  recenterLocation: () => void;
  /** Stop the continuous watcher (raw stop — no status transition). */
  stopLocationWatch: () => void;
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

/**
 * The single in-flight location acquisition, app-wide. While one is running,
 * every `requestLocation()` caller (filter bar, Fuel Intelligence panel, a
 * future surface) shares the SAME lifecycle promise — so the watch wiring
 * and status transitions below run exactly once per acquisition.
 */
let inFlightLocationRequest: Promise<LatLng | null> | null = null;

export const useMapStore = create<MapState>((set, get) => {
  /** Apply a lifecycle event against the CURRENT store state and persist it. */
  const emit = (event: Parameters<typeof applyLocationEvent>[1], positionOverride?: LatLng | null) => {
    const state = applyLocationEvent(
      {
        status: get().locationStatus,
        position: positionOverride !== undefined ? positionOverride : get().userLocation,
      },
      event,
    );
    set({ locationStatus: state.status, locationMessage: state.message });
  };

  /** Watcher update: apply the movement threshold, never churn on jitter. */
  const handleWatchUpdate = (loc: LatLng) => {
    const prev = get().userLocation;
    const moved = hasMovedEnough(prev, loc);
    if (!moved) {
      // GPS jitter / no meaningful movement — keep the stored position and
      // the nearby results as-is; just restore a healthy tracking status.
      geoLog("watch: update within threshold — keeping position");
      emit({ type: "success" }, prev);
      return;
    }
    geoLog("watch: meaningful movement", {
      from: prev && { lat: prev.latitude.toFixed(4), lng: prev.longitude.toFixed(4) },
      to: { lat: loc.latitude.toFixed(4), lng: loc.longitude.toFixed(4) },
    });
    // Updating userLocation (the last known position) changes the nearby
    // query key → distances & closest station recalculate, nearby API refetches.
    get().setUserLocation(loc);
    emit({ type: "success" }, loc);
  };

  /**
   * Watcher failure: permission denied stops tracking (never spam the
   * prompt); transient failures keep the watcher alive. Either way the
   * state machine decides fatal vs. temporarily_unavailable from whether a
   * valid position exists — an existing position is NEVER erased.
   */
  const handleWatchError = (failure: GeoFailure) => {
    geoLog("watch: error event", {
      code: failure.code,
      hasPosition: get().userLocation !== null,
    });
    if (isPermissionDeniedCode(failure.code)) {
      stopPositionWatch();
      set({ isWatching: false });
    }
    emit({ type: "failure", code: failure.code });
  };

  return {
    mode: "browse",
    filters: DEFAULT_FILTERS,
    userLocation: null,
    locationStatus: "idle",
    locationMessage: null,
    isWatching: false,
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

    requestLocation: (): Promise<LatLng | null> => {
      // Exactly one acquisition lifecycle at a time — concurrent callers
      // share it (never a second prompt, never a second watch wiring).
      if (inFlightLocationRequest) {
        return inFlightLocationRequest;
      }

      const lifecycle = (async (): Promise<LatLng | null> => {
        emit({ type: "request_start" });
        try {
          const loc = await acquirePosition();
          geoLog("near me: fix accepted — storing & starting single watcher", {
            lat: loc.latitude.toFixed(4),
            lng: loc.longitude.toFixed(4),
          });
          get().setUserLocation(loc);
          set({ mode: "nearby", selectedStationId: null });
          emit({ type: "success" }, loc);
          // Exactly one watcher, app-wide (the geolocator restarts its single
          // slot if a watch was somehow already running).
          startPositionWatch(handleWatchUpdate, handleWatchError);
          set({ isWatching: isWatchActive() });
          return loc;
        } catch (failure) {
          const code =
            failure && typeof failure === "object" && "code" in failure
              ? Number((failure as GeoFailure).code)
              : 2; // POSITION_UNAVAILABLE vocabulary for unexpected rejections.
          geoLog("near me: acquisition failed", { code });
          // If a valid position is already known (e.g. re-requesting after a
          // transient glitch) a failed fresh acquisition is NOT fatal.
          emit({ type: "failure", code });
          return null;
        }
      })().finally(() => {
        inFlightLocationRequest = null;
      });

      inFlightLocationRequest = lifecycle;
      return lifecycle;
    },

    recenterLocation: () => {
      const { userLocation, mode } = get();
      // 1) Center on the last known position IMMEDIATELY — no waiting for GPS.
      if (userLocation) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("recenter-on-me"));
        }
        if (mode !== "nearby") {
          set({ mode: "nearby", selectedStationId: null });
        }
      }
      // 2) Freshen the fix in the background; update only on meaningful movement.
      emit({ type: "refresh_start" });
      void refreshPosition().then((loc) => {
        if (!loc) {
          // Optional refresh failed — the recenter already happened with the
          // last known position; stay in the previous state.
          geoLog("recenter: refresh failed, keeping last known position");
          if (get().userLocation) {
            emit({ type: "success" });
          }
          return;
        }
        if (hasMovedEnough(get().userLocation, loc)) {
          get().setUserLocation(loc);
        }
        emit({ type: "success" }, loc);
        // Explicit refresh trigger for the nearby list (requirement: refresh
        // on explicit user recenter).
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("nearby-refresh-requested"));
        }
      });
    },

    stopLocationWatch: () => {
      stopPositionWatch();
      set({ isWatching: false });
    },
  };
});
