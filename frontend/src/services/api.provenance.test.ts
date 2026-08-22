/**
 * API-to-frontend provenance contract tests.
 *
 * The browser receives snake_case station fields directly from FastAPI. The
 * client must preserve the backend's actual source and verification values;
 * it must not infer "Demo Data" or "Verified" from a station name/source id.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchNearbyStations, fetchStations } from "@/services/api";
import type { Station } from "@/types/station";

const importedStation: Station = {
  id: "7232656385",
  name: "A. A. Rano filling Station",
  brand: null,
  address: null,
  city: "Kaduna",
  state: "Kaduna",
  phone: null,
  latitude: 10.5207,
  longitude: 7.4386,
  is_active: true,
  data_source: "imported",
  verification_status: "unverified",
  verified_at: null,
  last_verified_at: null,
  source_id: "node/7232656385",
  fuel_types: [],
  created_at: "2026-08-15T00:00:00Z",
  updated_at: "2026-08-15T00:00:00Z",
};

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("station provenance API contract", () => {
  it("preserves imported + unverified fields from the station list response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [importedStation],
          total: 1,
          page: 1,
          page_size: 20,
        }),
      ),
    );

    const result = await fetchStations({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      data_source: "imported",
      verification_status: "unverified",
      source_id: "node/7232656385",
    });
  });

  it("preserves provenance for the nearby-station response too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [{ ...importedStation, distance_meters: 125 }],
          latitude: 10.5207,
          longitude: 7.4386,
          radius_meters: 5000,
        }),
      ),
    );

    const result = await fetchNearbyStations({
      latitude: 10.5207,
      longitude: 7.4386,
    });

    expect(result.items[0]).toMatchObject({
      data_source: "imported",
      verification_status: "unverified",
      source_id: "node/7232656385",
      distance_meters: 125,
    });
  });
});
