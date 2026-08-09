/**
 * Unit tests for directions-URL generation and distance formatting.
 */

import { describe, expect, it } from "vitest";

import { directionsUrl, formatDistance, haversineDistance } from "@/lib/format";

describe("directionsUrl", () => {
  it("builds a Google Maps driving URL from user → station", () => {
    const url = directionsUrl(
      { latitude: 9.0567, longitude: 7.49698 },
      { latitude: 6.5244, longitude: 3.3792 },
    );
    expect(url.startsWith("https://www.google.com/maps/dir/")).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("api")).toBe("1");
    expect(parsed.searchParams.get("destination")).toBe("9.0567,7.49698");
    expect(parsed.searchParams.get("origin")).toBe("6.5244,3.3792");
    expect(parsed.searchParams.get("travelmode")).toBe("driving");
  });

  it("omits origin when the user location is unknown", () => {
    const url = directionsUrl({ latitude: 9.0567, longitude: 7.49698 }, null);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("origin")).toBeNull();
    expect(parsed.searchParams.get("destination")).toBe("9.0567,7.49698");
  });
});

describe("formatDistance", () => {
  it("formats metres and kilometres", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(4200)).toBe("4.2 km");
    expect(formatDistance(12000)).toBe("12 km");
  });

  it("handles missing values", () => {
    expect(formatDistance(undefined)).toBe("");
    expect(formatDistance(NaN)).toBe("");
  });
});

describe("haversineDistance", () => {
  it("computes ~111 km per degree of latitude", () => {
    const d = haversineDistance(
      { latitude: 9.0, longitude: 7.5 },
      { latitude: 10.0, longitude: 7.5 },
    );
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("returns zero for identical points", () => {
    expect(haversineDistance({ latitude: 9.0, longitude: 7.5 }, { latitude: 9.0, longitude: 7.5 })).toBe(0);
  });
});
