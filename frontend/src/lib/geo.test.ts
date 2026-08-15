/**
 * Unit tests for the pure geolocation domain logic (lib/geo.ts).
 *
 * Covers the state machine that fixed the production bug:
 *   - a TIMEOUT / POSITION_UNAVAILABLE with an existing position is
 *     `temporarily_unavailable` (never fatal);
 *   - fatal states only occur when there is NO valid position at all;
 *   - PERMISSION_DENIED / UNSUPPORTED always map to their own statuses;
 *   - the movement threshold protects the nearby API from GPS jitter.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  GEO_CODE_PERMISSION_DENIED,
  GEO_CODE_POSITION_UNAVAILABLE,
  GEO_CODE_TIMEOUT,
  GEO_CODE_UNSUPPORTED,
  GEO_MESSAGES,
  GEO_OPTIONS_DEFAULT,
  GEO_OPTIONS_FALLBACK,
  MAX_ACCEPTABLE_ACCURACY_METERS,
  applyLocationEvent,
  failureState,
  geoCodeName,
  getSimulatedPosition,
  hasAcceptableAccuracy,
  hasMovedEnough,
  mapGeolocationError,
} from "@/lib/geo";

const NINE_JOS = { latitude: 9.0567, longitude: 7.49698 };

describe("mapGeolocationError", () => {
  it("maps PERMISSION_DENIED to the permission message", () => {
    const f = mapGeolocationError({ code: 1, message: "denied" });
    expect(f.code).toBe(GEO_CODE_PERMISSION_DENIED);
    expect(f.message).toContain("Location access is blocked");
    expect(f.message).not.toMatch(/PERMISSION_DENIED|code 1/i);
  });

  it("maps POSITION_UNAVAILABLE to the unavailable message", () => {
    const f = mapGeolocationError({ code: 2 });
    expect(f.code).toBe(GEO_CODE_POSITION_UNAVAILABLE);
    expect(f.message).toContain("couldn't determine your location");
    expect(f.message).toContain("choose your location manually");
    expect(f.message).not.toMatch(/POSITION_UNAVAILABLE|code 2/i);
  });

  it("maps TIMEOUT to the timeout message", () => {
    const f = mapGeolocationError({ code: 3 });
    expect(f.code).toBe(GEO_CODE_TIMEOUT);
    expect(f.message).toContain("couldn't get your location in time");
    expect(f.message).toContain("choose your location manually");
    expect(f.message).not.toMatch(/\bTIMEOUT\b|code 3/i);
  });

  it("maps unknown codes to UNSUPPORTED with a fallback message", () => {
    const f = mapGeolocationError({});
    expect(f.code).toBe(GEO_CODE_UNSUPPORTED);
  });
});

describe("failureState (the core timeout fix)", () => {
  it("TIMEOUT with a valid position → temporarily_unavailable, last-known message", () => {
    const s = failureState(true, GEO_CODE_TIMEOUT);
    expect(s.status).toBe("temporarily_unavailable");
    expect(s.message).toContain("Using your last known location");
  });

  it("TIMEOUT without any position → fatal error", () => {
    const s = failureState(false, GEO_CODE_TIMEOUT);
    expect(s.status).toBe("error");
    expect(s.message).toContain("couldn't get your location in time");
  });

  it("POSITION_UNAVAILABLE with a valid position → temporarily_unavailable", () => {
    const s = failureState(true, GEO_CODE_POSITION_UNAVAILABLE);
    expect(s.status).toBe("temporarily_unavailable");
  });

  it("POSITION_UNAVAILABLE without any position → fatal error", () => {
    const s = failureState(false, GEO_CODE_POSITION_UNAVAILABLE);
    expect(s.status).toBe("error");
  });

  it("PERMISSION_DENIED → permission_denied regardless of position", () => {
    expect(failureState(true, GEO_CODE_PERMISSION_DENIED).status).toBe("permission_denied");
    expect(failureState(false, GEO_CODE_PERMISSION_DENIED).status).toBe("permission_denied");
  });

  it("UNSUPPORTED → unsupported regardless of position", () => {
    expect(failureState(true, GEO_CODE_UNSUPPORTED).status).toBe("unsupported");
    expect(failureState(false, GEO_CODE_UNSUPPORTED).status).toBe("unsupported");
  });
});

describe("applyLocationEvent state machine", () => {
  it("request_start → requesting", () => {
    const s = applyLocationEvent({ status: "idle", position: null }, { type: "request_start" });
    expect(s.status).toBe("requesting");
  });

  it("success → tracking (with or without a prior position)", () => {
    expect(applyLocationEvent({ status: "requesting", position: null }, { type: "success" }).status).toBe("tracking");
    expect(applyLocationEvent({ status: "temporarily_unavailable", position: NINE_JOS }, { type: "success" }).status).toBe("tracking");
  });

  it("refresh_start with a position → updating; without → requesting", () => {
    expect(applyLocationEvent({ status: "tracking", position: NINE_JOS }, { type: "refresh_start" }).status).toBe("updating");
    expect(applyLocationEvent({ status: "idle", position: null }, { type: "refresh_start" }).status).toBe("requesting");
  });

  it("watch_stop → idle", () => {
    const s = applyLocationEvent({ status: "tracking", position: NINE_JOS }, { type: "watch_stop" });
    expect(s.status).toBe("idle");
  });

  it("recovers from temporarily_unavailable on the next watch success", () => {
    const afterTimeout = applyLocationEvent(
      { status: "tracking", position: NINE_JOS },
      { type: "failure", code: GEO_CODE_TIMEOUT },
    );
    expect(afterTimeout.status).toBe("temporarily_unavailable");
    const afterRecovery = applyLocationEvent(
      { status: afterTimeout.status, position: NINE_JOS },
      { type: "success" },
    );
    expect(afterRecovery.status).toBe("tracking");
    expect(afterRecovery.message).toBeNull();
  });
});

describe("geolocation option presets", () => {
  it("attempt 1 is reasonable — recent cache allowed so phones do not stall on GPS", () => {
    expect(GEO_OPTIONS_DEFAULT.enableHighAccuracy).toBe(true);
    expect(GEO_OPTIONS_DEFAULT.maximumAge).toBeGreaterThan(0);
    expect((GEO_OPTIONS_DEFAULT.timeout ?? 0)).toBeLessThanOrEqual(15_000);
  });

  it("attempt 2 is less restrictive — network/cached location allowed", () => {
    expect(GEO_OPTIONS_FALLBACK.enableHighAccuracy).toBe(false);
    expect((GEO_OPTIONS_FALLBACK.maximumAge ?? 0)).toBeGreaterThan(
      GEO_OPTIONS_DEFAULT.maximumAge ?? 0,
    );
  });

  it("user-facing copies never mention browser error codes", () => {
    for (const message of Object.values(GEO_MESSAGES)) {
      expect(message).not.toMatch(/PERMISSION_DENIED|POSITION_UNAVAILABLE|\bTIMEOUT\b|code \d/i);
    }
  });
});

describe("hasAcceptableAccuracy (coarse-fix guard)", () => {
  it("defines the threshold as 5,000 metres", () => {
    expect(MAX_ACCEPTABLE_ACCURACY_METERS).toBe(5_000);
  });

  it("rejects a 50 km city-level fix", () => {
    expect(hasAcceptableAccuracy(50_000)).toBe(false);
    expect(hasAcceptableAccuracy(5_001)).toBe(false);
  });

  it("accepts accuracy exactly at the 5,000 m boundary", () => {
    expect(hasAcceptableAccuracy(5_000)).toBe(true);
  });

  it("accepts normal GPS fixes and 0 (accuracy not reported)", () => {
    expect(hasAcceptableAccuracy(20)).toBe(true);
    expect(hasAcceptableAccuracy(0)).toBe(true);
  });

  it("rejects non-finite accuracy values", () => {
    expect(hasAcceptableAccuracy(Number.NaN)).toBe(false);
    expect(hasAcceptableAccuracy(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("hasMovedEnough (movement threshold)", () => {
  it("first fix always passes (no reference point)", () => {
    expect(hasMovedEnough(null, NINE_JOS)).toBe(true);
  });

  it("identical position → not moved", () => {
    expect(hasMovedEnough(NINE_JOS, { ...NINE_JOS })).toBe(false);
  });

  it("~33 m jitter → not moved (below 75 m threshold)", () => {
    const jitter = { latitude: NINE_JOS.latitude + 0.0003, longitude: NINE_JOS.longitude };
    expect(hasMovedEnough(NINE_JOS, jitter)).toBe(false);
  });

  it("~111 m movement → moved (above 75 m threshold)", () => {
    const moved = { latitude: NINE_JOS.latitude + 0.001, longitude: NINE_JOS.longitude };
    expect(hasMovedEnough(NINE_JOS, moved)).toBe(true);
  });

  it("honours a custom threshold", () => {
    const moved = { latitude: NINE_JOS.latitude + 0.001, longitude: NINE_JOS.longitude };
    expect(hasMovedEnough(NINE_JOS, moved, 200)).toBe(false);
    expect(hasMovedEnough(NINE_JOS, moved, 50)).toBe(true);
  });
});

describe("geoCodeName (error-code vocabulary)", () => {
  it("names the three browser codes + synthetic unsupported distinctly", () => {
    expect(geoCodeName(GEO_CODE_PERMISSION_DENIED)).toBe("PERMISSION_DENIED");
    expect(geoCodeName(GEO_CODE_POSITION_UNAVAILABLE)).toBe("POSITION_UNAVAILABLE");
    expect(geoCodeName(GEO_CODE_TIMEOUT)).toBe("TIMEOUT");
    expect(geoCodeName(GEO_CODE_UNSUPPORTED)).toBe("UNSUPPORTED");
    // TIMEOUT must never be reported as POSITION_UNAVAILABLE (and vice versa).
    expect(geoCodeName(GEO_CODE_TIMEOUT)).not.toBe(geoCodeName(GEO_CODE_POSITION_UNAVAILABLE));
  });
});

describe("getSimulatedPosition (?geo= test override)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("returns null when the param is absent (normal production behavior)", () => {
    window.history.replaceState(null, "", "/");
    expect(getSimulatedPosition()).toBeNull();
  });

  it("parses lat,lon with the default 20 m accuracy (Kaduna)", () => {
    window.history.replaceState(null, "", "/?geo=10.5207,7.4386");
    expect(getSimulatedPosition()).toEqual({
      latitude: 10.5207,
      longitude: 7.4386,
      accuracy: 20,
    });
  });

  it("parses an explicit accuracy as the third segment", () => {
    window.history.replaceState(null, "", "/?geo=9.082,7.472,500");
    expect(getSimulatedPosition()).toEqual({
      latitude: 9.082,
      longitude: 7.472,
      accuracy: 500,
    });
  });

  it("rejects out-of-range coordinates instead of producing nonsense", () => {
    window.history.replaceState(null, "", "/?geo=95,7.4386");
    expect(getSimulatedPosition()).toBeNull();
    window.history.replaceState(null, "", "/?geo=10.5,190");
    expect(getSimulatedPosition()).toBeNull();
    window.history.replaceState(null, "", "/?geo=10.5,7.4,-5");
    expect(getSimulatedPosition()).toBeNull();
  });

  it("rejects garbage input", () => {
    window.history.replaceState(null, "", "/?geo=abuja");
    expect(getSimulatedPosition()).toBeNull();
    window.history.replaceState(null, "", "/?geo=10.5");
    expect(getSimulatedPosition()).toBeNull();
  });
});
