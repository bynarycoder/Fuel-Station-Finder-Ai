/**
 * Unit tests for directions-URL generation and distance formatting.
 *
 * Phase 5 contract for Get Directions:
 * - station A's link opens station A (destination = station coordinates)
 * - latitude/longitude are never reversed (destination is "lat,lon")
 * - no undefined coordinates are ever sent (returns null instead)
 * - the URL is correctly generated and safely encoded
 */

import { describe, expect, it } from "vitest";

import { directionsUrl, formatDistance, haversineDistance } from "@/lib/format";

describe("directionsUrl", () => {
  it("builds a Google Maps driving URL from user → station", () => {
    const url = directionsUrl(
      { latitude: 9.0567, longitude: 7.49698 },
      { latitude: 6.5244, longitude: 3.3792 },
    );
    expect(url).not.toBeNull();
    expect(url!.startsWith("https://www.google.com/maps/dir/")).toBe(true);
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("api")).toBe("1");
    expect(parsed.searchParams.get("destination")).toBe("9.0567,7.49698");
    expect(parsed.searchParams.get("origin")).toBe("6.5244,3.3792");
    expect(parsed.searchParams.get("travelmode")).toBe("driving");
  });

  it("station A always opens station A (coordinates not swapped)", () => {
    // Kaduna station — lat 10.5207, lon 7.4386.
    const url = directionsUrl(
      { latitude: 10.5207, longitude: 7.4386 },
      null,
    );
    const parsed = new URL(url!);
    // The destination MUST be "lat,lon" — never "lon,lat".
    expect(parsed.searchParams.get("destination")).toBe("10.5207,7.4386");
    expect(parsed.searchParams.get("destination")).not.toBe("7.4386,10.5207");
  });

  it("omits origin when the user location is unknown", () => {
    const url = directionsUrl({ latitude: 9.0567, longitude: 7.49698 }, null);
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBeNull();
    expect(parsed.searchParams.get("destination")).toBe("9.0567,7.49698");
  });

  it("uses exact coordinates even when the station name is odd", () => {
    // The URL must never fall back to a name-only destination.
    const url = directionsUrl(
      { latitude: 6.5244, longitude: 3.3792 },
      null,
    );
    expect(url!.includes("station")).toBe(false);
    // Coordinates are present (URLSearchParams encodes the comma).
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("destination")).toBe("6.5244,3.3792");
    expect(url!.includes("%2C")).toBe(true);
  });

  it("returns null for undefined/NaN coordinates — no broken URL", () => {
    expect(directionsUrl({ latitude: undefined as never, longitude: 7.4 }, null)).toBeNull();
    expect(directionsUrl({ latitude: NaN, longitude: 7.4 }, null)).toBeNull();
    expect(directionsUrl({ latitude: 9.0, longitude: NaN }, null)).toBeNull();
    // @ts-expect-error — a station object with no coordinates at all.
    expect(directionsUrl(undefined, null)).toBeNull();
  });

  it("returns null for out-of-range coordinates (reversed lat/lon guard)", () => {
    // A swapped pair would put latitude=91+ (invalid) — reject instead.
    expect(
      directionsUrl({ latitude: 7.4, longitude: 10.52 }, null),
    ).not.toBeNull(); // both in-range: valid lat/lon as given
    expect(directionsUrl({ latitude: 91.0, longitude: 7.4 }, null)).toBeNull();
    expect(directionsUrl({ latitude: 9.0, longitude: 181.0 }, null)).toBeNull();
  });

  it("encodes parameters safely", () => {
    // URLSearchParams percent-encodes — the URL never contains raw spaces or
    // special characters that could break navigation.
    const url = directionsUrl({ latitude: 9.0567, longitude: 7.49698 }, null);
    expect(url).not.toMatch(/[\s"<>]/);
    expect(new URL(url!).searchParams.get("api")).toBe("1");
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
