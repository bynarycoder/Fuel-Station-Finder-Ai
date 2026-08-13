/**
 * Geolocation domain logic — pure, framework-free, unit-testable.
 *
 * Centralises everything the location feature needs that does NOT touch
 * `navigator.geolocation` directly:
 *
 * - the `LocationStatus` state machine (fatal vs. transient errors)
 * - mapping browser `PositionError` codes to status + user-facing message
 * - geolocation option presets (low accuracy first; see README notes)
 * - movement-threshold helper (avoid nearby API spam on GPS jitter)
 * - dev-only diagnostics logging (never logs in production builds)
 *
 * The guiding rule: a TIMEOUT / POSITION_UNAVAILABLE while a valid position
 * exists is `temporarily_unavailable` — never a fatal `error`. Fatal states
 * (`error`, `unsupported`, and `permission_denied` without any position) are
 * only reachable when the app has no valid location at all.
 */

import { haversineDistance } from "@/lib/format";
import type { LatLng } from "@/types/station";

/**
 * Location lifecycle statuses. One machine, shared by the store, the filter
 * bar and (implicitly) every component that renders location state.
 *
 *  - idle                    — no request made yet (default)
 *  - requesting              — initial Near Me acquisition in flight
 *  - tracking                — we have a live position (watch active)
 *  - updating                — background refresh in flight while a position exists
 *  - temporarily_unavailable — timeout/unavailable AFTER a position existed
 *  - permission_denied       — browser blocked location access
 *  - unsupported             — browser has no geolocation API
 *  - error                   — fatal: no position AND acquisition failed
 */
export type LocationStatus =
  | "idle"
  | "requesting"
  | "tracking"
  | "updating"
  | "temporarily_unavailable"
  | "permission_denied"
  | "unsupported"
  | "error";

/** Browser PositionError codes (also used for our synthetic "unsupported"). */
export const GEO_CODE_PERMISSION_DENIED = 1;
export const GEO_CODE_POSITION_UNAVAILABLE = 2;
export const GEO_CODE_TIMEOUT = 3;
export const GEO_CODE_UNSUPPORTED = 0;

/**
 * How far the user must move (metres) before we treat a watchPosition update
 * as meaningful: updates the marker, recalculates distances, and refetches
 * nearby stations. Keeps GPS jitter (~5–30 m) from hammering the API.
 */
export const MOVEMENT_THRESHOLD_METERS = 75;

/**
 * Geolocation option presets.
 *
 * Attempt 1 (GEO_OPTIONS_DEFAULT) is *reasonable*: allow a recent cached /
 * network-assisted fix so a phone does not sit on a cold GPS lock until the
 * browser fires TIMEOUT. `maximumAge: 0` + `enableHighAccuracy` is what made
 * Near Me fail on mobile.
 *
 * Attempt 2 (GEO_OPTIONS_FALLBACK) is *less restrictive*: no GPS requirement,
 * longer timeout, older cache allowed. Used only after TIMEOUT /
 * POSITION_UNAVAILABLE. Permission-denied is never retried.
 *
 * We never invent coordinates. A failed acquisition leaves userLocation null
 * and does not query nearby.
 */
export const GEO_OPTIONS_DEFAULT: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
};

export const GEO_OPTIONS_FALLBACK: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 300_000,
};

/** Alias kept so existing imports of the first-attempt preset keep working. */
export const GEO_OPTIONS_HIGH_ACCURACY = GEO_OPTIONS_DEFAULT;

/** Watch: network/wifi is enough; a generous cache avoids a post-success timeout. */
export const GEO_OPTIONS_WATCH: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 25_000,
  maximumAge: 60_000,
};

/**
 * User-facing messages. No browser error codes, no "TIMEOUT" jargon.
 * These are the FATAL (no position) copies.
 */
export const GEO_MESSAGES: Record<number, string> = {
  [GEO_CODE_PERMISSION_DENIED]:
    "Location access is blocked. Please allow location access in your browser settings and try again.",
  [GEO_CODE_POSITION_UNAVAILABLE]:
    "Your device couldn't determine your location. Please try again or choose your location manually.",
  [GEO_CODE_TIMEOUT]:
    "We couldn't get your location in time. Please try again or choose your location manually.",
  [GEO_CODE_UNSUPPORTED]:
    "This browser can't share your location. Try a modern browser or search for a city instead.",
};

/** Copies used when a last-known position already exists (non-fatal banner). */
export const GEO_MESSAGES_WITH_POSITION: Record<number, string> = {
  [GEO_CODE_POSITION_UNAVAILABLE]:
    "Your current location is temporarily unavailable. Showing nearby stations from your last known location.",
  [GEO_CODE_TIMEOUT]:
    "Using your last known location. Trying to update...",
};

export interface GeoFailure {
  code: number;
  message: string;
}

/** Map a browser PositionError (or our synthetic code) to a failure object. */
export function mapGeolocationError(err: {
  code?: number;
  message?: string;
}): GeoFailure {
  const code = err?.code ?? GEO_CODE_UNSUPPORTED;
  const fallback = err?.message || "Could not get your location.";
  return {
    code,
    message: GEO_MESSAGES[code] ?? `Could not get your location: ${fallback}`,
  };
}

/** True when the failure code is PERMISSION_DENIED. */
export function isPermissionDeniedCode(code: number): boolean {
  return code === GEO_CODE_PERMISSION_DENIED;
}

/** True when the failure code is TIMEOUT or POSITION_UNAVAILABLE (transient). */
export function isTransientCode(code: number): boolean {
  return code === GEO_CODE_TIMEOUT || code === GEO_CODE_POSITION_UNAVAILABLE;
}

export interface LocationContext {
  status: LocationStatus;
  /** The last valid position (may be null before the first success). */
  position: LatLng | null;
}

export type LocationEvent =
  | { type: "request_start" }
  | { type: "refresh_start" }
  | { type: "success" }
  | { type: "watch_start" }
  | { type: "watch_stop" }
  | { type: "failure"; code: number };

export interface LocationState {
  status: LocationStatus;
  /** User-facing message for the current status (null when none needed). */
  message: string | null;
}

/**
 * Pure state machine for the location lifecycle.
 *
 * The one rule that fixes the production bug:
 *   failure + existing position  -> temporarily_unavailable (non-fatal)
 *   failure + no position        -> fatal (error / permission_denied / unsupported)
 */
export function applyLocationEvent(
  ctx: LocationContext,
  event: LocationEvent,
): LocationState {
  switch (event.type) {
    case "request_start":
      return { status: "requesting", message: "Requesting your location…" };

    case "refresh_start":
      // A background refresh while we already hold a position is "updating".
      return ctx.position
        ? { status: "updating", message: "Updating your position…" }
        : { status: "requesting", message: "Requesting your location…" };

    case "success":
      return { status: "tracking", message: null };

    case "watch_start":
      return { status: "tracking", message: null };

    case "watch_stop":
      // User turned tracking off. If we still know a position the app can
      // keep showing results; the UI derives "Start tracking" from isWatching.
      return { status: "idle", message: null };

    case "failure":
      return failureState(ctx.position !== null, event.code);
  }
}

/** Map a failure code to a state, given whether a valid position exists. */
export function failureState(hasPosition: boolean, code: number): LocationState {
  if (code === GEO_CODE_PERMISSION_DENIED) {
    return {
      status: "permission_denied",
      message: GEO_MESSAGES[GEO_CODE_PERMISSION_DENIED],
    };
  }
  if (code === GEO_CODE_UNSUPPORTED) {
    return {
      status: "unsupported",
      message: GEO_MESSAGES[GEO_CODE_UNSUPPORTED],
    };
  }
  // TIMEOUT / POSITION_UNAVAILABLE (or unknown codes).
  if (hasPosition) {
    return {
      status: "temporarily_unavailable",
      message:
        GEO_MESSAGES_WITH_POSITION[code] ??
        GEO_MESSAGES_WITH_POSITION[GEO_CODE_POSITION_UNAVAILABLE],
    };
  }
  return {
    status: "error",
    message:
      GEO_MESSAGES[code] ?? GEO_MESSAGES[GEO_CODE_POSITION_UNAVAILABLE],
  };
}

/**
 * Whether a fresh fix differs meaningfully from the last stored position.
 * Returns true when `next` is null (no reference point) so the first fix
 * always passes.
 */
export function hasMovedEnough(
  prev: LatLng | null,
  next: LatLng,
  thresholdMeters: number = MOVEMENT_THRESHOLD_METERS,
): boolean {
  if (!prev) return true;
  return haversineDistance(prev, next) >= thresholdMeters;
}

/**
 * Development-safe diagnostics.
 *
 * Logs geolocation lifecycle events tagged `[geo]` in development only.
 * In production builds `process.env.NODE_ENV` is "production", so nothing is
 * logged — no user coordinates or PII ever reach production logs from here.
 */
export function geoLog(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info("[geo]", ...args);
  }
}
