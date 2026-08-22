/**
 * Contract tests for the geocoding API client (location picker search).
 *
 * The browser talks ONLY to our backend proxy (`/api/v1/geocode`) — never to
 * Nominatim directly — so there are no third-party keys in the frontend and
 * the provider's raw errors are mapped to friendly messages.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, reverseGeocode, searchLocations } from "@/services/api";

const KADUNA_PLACE = {
  latitude: 10.5264296,
  longitude: 7.4387398,
  display_name: "Kaduna, Kaduna State, Nigeria",
  name: "Kaduna",
  city: "Kaduna",
  state: "Kaduna State",
  country: "Nigeria",
  type: "city",
};

function stubFetchOnce(response: {
  ok: boolean;
  status: number;
  body: unknown;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searchLocations", () => {
  it("calls the backend proxy /geocode/search with the query — never a third-party host", async () => {
    const fetchMock = stubFetchOnce({
      ok: true,
      status: 200,
      body: { query: "Kaduna", results: [KADUNA_PLACE] },
    });

    const response = await searchLocations("Kaduna");

    expect(response.results).toHaveLength(1);
    expect(response.results[0].display_name).toBe("Kaduna, Kaduna State, Nigeria");
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname.endsWith("/geocode/search")).toBe(true);
    expect(url.searchParams.get("q")).toBe("Kaduna");
    // The provider is only ever reached through our backend origin.
    expect(url.hostname).not.toBe("nominatim.openstreetmap.org");
  });

  it("maps a provider rate limit (429) to a friendly message", async () => {
    stubFetchOnce({ ok: false, status: 429, body: {} });

    const error = await searchLocations("Kaduna").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).message).toMatch(/busy/i);
    expect((error as ApiError).message).not.toMatch(/\b429\b|rate limit/i);
  });

  it("maps a provider outage (5xx) to a friendly message", async () => {
    stubFetchOnce({ ok: false, status: 502, body: {} });

    const error = await searchLocations("Kaduna").catch((e) => e);

    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toMatch(/unavailable/i);
  });
});

describe("reverseGeocode", () => {
  it("returns the place at a coordinate pair", async () => {
    stubFetchOnce({ ok: true, status: 200, body: KADUNA_PLACE });

    const place = await reverseGeocode(10.5264296, 7.4387398);

    expect(place?.display_name).toBe("Kaduna, Kaduna State, Nigeria");
  });

  it("returns null (never throws) when the provider has no record there", async () => {
    stubFetchOnce({ ok: false, status: 404, body: {} });

    const place = await reverseGeocode(0, 0);

    expect(place).toBeNull();
  });

  it("degrades gracefully on provider outage — keeps the previous label", async () => {
    stubFetchOnce({ ok: false, status: 502, body: {} });

    const place = await reverseGeocode(10.5264296, 7.4387398);

    expect(place).toBeNull();
  });
});
