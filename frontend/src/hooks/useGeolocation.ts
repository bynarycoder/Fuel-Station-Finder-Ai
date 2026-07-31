"use client";

/**
 * Browser geolocation hook. Returns a `request()` promise that resolves with
 * the user's coordinates (or rejects on denial/unsupported).
 */

import { useCallback, useState } from "react";

import type { LatLng } from "@/types/station";

interface UseGeolocation {
  request: () => Promise<LatLng>;
  loading: boolean;
  error: string | null;
}

export function useGeolocation(): UseGeolocation {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback((): Promise<LatLng> => {
    return new Promise<LatLng>((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        const message = "Geolocation is not supported by this browser.";
        setError(message);
        reject(new Error(message));
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLoading(false);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (err) => {
          setLoading(false);
          const message =
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. Enable it to find stations near you."
              : `Could not get your location: ${err.message}`;
          setError(message);
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 },
      );
    });
  }, []);

  return { request, loading, error };
}
