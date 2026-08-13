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
  GEO_OPTIONS_FALLBACK,
  GEO_OPTIONS_WATCH,
  geoCodeName,
  geoLog,
  getSimulatedPosition,
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
      // Test-only override (?geo=lat,lon[,acc]): prove the FE → API → DB
      // pipeline on-device without involving the phone's GPS at all.
      const simulated = getSimulatedPosition();
      if (simulated) {
        geoLog("[GEO] SIMULATED FIX (?geo= URL override — NOT real GPS)", {
          latitude: simulated.latitude.toFixed(4),
          longitude: simulated.longitude.toFixed(4),
          accuracy_m: simulated.accuracy,
        });
        resolve({ latitude: simulated.latitude, longitude: simulated.longitude });
        return;
      }

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(mapGeolocationError({ code: 0 }));
        return;
      }

      setLoading(true);

      const succeed = (position: GeolocationPosition, via: string) => {
        setLoading(false);
        const loc = toLatLng(position);
        // [GEO SUCCESS] — the exact fix that will drive the nearby query.
        geoLog(`[GEO SUCCESS] attempt=${via}`, {
          latitude: loc.latitude.toFixed(4),
          longitude: loc.longitude.toFixed(4),
          accuracy_m: Math.round(position.coords.accuracy),
        });
        resolve(loc);
      };

      const fail = (err: GeolocationPositionError) => {
        setLoading(false);
        const failure = mapGeolocationError(err);
        geoLog("[GEO] request failed", {
          code: failure.code,
          name: geoCodeName(failure.code),
          message: err?.message ?? null,
        });
        reject(failure);
      };

      // Structured attempt diagnostics: attempt number + raw browser code +
      // effective options, so a TIMEOUT (3) is never confused with
      // POSITION_UNAVAILABLE (2) or PERMISSION_DENIED (1).
      const started = (attempt: number, options: PositionOptions) =>
        geoLog(`[GEO] attempt ${attempt}: started`, {
          enableHighAccuracy: options.enableHighAccuracy,
          timeout: options.timeout,
          maximumAge: options.maximumAge,
        });

      const attemptError = (attempt: number, err: GeolocationPositionError) =>
        geoLog(`[GEO] attempt ${attempt}: error`, {
          code: err?.code ?? -1,
          name: geoCodeName(err?.code ?? -1),
          message: err?.message ?? null,
        });

      // Attempt 1: reasonable (recent cache allowed so phones don't stall on GPS).
      // Attempt 2 (timeout / unavailable only): looser network/cached fix.
      // Never invent coordinates — a failed pair of attempts rejects.
      started(1, GEO_OPTIONS_DEFAULT);
      navigator.geolocation.getCurrentPosition(
        (position) => succeed(position, "1"),
        (err: GeolocationPositionError) => {
          attemptError(1, err);
          if (err.code === GEO_CODE_PERMISSION_DENIED || !isTransientCode(err.code)) {
            fail(err);
            return;
          }
          started(2, GEO_OPTIONS_FALLBACK);
          navigator.geolocation.getCurrentPosition(
            (position) => succeed(position, "2-fallback"),
            (err2: GeolocationPositionError) => {
              attemptError(2, err2);
              fail(err2);
            },
            GEO_OPTIONS_FALLBACK,
          );
        },
        GEO_OPTIONS_DEFAULT,
      );
    });
  }, []);

  const refresh = useCallback((): Promise<LatLng | null> => {
    return new Promise<LatLng | null>((resolve) => {
      // Test-only override (?geo=lat,lon[,acc]) — same as request().
      const simulated = getSimulatedPosition();
      if (simulated) {
        geoLog("refresh: SIMULATED fix (?geo= override)", {
          latitude: simulated.latitude.toFixed(4),
          longitude: simulated.longitude.toFixed(4),
        });
        resolve({ latitude: simulated.latitude, longitude: simulated.longitude });
        return;
      }
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
      // Simulation mode: never start a real watcher — a real fix would
      // overwrite the simulated test position mid-test.
      if (getSimulatedPosition()) {
        geoLog("watch: skipped — SIMULATED fix active (?geo= override)");
        return null;
      }
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
