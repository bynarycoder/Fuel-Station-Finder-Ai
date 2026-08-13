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

/** Human-readable names for browser PositionError codes (diagnostics only). */
export const GEO_CODE_NAMES: Record<number, string> = {
  [GEO_CODE_PERMISSION_DENIED]: "PERMISSION_DENIED",
  [GEO_CODE_POSITION_UNAVAILABLE]: "POSITION_UNAVAILABLE",
  [GEO_CODE_TIMEOUT]: "TIMEOUT",
  [GEO_CODE_UNSUPPORTED]: "UNSUPPORTED",
};

/** Stable, greppable name for a geolocation error code. */
export function geoCodeName(code: number): string {
  return GEO_CODE_NAMES[code] ?? `UNKNOWN(code=${code})`;
}

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
 * logged — no user coordinates or PII ever reach production logs from here —
 * UNLESS the tester explicitly opted in with `?geo_debug=1` (or a `?geo=`
 * simulation override) in the URL. Those params are a deliberate on-device
 * debugging action (e.g. chrome://inspect on a physical phone); they require
 * the URL to be typed by hand and are never set by the app itself.
 */
export function geoDebugEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("geo_debug") || params.has("geo");
  } catch {
    return false;
  }
}

export function geoLog(...args: unknown[]): void {
  if (geoDebugEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[geo]", ...args);
  }
}

export interface SimulatedPosition {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in metres (default 20 m). */
  accuracy: number;
}

/**
 * Test-only GPS override, parsed from the page URL:
 *
 *   https://<app>/?geo=10.5207,7.4386          (accuracy defaults to 20 m)
 *   https://<app>/?geo=10.5207,7.4386,500      (coarse 500 m fix)
 *
 * Purpose: prove the FE → API → Supabase pipeline on a physical device
 * WITHOUT the phone's GPS hardware/browser (separates "GPS failed" from
 * "pipeline used the wrong coordinates"). Returns `null` unless the param
 * is explicitly present and valid, so normal production behavior is
 * completely unchanged. The active override is announced loudly via geoLog
 * and the simulated coordinates are shown in the UI like any real fix.
 *
 * Ranges are validated (|lat| ≤ 90, |lon| ≤ 180, accuracy > 0); an invalid
 * value is ignored rather than silently producing nonsense coordinates.
 */
export function getSimulatedPosition(): SimulatedPosition | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = new URLSearchParams(window.location.search).get("geo");
  } catch {
    return null;
  }
  if (!raw) return null;

  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [latitude, longitude, accuracy = 20] = parts;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy <= 0) {
    return null;
  }
  return { latitude, longitude, accuracy };
}
