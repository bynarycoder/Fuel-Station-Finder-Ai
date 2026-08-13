"use client";

/**
 * Browser geolocation hook — thin wrapper around `navigator.geolocation`.
 *
 * Responsibilities (and ONLY these):
 * - `request()`  — one-shot `getCurrentPosition` (permission prompt once)
 * - `refresh()`  — silent one-shot refresh that never throws (recenter flow)
 * - `startWatch(onUpdate, onError)` — `watchPosition` with a SINGLE watcher
 * - `stopWatch()` — clear the watcher
 * - cleanup on unmount
 *
 * Everything else (status machine, error mapping, user-facing messages,
 * movement threshold) lives in `lib/geo.ts` and the Zustand store, so the
 * browser-facing surface stays small and testable.
 *
 * Lifecycle guarantees:
 * - Exactly one active watcher, ever. Repeated `startWatch` calls restart the
 *   same watcher slot instead of stacking watchers.
 * - The watcher is cleared on `stopWatch()` and on unmount.
 * - Errors are reported through typed `GeoFailure` objects; this hook NEVER
 *   decides what is fatal — callers do, using `lib/geo.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  GEO_CODE_PERMISSION_DENIED,
  GEO_OPTIONS_DEFAULT,
  GEO_OPTIONS_HIGH_ACCURACY,
  GEO_OPTIONS_WATCH,
  geoLog,
  isTransientCode,
  mapGeolocationError,
  type GeoFailure,
} from "@/lib/geo";
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

function toLatLng(position: GeolocationPosition): LatLng {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export function useGeolocation(): UseGeolocation {
  const [loading, setLoading] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const watchCallbackRef = useRef<((pos: LatLng) => void) | null>(null);
  const watchErrorRef = useRef<((failure: GeoFailure) => void) | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
        geoLog("watch cleared", { id: watchIdRef.current });
      } catch (err) {
        geoLog("watch clear failed", err);
      }
    }
    watchIdRef.current = null;
    watchCallbackRef.current = null;
    watchErrorRef.current = null;
    setIsWatching(false);
  }, []);

  const request = useCallback((): Promise<LatLng> => {
    return new Promise<LatLng>((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(mapGeolocationError({ code: 0 }));
        return;
      }

      setLoading(true);

      const succeed = (position: GeolocationPosition, via: string) => {
        setLoading(false);
        const loc = toLatLng(position);
        geoLog(`request: success (${via})`, {
          lat: loc.latitude.toFixed(4),
          lng: loc.longitude.toFixed(4),
          accuracy_m: Math.round(position.coords.accuracy),
        });
        resolve(loc);
      };

      const fail = (err: GeolocationPositionError) => {
        setLoading(false);
        const failure = mapGeolocationError(err);
        geoLog("request: failure", { code: failure.code });
        reject(failure);
      };

      // GPS first so a Kaduna phone is not silently placed in Abuja via IP.
      // Timeout / unavailable → one low-accuracy retry (laptops without GPS).
      geoLog("request: getCurrentPosition high-accuracy", GEO_OPTIONS_HIGH_ACCURACY);
      navigator.geolocation.getCurrentPosition(
        (position) => succeed(position, "high-accuracy"),
        (err: GeolocationPositionError) => {
          if (err.code === GEO_CODE_PERMISSION_DENIED || !isTransientCode(err.code)) {
            fail(err);
            return;
          }
          geoLog("request: high-accuracy missed, retrying low-accuracy", {
            code: err.code,
          });
          navigator.geolocation.getCurrentPosition(
            (position) => succeed(position, "low-accuracy-fallback"),
            fail,
            GEO_OPTIONS_DEFAULT,
          );
        },
        GEO_OPTIONS_HIGH_ACCURACY,
      );
    });
  }, []);

  const refresh = useCallback((): Promise<LatLng | null> => {
    return new Promise<LatLng | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        geoLog("refresh: unsupported");
        resolve(null);
        return;
      }

      geoLog("refresh: getCurrentPosition (silent)");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = toLatLng(position);
          geoLog("refresh: success", {
            lat: loc.latitude.toFixed(4),
            lng: loc.longitude.toFixed(4),
          });
          resolve(loc);
        },
        (err: GeolocationPositionError) => {
          const failure = mapGeolocationError(err);
          geoLog("refresh: failure", { code: failure.code });
          // Never fatal: the caller already has a last known position.
          resolve(null);
        },
        GEO_OPTIONS_DEFAULT,
      );
    });
  }, []);

  const startWatch = useCallback(
    (onUpdate: (pos: LatLng) => void, onError?: (failure: GeoFailure) => void): number | null => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        onError?.(mapGeolocationError({ code: 0 }));
        return null;
      }

      // Guarantee a single watcher: restart the slot rather than stacking.
      if (watchIdRef.current != null) {
        stopWatch();
      }

      watchCallbackRef.current = onUpdate;
      watchErrorRef.current = onError ?? null;

      geoLog("watch: starting watchPosition", {
        enableHighAccuracy: GEO_OPTIONS_WATCH.enableHighAccuracy,
        timeout: GEO_OPTIONS_WATCH.timeout,
        maximumAge: GEO_OPTIONS_WATCH.maximumAge,
      });

      const id = navigator.geolocation.watchPosition(
        (position) => {
          const loc = toLatLng(position);
          geoLog("watch: success", {
            lat: loc.latitude.toFixed(4),
            lng: loc.longitude.toFixed(4),
          });
          watchCallbackRef.current?.(loc);
        },
        (err: GeolocationPositionError) => {
          const failure = mapGeolocationError(err);
          geoLog("watch: failure", { code: failure.code });
          // The watcher stays active for transient failures (timeout /
          // unavailable) so the browser can retry; callers decide whether a
          // failure is fatal via lib/geo.
          watchErrorRef.current?.(failure);
        },
        GEO_OPTIONS_WATCH,
      );

      watchIdRef.current = id;
      setIsWatching(true);
      geoLog("watch: active", { id });
      return id;
    },
    [stopWatch],
  );

  // Clean up the watcher when the component unmounts.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        stopWatch();
      }
    };
  }, [stopWatch]);

  return { request, refresh, startWatch, stopWatch, loading, isWatching };
}
