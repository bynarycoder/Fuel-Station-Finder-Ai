/**
 * REGRESSION TEST — responsive behaviour must never resurrect the map crash.
 *
 * `page.single-map.test.tsx` proves one map is mounted for a *mobile-ish* and
 * a *desktop-ish* `matchMedia` stub. This suite is stricter in the dimension
 * the original bug lived in: it drives REAL viewport widths (390 / 768 / 1024
 * / 1440) through a harness that keeps `innerWidth` and `matchMedia` in sync,
 * and asserts the invariants that must survive a redesign:
 *
 *  1. exactly ONE Leaflet map instance exists at every supported width;
 *  2. resizing across the `lg` breakpoint does NOT remount/duplicate the map
 *     (a remount is what produced a 0×0 container and `flyTo` → NaN);
 *  3. resizing preserves the user's acquired location — the geolocation
 *     lifecycle must not restart because the window changed size;
 *  4. resizing preserves the selected station;
 *  5. every coordinate handed to the map layer is finite and in range at
 *     every width, so Leaflet can never receive `(NaN, NaN)`.
 *
 * These are UI-independent contracts: they constrain composition, not visual
 * design, so they stay valid across styling changes.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderPage from "@/app/page";
import type { StationItem } from "@/hooks/useStations";
import { isValidLatLng } from "@/lib/leafletSafety";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";
import {
  BREAKPOINTS,
  installViewport,
  restoreViewport,
  setViewportWidth,
} from "@/test/viewport";

/**
 * Mount counters plus a record of every coordinate the page passes to the map,
 * so we can assert Leaflet is never handed something unprojectable.
 */
const mapProbe = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  coords: [] as Array<{ latitude: number; longitude: number }>,
  get mounted() {
    return this.mounts - this.unmounts;
  },
  reset() {
    this.mounts = 0;
    this.unmounts = 0;
    this.coords = [];
  },
}));

vi.mock("@/components/map/StationMap", () => {
  const React = require("react") as typeof import("react");
  function StationMapMock(props: {
    onSelect?: (id: string) => void;
    items?: Array<{ id: string; latitude: number; longitude: number }>;
    userLocation?: { latitude: number; longitude: number } | null;
  }) {
    React.useEffect(() => {
      mapProbe.mounts += 1;
      return () => {
        mapProbe.unmounts += 1;
      };
    }, []);

    // Record what the real Leaflet layer would have been asked to project.
    for (const item of props.items ?? []) {
      mapProbe.coords.push({ latitude: item.latitude, longitude: item.longitude });
    }
    if (props.userLocation) mapProbe.coords.push(props.userLocation);

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
const STATION_2 = makeStation("st-2", 6.4531, 3.3958);

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
  installViewport(BREAKPOINTS.mobile);
  mapProbe.reset();

  mockedStations.mockResolvedValue({
    items: [STATION, STATION_2],
    total: 2,
    page: 1,
    page_size: 100,
  });
  mockedNearby.mockResolvedValue({
    items: [
      { ...STATION, distance_meters: 120 },
      { ...STATION_2, distance_meters: 900 },
    ],
    latitude: ACCURATE_FIX.latitude,
    longitude: ACCURATE_FIX.longitude,
    radius_meters: 5000,
  });
  mockedFavorites.mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  useMapStore.getState().stopLocationWatch();
  removeGeoMock();
  restoreViewport();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------ */
/* 1. One map instance at every supported width                              */
/* ------------------------------------------------------------------------ */

describe.each([
  ["mobile", BREAKPOINTS.mobile],
  ["tablet", BREAKPOINTS.tablet],
  ["laptop", BREAKPOINTS.laptop],
  ["desktop", BREAKPOINTS.desktop],
] as const)("finder at %s width (%ipx)", (_name, width) => {
  it("mounts exactly one Leaflet map instance", async () => {
    installViewport(width);
    renderPage();

    await screen.findByTestId("station-map-mock");
    await waitFor(() => expect(mapProbe.mounted).toBe(1));

    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapProbe.mounts).toBe(1);
  });

  it("never hands the map an invalid coordinate", async () => {
    installViewport(width);
    renderPage();

    await screen.findByTestId("station-map-mock");
    await waitFor(() => expect(mockedStations).toHaveBeenCalled());

    // Acquire a position so the user marker coordinate is exercised too.
    fireEvent.click(screen.getAllByRole("button", { name: /near me/i })[0]);
    act(() =>
      geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20),
    );
    await waitFor(() =>
      expect(useMapStore.getState().locationStatus).toBe("tracking"),
    );

    expect(mapProbe.coords.length).toBeGreaterThan(0);
    for (const c of mapProbe.coords) {
      expect(Number.isFinite(c.latitude)).toBe(true);
      expect(Number.isFinite(c.longitude)).toBe(true);
      expect(isValidLatLng(c.latitude, c.longitude)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------------ */
/* 2–4. Resizing must not remount the map or lose state                      */
/* ------------------------------------------------------------------------ */

describe("resizing across breakpoints", () => {
  const LADDER = [
    BREAKPOINTS.mobile,
    BREAKPOINTS.tablet,
    BREAKPOINTS.laptop,
    BREAKPOINTS.desktop,
  ];

  it("walks 390 → 1440 and back without ever creating a second map", async () => {
    installViewport(BREAKPOINTS.mobile);
    renderPage();
    await screen.findByTestId("station-map-mock");
    await waitFor(() => expect(mapProbe.mounted).toBe(1));

    for (const width of [...LADDER, ...LADDER.slice().reverse()]) {
      act(() => setViewportWidth(width));
      await waitFor(() => expect(mapProbe.mounted).toBe(1));
      expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    }

    // The decisive assertion: one mount for the whole session, i.e. the map
    // was never torn down and rebuilt by a breakpoint change.
    expect(mapProbe.mounts).toBe(1);
    expect(mapProbe.unmounts).toBe(0);
  });

  it("preserves the acquired location across a mobile → desktop resize", async () => {
    installViewport(BREAKPOINTS.mobile);
    renderPage();
    await screen.findByTestId("station-map-mock");

    fireEvent.click(screen.getAllByRole("button", { name: /near me/i })[0]);
    act(() =>
      geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20),
    );
    await waitFor(() =>
      expect(useMapStore.getState().locationStatus).toBe("tracking"),
    );

    const before = useMapStore.getState().userLocation;
    const geoCallsBefore = geo.calls.getCurrentPosition;
    expect(before).not.toBeNull();

    act(() => setViewportWidth(BREAKPOINTS.desktop));
    await waitFor(() => expect(mapProbe.mounted).toBe(1));

    const after = useMapStore.getState().userLocation;
    expect(after).toEqual(before);
    expect(useMapStore.getState().locationStatus).toBe("tracking");
    // Resizing must not re-run acquisition — no new permission prompt.
    expect(geo.calls.getCurrentPosition).toBe(geoCallsBefore);
  });

  it("preserves the selected station across resizes in both directions", async () => {
    installViewport(BREAKPOINTS.mobile);
    renderPage();
    await screen.findByTestId("station-map-mock");
    await waitFor(() => expect(mockedStations).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("station-map-mock"));
    await waitFor(() =>
      expect(useMapStore.getState().selectedStationId).toBe("st-1"),
    );

    act(() => setViewportWidth(BREAKPOINTS.desktop));
    await waitFor(() => expect(mapProbe.mounted).toBe(1));
    expect(useMapStore.getState().selectedStationId).toBe("st-1");

    act(() => setViewportWidth(BREAKPOINTS.mobile));
    await waitFor(() => expect(mapProbe.mounted).toBe(1));
    expect(useMapStore.getState().selectedStationId).toBe("st-1");
  });

  it("keeps a single map through an orientation-style rapid resize burst", async () => {
    installViewport(BREAKPOINTS.mobile);
    renderPage();
    await screen.findByTestId("station-map-mock");

    act(() => {
      // Rotations/keyboard show-hide fire many resizes in quick succession.
      for (let i = 0; i < 10; i += 1) {
        setViewportWidth(i % 2 === 0 ? BREAKPOINTS.mobile : BREAKPOINTS.tablet);
      }
    });

    await waitFor(() => expect(mapProbe.mounted).toBe(1));
    expect(mapProbe.mounts).toBe(1);
  });
});
