"use client";

/**
 * Browser geolocation hook — thin React wrapper around `lib/geolocator.ts`.
 *
 * The geolocation LOGIC (two-attempt one-shot, silent refresh, single
 * watch slot, 5 km accuracy protection, [GEO] diagnostics) lives in the
 * framework-free `lib/geolocator.ts` singleton so the whole app shares ONE
 * implementation and ONE watch slot — regardless of how many components
 * need location. This hook only adapts that singleton to React:
 *
 * - exposes `request` / `refresh` / `startWatch` / `stopWatch`,
 * - mirrors `loading` / `isWatching` as per-instance React state,
 * - stops the watch on unmount IF this instance started it.
 *
 * Lifecycle guarantees (now enforced app-wide by the singleton):
 * - Exactly one active watcher, ever — repeated `startWatch` calls, from
 *   ANY component, restart the same slot instead of stacking watchers.
 * - Exactly one in-flight acquisition — concurrent `request()` callers
 *   share the same promise instead of running parallel lifecycles.
 * - Errors are typed `GeoFailure`s; this hook NEVER decides what is fatal.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  acquirePosition,
  refreshPosition,
  startPositionWatch,
  stopPositionWatch,
} from "@/lib/geolocator";
import type { GeoFailure } from "@/lib/geo";
import type { LatLng } from "@/types/station";

interface UseGeolocation {
  /** One-shot acquisition. Rejects with a typed GeoFailure on error. */
  request: () => Promise<LatLng>;
  /**
   * Silent one-shot acquisition for the recenter flow. Resolves with the
   * fix, or `null` on failure — never throws, never clears anything.
   */
  refresh: () => Promise<LatLng | null>;
  /**
   * Start (or restart) the single continuous watcher. `onUpdate` receives
   * fresh coordinates; `onError` receives a typed failure (timeout,
   * unavailable, permission denied, …). Returns the watcher id or null.
   */
  startWatch: (
    onUpdate: (pos: LatLng) => void,
    onError?: (failure: GeoFailure) => void,
  ) => number | null;
  /** Stop and clear the watcher. */
  stopWatch: () => void;
  /** True while a one-shot acquisition is in flight. */
  loading: boolean;
  /** True while the continuous watcher is active. */
  isWatching: boolean;
}

export function useGeolocation(): UseGeolocation {
  const [loading, setLoading] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  // The watch id THIS instance started, so unmount only stops its own watch.
  const watchIdRef = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    stopPositionWatch();
    watchIdRef.current = null;
    setIsWatching(false);
  }, []);

  const request = useCallback((): Promise<LatLng> => {
    setLoading(true);
    return acquirePosition().finally(() => setLoading(false));
  }, []);

  const refresh = useCallback((): Promise<LatLng | null> => {
    return refreshPosition();
  }, []);

  const startWatch = useCallback(
    (onUpdate: (pos: LatLng) => void, onError?: (failure: GeoFailure) => void): number | null => {
      // The singleton guarantees one watch slot app-wide: repeated calls
      // restart the slot rather than stacking watchers.
      const id = startPositionWatch(onUpdate, onError);
      watchIdRef.current = id;
      setIsWatching(id != null);
      return id;
    },
    [],
  );

  // Clean up the watcher when the component unmounts (only if this
  // instance started it).
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        stopWatch();
      }
    };
  }, [stopWatch]);

  return { request, refresh, startWatch, stopWatch, loading, isWatching };
}
