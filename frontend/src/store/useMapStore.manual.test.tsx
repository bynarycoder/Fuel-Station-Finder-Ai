/**
 * Store-level tests for the MANUAL location path (`setManualLocation`).
 *
 * These guard the desktop-fallback contract at the single location owner:
 *
 * - a user-selected location is stored with `locationSource: "manual"` and a
 *   display label — it is intentional user input, NEVER disguised as GPS;
 * - manual mode enters nearby mode but MUST NOT start `watchPosition()`;
 * - a failed GPS refresh NEVER erases the manual location;
 * - a successful explicit GPS request REPLACES the manual location (device
 *   mode + the single watcher);
 * - the nearby station query uses exactly the selected coordinates — no
 *   invented or default coordinates.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useStationsQuery } from "@/hooks/useStations";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    fetchAllStations: vi.fn(),
    fetchNearbyStations: vi.fn(),
  };
});

const mockedNearby = vi.mocked(api.fetchNearbyStations);
const mockedAll = vi.mocked(api.fetchAllStations);

const KADUNA = { latitude: 10.5207, longitude: 7.4386 };
const KADUNA_LABEL = "Kaduna, Kaduna State, Nigeria";
const ACCURATE_FIX = { latitude: 6.5244, longitude: 3.3792 };

let queryClient: QueryClient;
let geo: GeoMock;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  resetStore();
  geo = installGeoMock();
  mockedNearby.mockReset();
  mockedAll.mockReset();
  mockedAll.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
});

afterEach(() => {
  useMapStore.getState().stopLocationWatch();
  removeGeoMock();
  vi.restoreAllMocks();
});

describe("setManualLocation (manual mode)", () => {
  it("stores the selected coordinates with source 'manual' + label, enters nearby, NO watcher", () => {
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });

    const s = useMapStore.getState();
    expect(s.userLocation).toEqual(KADUNA);
    expect(s.locationSource).toBe("manual");
    expect(s.manualLocationLabel).toBe(KADUNA_LABEL);
    expect(s.mode).toBe("nearby");
    expect(s.locationStatus).toBe("manual");
    expect(s.locationMessage).toBeNull();
    expect(s.isWatching).toBe(false);
    // The core rule: manual selection must never start GPS watching.
    expect(geo.calls.watchPosition).toBe(0);
    expect(geo.activeWatchId).toBeNull();
  });

  it("stops an existing watcher when a manual location is selected", async () => {
    // Establish device tracking first.
    act(() => {
      void useMapStore.getState().requestLocation();
    });
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
    expect(geo.activeWatchId).not.toBeNull();

    // Switching to manual must clear the watcher.
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });
    expect(useMapStore.getState().locationSource).toBe("manual");
    expect(geo.activeWatchId).toBeNull();
    expect(useMapStore.getState().isWatching).toBe(false);
  });

  it("nearby query uses exactly the selected coordinates (no defaults, no inventions)", async () => {
    mockedNearby.mockResolvedValue({
      items: [],
      latitude: KADUNA.latitude,
      longitude: KADUNA.longitude,
      radius_meters: 5000,
    });

    const { result } = renderHook(() => useStationsQuery(new Set()), { wrapper });
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });

    await waitFor(() => expect(mockedNearby).toHaveBeenCalled());
    const params = mockedNearby.mock.calls.at(-1)?.[0];
    expect(params?.latitude).toBe(KADUNA.latitude);
    expect(params?.longitude).toBe(KADUNA.longitude);
    expect(result.current.isNearby).toBe(true);
    // Never the (invented) Abuja/Jos defaults.
    expect(params?.latitude).not.toBe(9.0567);
    expect(params?.longitude).not.toBe(7.4969);
  });
});

describe("manual location vs. GPS failure (never erase a valid selection)", () => {
  it("a coarse GPS refresh failure keeps the manual location and its label", async () => {
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });

    // User taps "Use my current location" → both attempts return a 200 km fix.
    let resolved: unknown;
    await act(async () => {
      const p = useMapStore.getState().requestLocation();
      geo.getCurrentSuccess(9.0567, 7.4969, 200_000);
      geo.getCurrentSuccess(9.0567, 7.4969, 200_000);
      resolved = await p;
    });

    expect(resolved).toBeNull();
    const s = useMapStore.getState();
    expect(s.userLocation).toEqual(KADUNA); // manual location survived
    expect(s.locationSource).toBe("manual");
    expect(s.manualLocationLabel).toBe(KADUNA_LABEL);
    expect(s.locationStatus).toBe("manual");
    expect(s.locationMessage).toMatch(/still using your selected location/i);
    expect(s.locationFailure?.coarseAccuracy).toBe(true);
    expect(s.isWatching).toBe(false);
    expect(geo.calls.watchPosition).toBe(0);
  });

  it("a transient GPS failure also keeps the manual location", async () => {
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });

    await act(async () => {
      const p = useMapStore.getState().requestLocation();
      geo.getCurrentError(3);
      geo.getCurrentError(3);
      await p;
    });

    const s = useMapStore.getState();
    expect(s.userLocation).toEqual(KADUNA);
    expect(s.locationSource).toBe("manual");
    expect(s.locationStatus).toBe("manual");
  });
});

describe("manual location → device GPS (explicit switch back)", () => {
  it("a successful 'use my current location' replaces manual with device + watcher", async () => {
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });

    await act(async () => {
      const p = useMapStore.getState().requestLocation();
      geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 25);
      await p;
    });

    const s = useMapStore.getState();
    expect(s.userLocation).toEqual(ACCURATE_FIX);
    expect(s.locationSource).toBe("device");
    expect(s.manualLocationLabel).toBeNull();
    expect(s.locationStatus).toBe("tracking");
    expect(s.isWatching).toBe(true);
    expect(geo.calls.watchPosition).toBe(1);
  });

  it("recenter while a manual location is active does NOT silently replace it with GPS", async () => {
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });

    act(() => {
      useMapStore.getState().recenterLocation();
    });

    // No GPS call fired — the recenter must not silently switch modes.
    expect(geo.calls.getCurrentPosition).toBe(0);
    const s = useMapStore.getState();
    expect(s.userLocation).toEqual(KADUNA);
    expect(s.locationSource).toBe("manual");
  });
});
