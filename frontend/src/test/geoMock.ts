/**
 * Test helper: a controllable `navigator.geolocation` mock.
 *
 * Lets tests drive the browser geolocation lifecycle deterministically:
 * trigger success/timeout/unavailable/denied callbacks for both the one-shot
 * `getCurrentPosition` and the continuous `watchPosition`, and assert how many
 * watchers were created / cleared.
 */

import { vi } from "vitest";

export interface GeoMock {
  /** The installed navigator.geolocation object. */
  geolocation: Geolocation;
  /** Simulate a one-shot `getCurrentPosition` success (first registered callback). */
  getCurrentSuccess: (lat?: number, lng?: number, accuracy?: number) => void;
  /** Simulate a one-shot `getCurrentPosition` error (first registered callback). */
  getCurrentError: (code: number) => void;
  /** Simulate a `watchPosition` success. */
  watchSuccess: (lat?: number, lng?: number, accuracy?: number) => void;
  /** Simulate a `watchPosition` error. */
  watchError: (code: number) => void;
  /** Call counts for instrumentation. */
  calls: {
    getCurrentPosition: number;
    watchPosition: number;
    clearWatch: number;
  };
  /** The currently active watch id (as tracked by the mock). */
  activeWatchId: number | null;
}

interface GeoCallback {
  success: PositionCallback | null;
  error: PositionErrorCallback | null;
}

function makePosition(lat: number, lng: number, accuracy = 20): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

function makeError(code: number): GeolocationPositionError {
  return { code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: `err ${code}` } as GeolocationPositionError;
}

export function installGeoMock(): GeoMock {
  const calls = { getCurrentPosition: 0, watchPosition: 0, clearWatch: 0 };
  let oneShot: GeoCallback = { success: null, error: null };
  let watch: GeoCallback = { success: null, error: null };
  let nextWatchId = 1;
  let activeWatchId: number | null = null;

  const geolocation = {
    getCurrentPosition: vi.fn(
      (success: PositionCallback, error?: PositionErrorCallback | null) => {
        calls.getCurrentPosition += 1;
        oneShot = { success, error: error ?? null };
      },
    ),
    watchPosition: vi.fn(
      (success: PositionCallback, error?: PositionErrorCallback | null) => {
        calls.watchPosition += 1;
        watch = { success, error: error ?? null };
        activeWatchId = nextWatchId;
        return nextWatchId++;
      },
    ),
    clearWatch: vi.fn((id: number) => {
      calls.clearWatch += 1;
      if (activeWatchId === id) activeWatchId = null;
      watch = { success: null, error: null };
    }),
  } as unknown as Geolocation;

  Object.defineProperty(navigator, "geolocation", {
    value: geolocation,
    configurable: true,
    writable: true,
  });

  return {
    geolocation,
    getCurrentSuccess: (lat = 9.0567, lng = 7.49698, accuracy = 20) =>
      oneShot.success?.(makePosition(lat, lng, accuracy)),
    getCurrentError: (code: number) => oneShot.error?.(makeError(code)),
    watchSuccess: (lat = 9.0567, lng = 7.49698, accuracy = 20) =>
      watch.success?.(makePosition(lat, lng, accuracy)),
    watchError: (code: number) => watch.error?.(makeError(code)),
    calls,
    get activeWatchId() {
      return activeWatchId;
    },
  };
}

export function removeGeoMock(): void {
  Object.defineProperty(navigator, "geolocation", {
    value: undefined,
    configurable: true,
  });
}
