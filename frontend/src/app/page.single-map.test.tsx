/**
 * REGRESSION TEST — exactly ONE Leaflet map must be mounted.
 *
 * The production crash (`Invalid LatLng object: (NaN, NaN)` from
 * `flyTo -> unproject -> pointToLatLng`) was caused by <StationMap> being
 * rendered TWICE in `page.tsx` — once for the mobile layout and once for the
 * desktop layout — separated only by `lg:hidden` / `hidden lg:block` CSS.
 * CSS `display:none` does NOT unmount React, so both Leaflet maps stayed
 * mounted, and the hidden one had a 0×0 container whose camera moves divided
 * by zero.
 *
 * These tests replace StationMap with a mount-counting mock and prove that,
 * at BOTH mobile and desktop viewports, and through Near Me / selection /
 * data updates, exactly one map instance is ever mounted.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderPage from "@/app/page";
import type { StationItem } from "@/hooks/useStations";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";

/** Mount/unmount counters shared with the hoisted StationMap mock. */
const mapCounts = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  get mounted() {
    return this.mounts - this.unmounts;
  },
}));

// A named, mount-counting StationMap mock. `data-testid` lets tests trigger the
// same `onSelect` the real map would call when a station is tapped.
vi.mock("@/components/map/StationMap", () => {
  const React = require("react") as typeof import("react");
  function StationMapMock(props: {
    onSelect?: (id: string) => void;
    items?: Array<{ id: string }>;
  }) {
    React.useEffect(() => {
      mapCounts.mounts += 1;
      return () => {
        mapCounts.unmounts += 1;
      };
    }, []);
    return React.createElement("div", {
      "data-testid": "station-map-mock",
      onClick: () => props.onSelect?.(props.items?.[0]?.id ?? ""),
    });
  }
  return { default: StationMapMock };
});

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    fetchAllStations: vi.fn(),
    fetchNearbyStations: vi.fn(),
    fetchFavorites: vi.fn(),
    fetchCurrentUser: vi.fn(),
  };
});

const mockedStations = vi.mocked(api.fetchAllStations);
const mockedNearby = vi.mocked(api.fetchNearbyStations);
const mockedFavorites = vi.mocked(api.fetchFavorites);

const ACCURATE_FIX = { latitude: 6.5244, longitude: 3.3792 };

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
    data_source: "seed",
    verification_status: "unverified",
    verified_at: null,
    last_verified_at: null,
    source_id: null,
    fuel_types: [],
    created_at: "",
    updated_at: "",
  };
}

const STATION = makeStation("st-1", 6.5244, 3.3792);

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function resetStore() {
  useMapStore.setState({
    mode: "browse",
    filters: { q: "", brand: "", city: "", fuelType: "" },
    userLocation: null,
    locationStatus: "idle",
    locationMessage: null,
    isWatching: false,
    radiusMeters: 5000,
    selectedStationId: null,
    favoritesOnly: false,
  });
}

let client: QueryClient;
let geo: GeoMock;

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <FinderPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  resetStore();
  geo = installGeoMock();
  mapCounts.mounts = 0;
  mapCounts.unmounts = 0;

  mockedStations.mockResolvedValue({
    items: [STATION],
    total: 1,
    page: 1,
    page_size: 100,
  });
  mockedNearby.mockResolvedValue({
    items: [{ ...STATION, distance_meters: 120 }],
    latitude: ACCURATE_FIX.latitude,
    longitude: ACCURATE_FIX.longitude,
    radius_meters: 5000,
  });
  mockedFavorites.mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  useMapStore.getState().stopLocationWatch();
  removeGeoMock();
  vi.restoreAllMocks();
});

describe("single Leaflet map regression", () => {
  it("mounts exactly one map at ~390px (mobile) viewport", async () => {
    stubMatchMedia(false); // (min-width: 1024px) does NOT match → mobile
    renderPage();

    await screen.findByTestId("station-map-mock");
    await waitFor(() => expect(mapCounts.mounted).toBe(1));
    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapCounts.mounts).toBe(1);
  });

  it("mounts exactly one map at ~1440px (desktop) viewport", async () => {
    stubMatchMedia(true); // (min-width: 1024px) matches → desktop
    renderPage();

    await screen.findByTestId("station-map-mock");
    await waitFor(() => expect(mapCounts.mounted).toBe(1));
    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapCounts.mounts).toBe(1);
  });

  it("triggering 'Near me' does not create a second map", async () => {
    stubMatchMedia(false);
    renderPage();
    await screen.findByTestId("station-map-mock");
    expect(mapCounts.mounts).toBe(1);

    fireEvent.click(screen.getAllByRole("button", { name: /near me/i })[0]);
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));

    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapCounts.mounts).toBe(1);
  });

  it("selecting a station does not create a second map", async () => {
    stubMatchMedia(false);
    renderPage();
    await screen.findByTestId("station-map-mock");
    await waitFor(() => expect(mockedStations).toHaveBeenCalled());
    expect(mapCounts.mounts).toBe(1);

    // Same path the real map uses: tapping a marker calls onSelect(id).
    fireEvent.click(screen.getByTestId("station-map-mock"));
    await waitFor(() =>
      expect(useMapStore.getState().selectedStationId).toBe("st-1"),
    );

    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapCounts.mounts).toBe(1);
  });

  it("data updates / re-renders do not remount a second map", async () => {
    stubMatchMedia(false);
    const { rerender } = renderPage();
    await screen.findByTestId("station-map-mock");
    expect(mapCounts.mounts).toBe(1);

    // Force a store-driven re-render (a location update, same map position).
    act(() => {
      useMapStore.getState().setUserLocation(ACCURATE_FIX);
    });
    rerender(
      <QueryClientProvider client={client}>
        <FinderPage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mapCounts.mounted).toBe(1));

    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapCounts.mounts).toBe(1);
  });

  it("the map is not duplicated when CSS switches mobile/desktop chrome", async () => {
    stubMatchMedia(false);
    const { rerender } = renderPage();
    await screen.findByTestId("station-map-mock");
    expect(mapCounts.mounts).toBe(1);

    // Flip the breakpoint; layout chrome changes, the map must not remount.
    stubMatchMedia(true);
    rerender(
      <QueryClientProvider client={client}>
        <FinderPage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mapCounts.mounted).toBe(1));

    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapCounts.mounts).toBe(1);
  });
});
