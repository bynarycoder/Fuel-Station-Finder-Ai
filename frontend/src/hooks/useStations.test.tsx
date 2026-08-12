/**
 * Query-layer tests for useStationsQuery (nearby mode) against a mocked API.
 *
 * Covers:
 *  - nearby API called with the correct existing endpoint params (test A)
 *  - NO refetch when the store receives identical coordinates (throttling)
 *  - radius / fuel-type changes refetch with new params (requirement 6)
 *  - items sorted nearest → farthest even if the API returns unsorted (test J)
 *  - every nearby item carries a distance (Haversine fallback, requirement 7)
 *  - browse mode uses the catalogue endpoint, not nearby
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStationsQuery, type StationItem } from "@/hooks/useStations";
import { fetchNearbyStations, fetchStations } from "@/services/api";
import { useMapStore } from "@/store/useMapStore";

vi.mock("@/services/api", () => ({
  fetchNearbyStations: vi.fn(),
  fetchStations: vi.fn(),
}));

const mockedNearby = vi.mocked(fetchNearbyStations);
const mockedStations = vi.mocked(fetchStations);

const JOS = { latitude: 9.0567, longitude: 7.49698 };

function makeStation(id: string, lat: number, lng: number): StationItem {
  return {
    id,
    name: `Station ${id}`,
    brand: null,
    address: null,
    city: null,
    state: null,
    phone: null,
    latitude: lat,
    longitude: lng,
    is_active: true,
    fuel_types: [],
    created_at: "",
    updated_at: "",
  };
}

function Probe() {
  const { items, isNearby } = useStationsQuery();
  return (
    <div data-testid="probe">
      {JSON.stringify({
        isNearby,
        items: items.map((i) => ({ id: i.id, d: i.distance_meters ?? null })),
      })}
    </div>
  );
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useMapStore.setState({
    mode: "browse",
    filters: { q: "", brand: "", city: "", fuelType: "" },
    userLocation: null,
    locationStatus: "idle",
    locationMessage: null,
    radiusMeters: 5000,
    selectedStationId: null,
  });
  mockedNearby.mockReset();
  mockedStations.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderProbe() {
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

function readProbe(): { isNearby: boolean; items: { id: string; d: number | null }[] } {
  return JSON.parse(screen.getByTestId("probe").textContent ?? "{}");
}

describe("nearby query wiring (test A)", () => {
  it("calls the existing nearby endpoint with latitude/longitude/radius when mode + location are set", async () => {
    mockedNearby.mockResolvedValue({
      items: [makeStation("a", JOS.latitude + 0.001, JOS.longitude)],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "nearby", userLocation: JOS });
    renderProbe();

    await waitFor(() => expect(readProbe().isNearby).toBe(true));
    expect(mockedNearby).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 9.0567,
        longitude: 7.49698,
        radius_meters: 5000,
        limit: 100,
      }),
    );
    expect(mockedStations).not.toHaveBeenCalled();
  });

  it("does NOT refetch when the store receives identical coordinates", async () => {
    mockedNearby.mockResolvedValue({
      items: [],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "nearby", userLocation: JOS });
    renderProbe();
    await waitFor(() => expect(mockedNearby).toHaveBeenCalledTimes(1));

    // Same coordinates (new object identity — as a watch callback would do).
    act(() => useMapStore.getState().setUserLocation({ ...JOS }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockedNearby).toHaveBeenCalledTimes(1);
  });

  it("refetches with the new radius when the radius changes", async () => {
    mockedNearby.mockResolvedValue({
      items: [],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "nearby", userLocation: JOS });
    renderProbe();
    await waitFor(() => expect(mockedNearby).toHaveBeenCalledTimes(1));

    act(() => useMapStore.getState().setRadiusMeters(10000));
    await waitFor(() =>
      expect(mockedNearby).toHaveBeenLastCalledWith(
        expect.objectContaining({ radius_meters: 10000 }),
      ),
    );
  });

  it("refetches with the fuel filter when it changes", async () => {
    mockedNearby.mockResolvedValue({
      items: [],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "nearby", userLocation: JOS });
    renderProbe();
    await waitFor(() => expect(mockedNearby).toHaveBeenCalledTimes(1));

    act(() => useMapStore.getState().setFilters({ fuelType: "PMS" }));
    await waitFor(() =>
      expect(mockedNearby).toHaveBeenLastCalledWith(
        expect.objectContaining({ fuel_type: "PMS" }),
      ),
    );
  });

  it("refetches with CNG fuel filter when CNG is selected", async () => {
    mockedNearby.mockResolvedValue({
      items: [],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "nearby", userLocation: JOS });
    renderProbe();
    await waitFor(() => expect(mockedNearby).toHaveBeenCalledTimes(1));

    act(() => useMapStore.getState().setFilters({ fuelType: "CNG" }));
    await waitFor(() =>
      expect(mockedNearby).toHaveBeenLastCalledWith(
        expect.objectContaining({ fuel_type: "CNG" }),
      ),
    );
  });

  it("browse mode uses the catalogue endpoint instead", async () => {
    mockedNearby.mockResolvedValue({
      items: [],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "browse", userLocation: null });
    renderProbe();

    await waitFor(() => expect(mockedStations).toHaveBeenCalled());
    expect(mockedNearby).not.toHaveBeenCalled();
    expect(readProbe().isNearby).toBe(false);
  });
});

describe("distance sorting & fallback (tests J + requirement 7)", () => {
  it("sorts nearest → farthest even when the API returns unsorted items", async () => {
    // API deliberately returns farthest first.
    mockedNearby.mockResolvedValue({
      items: [
        { ...makeStation("far", JOS.latitude + 0.05, JOS.longitude), distance_meters: 5500 },
        { ...makeStation("near", JOS.latitude + 0.001, JOS.longitude), distance_meters: 110 },
        { ...makeStation("mid", JOS.latitude + 0.02, JOS.longitude), distance_meters: 2200 },
      ],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "nearby", userLocation: JOS });
    renderProbe();

    await waitFor(() => {
      const probe = readProbe();
      expect(probe.items.map((i) => i.id)).toEqual(["near", "mid", "far"]);
    });
  });

  it("attaches a Haversine fallback distance when the API omits distance_meters", async () => {
    mockedNearby.mockResolvedValue({
      items: [makeStation("no-dist", JOS.latitude + 0.001, JOS.longitude)],
      latitude: JOS.latitude,
      longitude: JOS.longitude,
      radius_meters: 5000,
    } as unknown as Awaited<ReturnType<typeof fetchNearbyStations>>);
    mockedStations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });

    useMapStore.setState({ mode: "nearby", userLocation: JOS });
    renderProbe();

    await waitFor(() => {
      const probe = readProbe();
      expect(probe.items).toHaveLength(1);
      // ~111 m from the user, computed client-side.
      expect(probe.items[0].d).toBeGreaterThan(100);
      expect(probe.items[0].d).toBeLessThan(130);
    });
  });
});
