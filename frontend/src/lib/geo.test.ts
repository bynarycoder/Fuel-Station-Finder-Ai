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

import { describe, expect, it } from "vitest";

import {
  GEO_CODE_PERMISSION_DENIED,
  GEO_CODE_POSITION_UNAVAILABLE,
  GEO_CODE_TIMEOUT,
  GEO_CODE_UNSUPPORTED,
  GEO_OPTIONS_DEFAULT,
  GEO_OPTIONS_HIGH_ACCURACY,
  applyLocationEvent,
  failureState,
  hasMovedEnough,
  mapGeolocationError,
} from "@/lib/geo";

const NINE_JOS = { latitude: 9.0567, longitude: 7.49698 };

describe("mapGeolocationError", () => {
  it("maps PERMISSION_DENIED to the permission message", () => {
    const f = mapGeolocationError({ code: 1, message: "denied" });
    expect(f.code).toBe(GEO_CODE_PERMISSION_DENIED);
    expect(f.message).toContain("Allow location access");
  });

  it("maps POSITION_UNAVAILABLE to the unavailable message", () => {
    const f = mapGeolocationError({ code: 2 });
    expect(f.code).toBe(GEO_CODE_POSITION_UNAVAILABLE);
    expect(f.message).toContain("temporarily unavailable");
  });

  it("maps TIMEOUT to the timeout message", () => {
    const f = mapGeolocationError({ code: 3 });
    expect(f.code).toBe(GEO_CODE_TIMEOUT);
    expect(f.message).toContain("timed out");
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
    expect(s.message).toContain("timed out");
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
  it("asks for a fresh high-accuracy fix on the first Near Me request", () => {
    expect(GEO_OPTIONS_HIGH_ACCURACY.enableHighAccuracy).toBe(true);
    expect(GEO_OPTIONS_HIGH_ACCURACY.maximumAge).toBe(0);
  });

  it("keeps a low-accuracy fallback for devices without GPS", () => {
    expect(GEO_OPTIONS_DEFAULT.enableHighAccuracy).toBe(false);
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
