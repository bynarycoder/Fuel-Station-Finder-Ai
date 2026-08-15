"use client";

/**
 * Framework-free browser geolocation client — THE single implementation.
 *
 * Everything that touches `navigator.geolocation` lives here, exactly once,
 * so the whole app (the Zustand location lifecycle in `useMapStore`, and the
 * `useGeolocation` React wrapper) shares:
 *
 * - the same accuracy protection (`MAX_ACCEPTABLE_ACCURACY_METERS` = 5 km —
 *   a coarse city-level fix is NEVER accepted),
 * - the same `[GEO]` diagnostics for every accepted/rejected fix,
 * - ONE watch slot, app-wide: `startPositionWatch` always restarts the same
 *   slot instead of stacking watchers,
 * - ONE in-flight acquisition: concurrent callers share the same promise
 *   instead of running parallel `getCurrentPosition` lifecycles.
 *
 * This module NEVER decides what is fatal — callers do, via `lib/geo.ts`.
 * It NEVER stores coordinates — that is the store's job. It rejects with
 * typed `GeoFailure` objects and resolves only with accepted fixes.
 */

import {
  GEO_CODE_PERMISSION_DENIED,
  GEO_CODE_POSITION_UNAVAILABLE,
  GEO_OPTIONS_DEFAULT,
  GEO_OPTIONS_FALLBACK,
  GEO_OPTIONS_WATCH,
  MAX_ACCEPTABLE_ACCURACY_METERS,
  geoCodeName,
  geoLog,
  getSimulatedPosition,
  hasAcceptableAccuracy,
  isTransientCode,
  mapGeolocationError,
  type GeoFailure,
} from "@/lib/geo";
import type { LatLng } from "@/types/station";

interface GeoCallbacks {
  onUpdate: (pos: LatLng) => void;
  onError?: (failure: GeoFailure) => void;
}

function toLatLng(position: GeolocationPosition): LatLng {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/** True while a one-shot acquisition is in flight (any caller). */
let acquisitionInFlight = false;
/** Shared in-flight acquisition promise (dedupe — one lifecycle at a time). */
let inFlightRequest: Promise<LatLng> | null = null;

/** The single app-wide watch slot. */
let watchId: number | null = null;
let watchCallbacks: GeoCallbacks = { onUpdate: () => undefined };

export function isAcquisitionInFlight(): boolean {
  return acquisitionInFlight;
}

export function isWatchActive(): boolean {
  return watchId != null;
}

/**
 * One-shot acquisition (two-attempt flow). Rejects with a typed `GeoFailure`.
 * Never invents coordinates: a failed pair of attempts, or fixes coarser
 * than 5 km, reject as POSITION_UNAVAILABLE/TIMEOUT.
 */
function acquirePositionOnce(): Promise<LatLng> {
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

    const succeed = (position: GeolocationPosition, via: string) => {
      const loc = toLatLng(position);
      // [GEO SUCCESS] — the exact fix that will drive the nearby query.
      geoLog(`[GEO SUCCESS] attempt=${via} fix accepted`, {
        latitude: loc.latitude.toFixed(4),
        longitude: loc.longitude.toFixed(4),
        accuracy_m: Math.round(position.coords.accuracy),
      });
      resolve(loc);
    };

    const fail = (err: GeolocationPositionError) => {
      const failure = mapGeolocationError(err);
      geoLog("[GEO] request failed", {
        code: failure.code,
        name: geoCodeName(failure.code),
        message: err?.message ?? null,
      });
      reject(failure);
    };

    // A fix the browser DID return, but with hopelessly coarse (city-level)
    // accuracy. It is NOT a usable "Near Me" location — and it must never be
    // replaced with invented coordinates: it maps to the transient
    // POSITION_UNAVAILABLE vocabulary, exactly like a browser timeout.
    const rejectCoarseFix = (attempt: number, position: GeolocationPosition) => {
      geoLog(`[GEO] attempt ${attempt}: fix rejected — accuracy too coarse`, {
        latitude: position.coords.latitude.toFixed(4),
        longitude: position.coords.longitude.toFixed(4),
        accuracy_m: Math.round(position.coords.accuracy),
        max_acceptable_m: MAX_ACCEPTABLE_ACCURACY_METERS,
      });
      reject(mapGeolocationError({ code: GEO_CODE_POSITION_UNAVAILABLE }));
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

    // Attempt 2 (timeout / unavailable / too-coarse fix only): looser
    // network/cached fix. Never invent coordinates — a failed pair of
    // attempts (or a pair of coarse fixes) rejects.
    const attempt2 = () => {
      started(2, GEO_OPTIONS_FALLBACK);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!hasAcceptableAccuracy(position.coords.accuracy)) {
            rejectCoarseFix(2, position);
            return;
          }
          succeed(position, "2-fallback");
        },
        (err2: GeolocationPositionError) => {
          attemptError(2, err2);
          fail(err2);
        },
        GEO_OPTIONS_FALLBACK,
      );
    };

    // Attempt 1: reasonable (recent cache allowed so phones don't stall on GPS).
    started(1, GEO_OPTIONS_DEFAULT);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!hasAcceptableAccuracy(position.coords.accuracy)) {
          geoLog("[GEO] attempt 1: fix rejected — accuracy too coarse", {
            latitude: position.coords.latitude.toFixed(4),
            longitude: position.coords.longitude.toFixed(4),
            accuracy_m: Math.round(position.coords.accuracy),
            max_acceptable_m: MAX_ACCEPTABLE_ACCURACY_METERS,
          });
          // Treat as transient/unavailable: retry at lower requirements
          // instead of resolving a city-level centroid as "Near Me".
          attempt2();
          return;
        }
        succeed(position, "1");
      },
      (err: GeolocationPositionError) => {
        attemptError(1, err);
        if (err.code === GEO_CODE_PERMISSION_DENIED || !isTransientCode(err.code)) {
          fail(err);
          return;
        }
        attempt2();
      },
      GEO_OPTIONS_DEFAULT,
    );
  });
}

/**
 * One-shot acquisition, deduplicated: while one acquisition is in flight
 * every caller shares the same promise — a second component clicking
 * "Share my location" / "Near me" CANNOT start a parallel lifecycle.
 */
export function acquirePosition(): Promise<LatLng> {
  if (inFlightRequest) {
    geoLog("[GEO] acquisition already in flight — sharing the pending fix");
    return inFlightRequest;
  }
  acquisitionInFlight = true;
  inFlightRequest = acquirePositionOnce()
    .then((loc) => loc)
    .finally(() => {
      acquisitionInFlight = false;
      inFlightRequest = null;
    });
  return inFlightRequest;
}

/**
 * Silent one-shot refresh for the recenter flow. Resolves with the fix, or
 * `null` on failure — never throws, never clears anything.
 */
export function refreshPosition(): Promise<LatLng | null> {
  return new Promise<LatLng | null>((resolve) => {
    // Test-only override (?geo=lat,lon[,acc]) — same as acquirePosition().
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
        // A coarse fix must never overwrite the last known position — the
        // recenter already happened with it, so resolve null like any
        // other silent failure (never throw, never invent coordinates).
        if (!hasAcceptableAccuracy(position.coords.accuracy)) {
          geoLog("refresh: fix rejected — accuracy too coarse", {
            latitude: position.coords.latitude.toFixed(4),
            longitude: position.coords.longitude.toFixed(4),
            accuracy_m: Math.round(position.coords.accuracy),
            max_acceptable_m: MAX_ACCEPTABLE_ACCURACY_METERS,
          });
          resolve(null);
          return;
        }
        const loc = toLatLng(position);
        geoLog("refresh: success — fix accepted", {
          lat: loc.latitude.toFixed(4),
          lng: loc.longitude.toFixed(4),
          accuracy_m: Math.round(position.coords.accuracy),
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
}

/**
 * Start (or restart) the single continuous watcher — app-wide. Repeated
 * calls restart the same slot instead of stacking watchers. Returns the
 * watcher id, or null when skipped (simulation mode / unsupported).
 *
 * A coarse fix (e.g. a 50 km network fallback) NEVER reaches `onUpdate` —
 * it is logged as rejected and the watcher stays alive for a better fix.
 */
export function startPositionWatch(
  onUpdate: (pos: LatLng) => void,
  onError?: (failure: GeoFailure) => void,
): number | null {
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
  if (watchId != null) {
    stopPositionWatch();
  }

  watchCallbacks = { onUpdate, onError };

  geoLog("watch: starting watchPosition", {
    enableHighAccuracy: GEO_OPTIONS_WATCH.enableHighAccuracy,
    timeout: GEO_OPTIONS_WATCH.timeout,
    maximumAge: GEO_OPTIONS_WATCH.maximumAge,
  });

  const id = navigator.geolocation.watchPosition(
    (position) => {
      // A coarse fix (e.g. a 50 km network fallback) must NEVER overwrite
      // a good stored location: skip the update and keep the watcher
      // alive so the browser can deliver a better fix next time.
      if (!hasAcceptableAccuracy(position.coords.accuracy)) {
        geoLog("watch: fix rejected — accuracy too coarse (keeping last position)", {
          latitude: position.coords.latitude.toFixed(4),
          longitude: position.coords.longitude.toFixed(4),
          accuracy_m: Math.round(position.coords.accuracy),
          max_acceptable_m: MAX_ACCEPTABLE_ACCURACY_METERS,
        });
        return;
      }
      const loc = toLatLng(position);
      geoLog("watch: success — fix accepted", {
        lat: loc.latitude.toFixed(4),
        lng: loc.longitude.toFixed(4),
        accuracy_m: Math.round(position.coords.accuracy),
      });
      watchCallbacks.onUpdate(loc);
    },
    (err: GeolocationPositionError) => {
      const failure = mapGeolocationError(err);
      geoLog("watch: failure", { code: failure.code });
      // The watcher stays active for transient failures (timeout /
      // unavailable) so the browser can retry; callers decide whether a
      // failure is fatal via lib/geo.
      watchCallbacks.onError?.(failure);
    },
    GEO_OPTIONS_WATCH,
  );

  watchId = id;
  geoLog("watch: active", { id });
  return id;
}

/** Stop and clear the single watcher. Idempotent. */
export function stopPositionWatch(): void {
  if (watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      navigator.geolocation.clearWatch(watchId);
      geoLog("watch cleared", { id: watchId });
    } catch (err) {
      geoLog("watch clear failed", err);
    }
  }
  watchId = null;
  watchCallbacks = { onUpdate: () => undefined };
}
