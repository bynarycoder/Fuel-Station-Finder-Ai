/**
 * END-TO-END regression tests for the desktop location fallback.
 *
 * Reproduces the EXACT production desktop scenario from the spec:
 *
 *   navigator.geolocation returns
 *     latitude: 9.0567, longitude: 7.4969, accuracy: 200000
 *
 * Expected (all asserted here):
 *   - the 200 km fix is REJECTED by the unchanged 5 km protection
 *     (MAX_ACCEPTABLE_ACCURACY_METERS = 5_000 — never raised);
 *   - NO coordinates are stored and NO nearby query runs with them;
 *   - the fallback panel "We couldn't get an accurate location" appears with
 *     a "Choose a location" action (no raw accuracy/error values shown);
 *   - the user searches "Kaduna", explicitly selects it in the picker;
 *   - the manual location (Kaduna's real selected coordinates) becomes the
 *     active location with `locationSource: "manual"`;
 *   - the nearby API is called with EXACTLY those selected coordinates;
 *   - NO `watchPosition()` is started for the manual location.
 *
 * And the phone workflow, which must keep working unchanged:
 *   - accurate GPS (25 m) → accepted → nearby stations → watcher starts.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderPage from "@/app/page";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";

// The page's Leaflet map is replaced with a mount-counting stub (same pattern
// as page.single-map.test.tsx) — jsdom has no real map layout.
vi.mock("@/components/map/StationMap", () => {
  const React = require("react") as typeof import("react");
  return {
    default: function StationMapMock() {
      return React.createElement("div", { "data-testid": "station-map-mock" });
    },
  };
});

// The picker's lazy Leaflet map is also stubbed — jsdom cannot mount Leaflet.
vi.mock("@/components/location/LocationMap", () => ({
  default: () => <div data-testid="location-map-mock" />,
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    fetchAllStations: vi.fn(),
    fetchNearbyStations: vi.fn(),
    fetchFavorites: vi.fn(),
    fetchCurrentUser: vi.fn(),
    searchLocations: vi.fn(),
    reverseGeocode: vi.fn(),
    requestAiRecommendation: vi.fn(),
  };
});

const mockedNearby = vi.mocked(api.fetchNearbyStations);
const mockedAll = vi.mocked(api.fetchAllStations);
const mockedSearch = vi.mocked(api.searchLocations);
const mockedReverse = vi.mocked(api.reverseGeocode);
const mockedFavorites = vi.mocked(api.fetchFavorites);

// The exact coordinates from the reported desktop bug report.
const COARSE_DESKTOP = { latitude: 9.0567, longitude: 7.4969, accuracy: 200_000 };
const ACCURATE_PHONE_FIX = { latitude: 6.5244, longitude: 3.3792, accuracy: 25 };

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
    locationSource: null,
    manualLocationLabel: null,
    locationFailure: null,
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
  stubMatchMedia(true); // desktop layout — where the bug report happened

  mockedAll.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
  mockedNearby.mockResolvedValue({
    items: [],
    latitude: 0,
    longitude: 0,
    radius_meters: 5000,
  });
  mockedFavorites.mockResolvedValue({ items: [], total: 0 });
  mockedSearch.mockResolvedValue({ query: "Kaduna", results: [KADUNA_PLACE] });
  mockedReverse.mockResolvedValue(null);
});

afterEach(() => {
  useMapStore.getState().stopLocationWatch();
  removeGeoMock();
  vi.restoreAllMocks();
});

/** Click the (shared) Near me button — two filter bars are mounted, same store. */
function clickNearMe() {
  fireEvent.click(screen.getAllByRole("button", { name: /^near me$/i })[0]);
}

describe("THE 200 km desktop scenario (Step 20)", () => {
  it("rejects the coarse fix, offers the picker, and uses Kaduna's selected coordinates", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    // 1) User taps Near me → both browser attempts return the 200 km fix.
    clickNearMe();
    act(() => {
      geo.getCurrentSuccess(COARSE_DESKTOP.latitude, COARSE_DESKTOP.longitude, COARSE_DESKTOP.accuracy);
      geo.getCurrentSuccess(COARSE_DESKTOP.latitude, COARSE_DESKTOP.longitude, COARSE_DESKTOP.accuracy);
    });

    // 2) GPS fix rejected — nothing stored, no nearby query, no watcher.
    await waitFor(() => {
      const s = useMapStore.getState();
      expect(s.locationStatus).toBe("error");
      expect(s.locationFailure?.coarseAccuracy).toBe(true);
    });
    expect(useMapStore.getState().userLocation).toBeNull();
    expect(useMapStore.getState().locationSource).toBeNull();
    expect(mockedNearby).not.toHaveBeenCalled();
    expect(geo.calls.watchPosition).toBe(0);

    // 3) Desktop fallback panel explains the real situation (no raw values).
    const fallbackPanels = await screen.findAllByText(
      "We couldn't get an accurate location",
    );
    expect(fallbackPanels.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/only provided an approximate location/i).length).toBeGreaterThan(0);
    // No technical diagnostics for normal users.
    expect(screen.queryByText(/200000|accuracy|POSITION_UNAVAILABLE/i)).toBeNull();

    // 4) Primary action: "Choose a location" opens the picker.
    fireEvent.click(
      screen.getAllByRole("button", { name: /choose a location/i })[0],
    );
    expect(await screen.findByRole("heading", { name: "Choose a location" })).toBeInTheDocument();

    // 5) User searches "Kaduna" and EXPLICITLY selects the result.
    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Kaduna, Kaduna State, Nigeria/i }),
    );
    await screen.findByTestId("location-map-mock");
    fireEvent.click(screen.getByRole("button", { name: /use this location/i }));

    // 6) Manual location stored: Kaduna's real selected coordinates, no watch.
    await waitFor(() => {
      const s = useMapStore.getState();
      expect(s.userLocation).toEqual({
        latitude: KADUNA_PLACE.latitude,
        longitude: KADUNA_PLACE.longitude,
      });
      expect(s.locationSource).toBe("manual");
      expect(s.manualLocationLabel).toBe("Kaduna, Kaduna State, Nigeria");
      expect(s.mode).toBe("nearby");
    });
    expect(useMapStore.getState().isWatching).toBe(false);
    expect(geo.calls.watchPosition).toBe(0);

    // 7) The nearby query uses EXACTLY the selected coordinates.
    await waitFor(() => expect(mockedNearby).toHaveBeenCalled());
    const params = mockedNearby.mock.calls.at(-1)?.[0];
    expect(params?.latitude).toBe(KADUNA_PLACE.latitude);
    expect(params?.longitude).toBe(KADUNA_PLACE.longitude);
    // Never the rejected coarse coordinates (Abuja/Jos centroids).
    expect(params?.latitude).not.toBe(COARSE_DESKTOP.latitude);
    expect(params?.longitude).not.toBe(COARSE_DESKTOP.longitude);

    // 8) The UI labels it honestly as a selected location.
    expect(
      (await screen.findAllByText("Using selected location")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kaduna, Kaduna State/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/live tracking|tracking you/i)).toBeNull();
  });
});

describe("manual location + GPS switching (desktop)", () => {
  it("a failed GPS refresh keeps the manual location; a successful one replaces it", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    // Establish a manual location through the picker (same flow as above).
    clickNearMe();
    act(() => {
      geo.getCurrentSuccess(COARSE_DESKTOP.latitude, COARSE_DESKTOP.longitude, COARSE_DESKTOP.accuracy);
      geo.getCurrentSuccess(COARSE_DESKTOP.latitude, COARSE_DESKTOP.longitude, COARSE_DESKTOP.accuracy);
    });
    await screen.findAllByText("We couldn't get an accurate location");
    fireEvent.click(screen.getAllByRole("button", { name: /choose a location/i })[0]);
    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Kaduna, Kaduna State, Nigeria/i }),
    );
    await screen.findByTestId("location-map-mock");
    fireEvent.click(screen.getByRole("button", { name: /use this location/i }));
    await waitFor(() =>
      expect(useMapStore.getState().locationSource).toBe("manual"),
    );

    // "Use my current location" (manual banner) → GPS fails again → manual kept.
    fireEvent.click(
      screen.getAllByRole("button", { name: /use my current location/i })[0],
    );
    act(() => {
      geo.getCurrentSuccess(COARSE_DESKTOP.latitude, COARSE_DESKTOP.longitude, COARSE_DESKTOP.accuracy);
      geo.getCurrentSuccess(COARSE_DESKTOP.latitude, COARSE_DESKTOP.longitude, COARSE_DESKTOP.accuracy);
    });
    await waitFor(() =>
      expect(useMapStore.getState().locationMessage).toMatch(/still using your selected location/i),
    );
    const s = useMapStore.getState();
    expect(s.userLocation).toEqual({
      latitude: KADUNA_PLACE.latitude,
      longitude: KADUNA_PLACE.longitude,
    });
    expect(s.locationSource).toBe("manual");

    // "Use my current location" again → accurate fix → device mode + watcher.
    fireEvent.click(
      screen.getAllByRole("button", { name: /use my current location/i })[0],
    );
    act(() => {
      geo.getCurrentSuccess(
        ACCURATE_PHONE_FIX.latitude,
        ACCURATE_PHONE_FIX.longitude,
        ACCURATE_PHONE_FIX.accuracy,
      );
    });
    await waitFor(() => {
      const st = useMapStore.getState();
      expect(st.locationSource).toBe("device");
      expect(st.locationStatus).toBe("tracking");
      expect(st.userLocation).toEqual({
        latitude: ACCURATE_PHONE_FIX.latitude,
        longitude: ACCURATE_PHONE_FIX.longitude,
      });
    });
    expect(useMapStore.getState().isWatching).toBe(true);
    expect(geo.calls.watchPosition).toBe(1);
  });
});

describe("phone GPS workflow (unchanged)", () => {
  it("accurate GPS → accepted → nearby stations → watcher starts", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    clickNearMe();
    act(() => {
      geo.getCurrentSuccess(
        ACCURATE_PHONE_FIX.latitude,
        ACCURATE_PHONE_FIX.longitude,
        ACCURATE_PHONE_FIX.accuracy,
      );
    });

    await waitFor(() => {
      const s = useMapStore.getState();
      expect(s.userLocation).toEqual({
        latitude: ACCURATE_PHONE_FIX.latitude,
        longitude: ACCURATE_PHONE_FIX.longitude,
      });
      expect(s.locationSource).toBe("device");
      expect(s.locationStatus).toBe("tracking");
      expect(s.isWatching).toBe(true);
    });
    expect(geo.calls.watchPosition).toBe(1);
    expect(geo.activeWatchId).not.toBeNull();

    await waitFor(() => expect(mockedNearby).toHaveBeenCalled());
    const params = mockedNearby.mock.calls.at(-1)?.[0];
    expect(params?.latitude).toBe(ACCURATE_PHONE_FIX.latitude);
    expect(params?.longitude).toBe(ACCURATE_PHONE_FIX.longitude);

    expect(
      (await screen.findAllByText("Using your current location")).length,
    ).toBeGreaterThan(0);
  });
});

describe("no location → choose-location action always available", () => {
  it("renders a 'Choose location' action before any GPS request", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    // Two filter bars are mounted (desktop rail + mobile header share the
    // store); both expose the manual path before GPS is ever requested.
    const chooseButtons = screen.getAllByRole("button", {
      name: /choose location/i,
    });
    expect(chooseButtons.length).toBeGreaterThan(0);

    // The pre-permission primer also offers the manual path.
    expect(
      screen.getAllByRole("button", { name: /search manually/i }).length,
    ).toBeGreaterThan(0);

    // Opening the picker from the primer happens with ZERO geolocation calls.
    fireEvent.click(
      screen.getAllByRole("button", { name: /search manually/i })[0],
    );
    expect(
      await screen.findByRole("heading", { name: "Choose a location" }),
    ).toBeInTheDocument();
    expect(geo.calls.getCurrentPosition).toBe(0);
    expect(geo.calls.watchPosition).toBe(0);
  });
});
