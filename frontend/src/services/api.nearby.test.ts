/**
 * Contract tests for the nearby-station HTTP request.
 *
 * The backend requires `latitude` / `longitude` query params. Sending
 * `lat` / `lng` (or omitting them) is a 422 — not a silent Abuja default.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchNearbyStations } from "@/services/api";

const KADUNA = { latitude: 10.5207, longitude: 7.4386 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchNearbyStations query string", () => {
  it("sends latitude, longitude and radius_meters — not lat/lng", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        latitude: KADUNA.latitude,
        longitude: KADUNA.longitude,
        radius_meters: 5000,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchNearbyStations({
      latitude: KADUNA.latitude,
      longitude: KADUNA.longitude,
      radius_meters: 5000,
      limit: 20,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname.endsWith("/stations/nearby")).toBe(true);
    expect(url.searchParams.get("latitude")).toBe("10.5207");
    expect(url.searchParams.get("longitude")).toBe("7.4386");
    expect(url.searchParams.get("radius_meters")).toBe("5000");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("lng")).toBe(false);
    expect(url.searchParams.get("latitude")).not.toBe("9.0765");
    expect(url.searchParams.get("longitude")).not.toBe("7.3986");
  });
});
