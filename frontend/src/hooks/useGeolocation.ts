"use client";

/**
 * Browser geolocation hook — complete Near Me location experience.
 *
 * Provides:
 * - `request()` — one-shot getCurrentPosition (permission prompt once)
 * - `startWatch(onUpdate)` — continuous watchPosition with automatic cleanup
 * - `stopWatch()` — stop watching
 * - Comprehensive error mapping (permission denied / unavailable / timeout / unsupported)
 * - `isWatching` flag and `errorCode` for UI differentiation
 *
 * The hook never polls permission in a loop; callers decide when to request.
 * Watcher is cleaned up on unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { LatLng } from "@/types/station";

export type GeoErrorCode = 1 | 2 | 3 | 0; // 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT, 0=UNSUPPORTED/UNKNOWN

interface UseGeolocation {
  request: () => Promise<LatLng>;
  startWatch: (onUpdate: (pos: LatLng) => void) => number | null;
  stopWatch: () => void;
  loading: boolean;
  isWatching: boolean;
  error: string | null;
  errorCode: GeoErrorCode | null;
}

function mapGeolocationError(err: GeolocationPositionError): { message: string; code: GeoErrorCode } {
  if (err.code === 1) {
    return {
      code: 1,
      message:
        "Location permission denied. Enable location access in your browser settings to find stations near you, or browse all stations.",
    };
  }
  if (err.code === 2) {
    return {
      code: 2,
      message:
        "Your location could not be determined. Try moving to an open area, check that location services are enabled, and try again.",
    };
  }
  if (err.code === 3) {
    return {
      code: 3,
      message: "Location request timed out. Please try again in a moment.",
    };
  }
  return { code: 0, message: `Could not get your location: ${err.message}` };
}

export function useGeolocation(): UseGeolocation {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<GeoErrorCode | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const watchCallbackRef = useRef<((pos: LatLng) => void) | null>(null);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const request = useCallback((): Promise<LatLng> => {
    return new Promise<LatLng>((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        const message =
          "Geolocation is not supported by this browser. Try a modern browser or browse all stations.";
        setError(message);
        setErrorCode(0);
        reject(new Error(message));
        return;
      }

      setLoading(true);
      clearError();

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLoading(false);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (err: GeolocationPositionError) => {
          setLoading(false);
          const mapped = mapGeolocationError(err);
          setError(mapped.message);
          setErrorCode(mapped.code);
          reject(new Error(mapped.message));
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    });
  }, [clearError]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {
        // ignore
      }
    }
    watchIdRef.current = null;
    watchCallbackRef.current = null;
    setIsWatching(false);
  }, []);

  const startWatch = useCallback(
    (onUpdate: (pos: LatLng) => void): number | null => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        const message =
          "Geolocation is not supported by this browser. Live tracking is unavailable.";
        setError(message);
        setErrorCode(0);
        return null;
      }

      // Avoid duplicate watchers; restart if already watching with new callback.
      if (watchIdRef.current != null) {
        stopWatch();
      }

      clearError();
      watchCallbackRef.current = onUpdate;

      const id = navigator.geolocation.watchPosition(
        (position) => {
          // Clear any previous transient error on successful update.
          setError(null);
          setErrorCode(null);
          const loc: LatLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          watchCallbackRef.current?.(loc);
        },
        (err: GeolocationPositionError) => {
          const mapped = mapGeolocationError(err);
          // Permission denied while watching is fatal — stop the watcher to avoid spamming.
          if (mapped.code === 1) {
            stopWatch();
          }
          setError(mapped.message);
          setErrorCode(mapped.code);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );

      watchIdRef.current = id;
      setIsWatching(true);
      return id;
    },
    [clearError, stopWatch],
  );

  // Clean up watcher when the component unmounts.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { request, startWatch, stopWatch, loading, isWatching, error, errorCode };
}
