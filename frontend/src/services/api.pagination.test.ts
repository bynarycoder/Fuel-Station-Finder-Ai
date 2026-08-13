/**
 * Pagination contract tests for the station catalogue client.
 *
 * The backend caps `page_size` at 100 and the browse view must show the whole
 * catalogue (176 seeded stations span two pages), so `fetchAllStations` walks
 * every page and merges them. These tests stub the global `fetch` and prove
 * the client requests *all* pages — a regression guard against the bug where
 * the frontend silently showed only page 1 (100 of 176).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAllStations, fetchStations } from "@/services/api";
import type { Station } from "@/types/station";

function makeStation(id: string): Station {
  return {
    id,
    name: `Station ${id}`,
    brand: null,
    address: null,
    city: null,
    state: null,
    phone: null,
    latitude: 6.5,
    longitude: 3.3,
    is_active: true,
    fuel_types: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function pageResponse(items: Station[], total: number, page: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ items, total, page, page_size: 100 }),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchAllStations pagination", () => {
  it("requests page 2 and merges when total exceeds one page", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeStation(`p1-${i}`));
    const page2 = Array.from({ length: 76 }, (_, i) => makeStation(`p2-${i}`));
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) => {
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        return Promise.resolve(
          page === 2
            ? pageResponse(page2, 176, 2)
            : pageResponse(page1, 176, 1),
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAllStations();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => new URL(c[0] as string));
    expect(urls[0].searchParams.get("page")).toBe("1");
    expect(urls[1].searchParams.get("page")).toBe("2");
    expect(result.total).toBe(176);
    expect(result.items).toHaveLength(176);
    expect(new Set(result.items.map((s) => s.id)).size).toBe(176);
  });

  it("stops after one page when total fits in a single page", async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeStation(`k-${i}`));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(pageResponse(items, 12, 1));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAllStations({ city: "Kaduna" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(12);
    expect(result.total).toBe(12);
  });

  it("forwards catalogue filters to every page request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(pageResponse([], 0, 1));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAllStations({ is_active: true, city: "Kano" });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("is_active")).toBe("true");
    expect(url.searchParams.get("city")).toBe("Kano");
    expect(url.searchParams.get("page_size")).toBe("100");
  });

  it("single-page fetchStations still honours an explicit page param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(pageResponse([], 0, 2));
    vi.stubGlobal("fetch", fetchMock);

    await fetchStations({ page: 2, page_size: 100 });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("100");
  });
});
