/**
 * Tests for the Leaflet camera-movement safety layer.
 *
 * These reproduce the production failure mechanism directly: a hidden map has
 * a 0×0 container, and Leaflet's `flyTo` divides by zero in `unproject` and
 * throws `Invalid LatLng object: (NaN, NaN)`. The safety helpers must refuse
 * to move such a map, refuse invalid coordinates, and never let a Leaflet
 * throw escape to React.
 */

import { describe, expect, it, vi } from "vitest";

import {
  isMapReady,
  isValidLatLng,
  safeFitBounds,
  safeFlyTo,
  type SafeMapLike,
} from "@/lib/leafletSafety";

/** A fake map whose behaviour we fully control (no Leaflet import needed). */
function makeMap(overrides: Partial<SafeMapLike> = {}): SafeMapLike & {
  flyTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  getSize: ReturnType<typeof vi.fn>;
} {
  return {
    getSize: vi.fn(() => ({ x: 800, y: 600 })),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    ...overrides,
  } as SafeMapLike & {
    flyTo: ReturnType<typeof vi.fn>;
    fitBounds: ReturnType<typeof vi.fn>;
    getSize: ReturnType<typeof vi.fn>;
  };
}

describe("isValidLatLng", () => {
  it("accepts a real coordinate", () => {
    expect(isValidLatLng(9.0567, 7.49698)).toBe(true);
    expect(isValidLatLng(-90, 180)).toBe(true);
    expect(isValidLatLng(90, -180)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(true);
  });

  it.each([
    [NaN, 0],
    [0, NaN],
    [Infinity, 0],
    [-Infinity, 0],
    [0, Infinity],
    [0, -Infinity],
  ])("rejects non-finite (%s, %s)", (lat, lng) => {
    expect(isValidLatLng(lat, lng)).toBe(false);
  });

  it.each([
    [90.0001, 0],
    [-90.0001, 0],
    [0, 180.0001],
    [0, -180.0001],
  ])("rejects out-of-range (%s, %s)", (lat, lng) => {
    expect(isValidLatLng(lat, lng)).toBe(false);
  });
});

describe("isMapReady", () => {
  it("is true for a map with a positive measured size", () => {
    expect(isMapReady(makeMap())).toBe(true);
  });

  it("is false for a 0×0 container (the hidden-map failure mode)", () => {
    expect(isMapReady(makeMap({ getSize: vi.fn(() => ({ x: 0, y: 0 })) }))).toBe(false);
    expect(isMapReady(makeMap({ getSize: vi.fn(() => ({ x: 0, y: 600 })) }))).toBe(false);
    expect(isMapReady(makeMap({ getSize: vi.fn(() => ({ x: 800, y: 0 })) }))).toBe(false);
  });

  it("is false for a null / destroyed map", () => {
    expect(isMapReady(null)).toBe(false);
    expect(isMapReady(undefined)).toBe(false);
  });

  it("is false when getSize() throws (destroyed/broken map)", () => {
    expect(
      isMapReady(
        makeMap({
          getSize: vi.fn(() => {
            throw new Error("Map container is not initialized");
          }),
        }),
      ),
    ).toBe(false);
  });

  it("is false for a non-finite size", () => {
    expect(
      isMapReady(makeMap({ getSize: vi.fn(() => ({ x: NaN, y: NaN })) })),
    ).toBe(false);
  });
});

describe("safeFlyTo — reproduces the (NaN, NaN) production crash", () => {
  it("rejects a flyTo on a 0×0 map, returns false, and does NOT call Leaflet", () => {
    const map = makeMap({ getSize: vi.fn(() => ({ x: 0, y: 0 })) });
    const result = safeFlyTo(map, 9.0567, 7.49698, 13);
    expect(result).toBe(false);
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it("rejects a flyTo when the map has been destroyed (getSize throws)", () => {
    const map = makeMap({
      getSize: vi.fn(() => {
        throw new Error("map removed");
      }),
    });
    const result = safeFlyTo(map, 9.0567, 7.49698, 13);
    expect(result).toBe(false);
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it.each([
    [NaN, 0],
    [0, NaN],
    [Infinity, 0],
    [-Infinity, 0],
    [0, Infinity],
    [0, -Infinity],
    [90.5, 0],
    [-90.5, 0],
    [0, 180.5],
    [0, -180.5],
  ])("never lets invalid coordinate (%s, %s) reach Leaflet", (lat, lng) => {
    const map = makeMap();
    const result = safeFlyTo(map, lat, lng, 13);
    expect(result).toBe(false);
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it("calls flyTo and returns true for a valid coordinate on a ready map", () => {
    const map = makeMap();
    const result = safeFlyTo(map, 9.0567, 7.49698, 13, { duration: 0.75 });
    expect(result).toBe(true);
    expect(map.flyTo).toHaveBeenCalledWith([9.0567, 7.49698], 13, {
      duration: 0.75,
    });
  });

  it("swallows a Leaflet throw and returns false instead of propagating", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const map = makeMap({
      flyTo: vi.fn(() => {
        throw new Error("Invalid LatLng object: (NaN, NaN)");
      }),
    });
    expect(() => safeFlyTo(map, 9.0567, 7.49698, 13)).not.toThrow();
    expect(safeFlyTo(map, 9.0567, 7.49698, 13)).toBe(false);
    errorSpy.mockRestore();
  });

  it("returns false for a null map", () => {
    expect(safeFlyTo(null, 9.0567, 7.49698, 13)).toBe(false);
  });
});

describe("safeFitBounds", () => {
  it("calls fitBounds and returns true when all points and the map are valid", () => {
    const map = makeMap();
    const result = safeFitBounds(map, [
      [9.0567, 7.49698],
      [9.1, 7.5],
    ]);
    expect(result).toBe(true);
    expect(map.fitBounds).toHaveBeenCalled();
  });

  it("rejects when ANY point is invalid", () => {
    const map = makeMap();
    const result = safeFitBounds(
      map,
      [
        [9.0567, 7.49698],
        [NaN, 7.5],
      ],
    );
    expect(result).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("rejects an empty point set", () => {
    const map = makeMap();
    expect(safeFitBounds(map, [])).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("rejects a 0×0 map", () => {
    const map = makeMap({ getSize: vi.fn(() => ({ x: 0, y: 0 })) });
    expect(safeFitBounds(map, [[9.0567, 7.49698]])).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("swallows a Leaflet throw and returns false", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const map = makeMap({
      fitBounds: vi.fn(() => {
        throw new Error("Invalid LatLngBounds");
      }),
    });
    expect(() => safeFitBounds(map, [[9.0567, 7.49698]])).not.toThrow();
    expect(safeFitBounds(map, [[9.0567, 7.49698]])).toBe(false);
    errorSpy.mockRestore();
  });
});
