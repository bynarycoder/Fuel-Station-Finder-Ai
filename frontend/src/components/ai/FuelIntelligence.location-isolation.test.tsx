/**
 * REGRESSION TESTS — Fuel Intelligence must be a read-only location consumer.
 *
 * These guard the exact regression introduced when the AI panel first
 * shipped: it owned a SECOND geolocation lifecycle (its own hook instance +
 * a raw `setUserLocation` write), which
 *   - desynced `userLocation` from `mode` / `locationStatus` / `isWatching`
 *     on success (fix stored, but the finder stayed in browse mode with no
 *     watcher), and
 *   - swallowed failures into panel-local state on rejection, leaving the
 *     store's state machine at "idle" — so the user hit the failure AGAIN
 *     through "Near me" ("Could not get your location") instead of one
 *     consistent lifecycle.
 *
 * Contract under test:
 *  1. Mounting/unmounting/opening the panel NEVER touches geolocation.
 *  2. An accepted fix drives the shared lifecycle: userLocation + nearby
 *     mode + tracking status + exactly ONE watcher — no matter which UI
 *     surface asked.
 *  3. A coarse (50 km) fix is rejected by the shared 5 km protection; no
 *     coordinates are stored and the backend is never called with them.
 *  4. A transient failure while a valid position exists degrades to
 *     `temporarily_unavailable` and NEVER erases the position.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { FuelIntelligence } from "@/components/ai/FuelIntelligence";
import { StationFilters } from "@/components/stations/StationFilters";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, requestAiRecommendation: vi.fn() };
});

const requestMock = vi.mocked(api.requestAiRecommendation);

const ACCURATE_FIX = { latitude: 6.5244, longitude: 3.3792 };
const COARSE_ABUJA = { latitude: 9.03, longitude: 7.47, accuracy: 50_000 };

let queryClient: QueryClient;
let geo: GeoMock;

function withProviders(children: ReactNode) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

/** Render the FinderPage composition: the AI panel above the filter bar. */
function renderFinder(withPanel: boolean) {
  return render(
    withProviders(
      <>
        {withPanel && <FuelIntelligence onViewStation={vi.fn()} />}
        <StationFilters />
      </>,
    ),
  );
}

function makeEmptyResponse(): Parameters<(typeof requestMock)["mockResolvedValue"]>[0] {
  return {
    query: "q",
    intent: null,
    intent_source: "fallback",
    answer_source: "fallback",
    needs_location: false,
    answer: "No stations matched.",
    recommendations: [],
  };
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  resetStore();
  geo = installGeoMock();
  requestMock.mockReset();
});

afterEach(() => {
  // Simulate leaving the page: always stop the watcher so the next test in
  // this file starts from a clean singleton slot.
  useMapStore.getState().stopLocationWatch();
  removeGeoMock();
  vi.restoreAllMocks();
});

describe("mount/unmount side effects", () => {
  it("mounting FuelIntelligence leaves userLocation / locationStatus / isWatching untouched", () => {
    const before = useMapStore.getState();
    const { unmount } = renderFinder(true);

    expect(geo.calls.getCurrentPosition).toBe(0);
    expect(geo.calls.watchPosition).toBe(0);

    const s = useMapStore.getState();
    expect(s.userLocation).toBe(before.userLocation);
    expect(s.locationStatus).toBe(before.locationStatus);
    expect(s.locationMessage).toBe(before.locationMessage);
    expect(s.isWatching).toBe(before.isWatching);
    expect(s.mode).toBe(before.mode);

    unmount();
    const s2 = useMapStore.getState();
    expect(s2.userLocation).toBe(before.userLocation);
    expect(s2.locationStatus).toBe(before.locationStatus);
    expect(s2.isWatching).toBe(before.isWatching);
    expect(geo.calls.getCurrentPosition + geo.calls.watchPosition).toBe(0);
  });

  it("opening and closing the panel during live tracking never starts/stops the watch", async () => {
    // Establish a live session via the finder's own button.
    renderFinder(false);
    fireEvent.click(screen.getByRole("button", { name: /^near me$/i }));
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
    expect(geo.calls.watchPosition).toBe(1);

    const { unmount } = render(
      withProviders(<FuelIntelligence onViewStation={vi.fn()} />),
    );
    expect(geo.calls.watchPosition).toBe(1);
    expect(geo.calls.clearWatch).toBe(0);

    unmount(); // closing the panel must not stop the finder's watch either
    expect(geo.calls.clearWatch).toBe(0);
    expect(useMapStore.getState().isWatching).toBe(true);
    expect(useMapStore.getState().locationStatus).toBe("tracking");
  });
});

describe("accepted fix → store, and the fix survives the panel", () => {
  it("accurate fix via the AI panel drives the FULL shared lifecycle (regression guard)", async () => {
    requestMock.mockResolvedValue(makeEmptyResponse());
    renderFinder(true);

    fireEvent.change(screen.getByLabelText("Ask Fuel AI"), {
      target: { value: "cheapest petrol" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask fuel ai/i }));
    await screen.findByText(/I need your location/i);

    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 15));

    await waitFor(() =>
      expect(useMapStore.getState().userLocation).toEqual(ACCURATE_FIX),
    );

    const s = useMapStore.getState();
    // The pre-AI "Near me" contract, from any surface:
    // fix stored → nearby mode → tracking status → exactly ONE watcher.
    expect(s.mode).toBe("nearby");
    expect(s.locationStatus).toBe("tracking");
    expect(s.locationMessage).toBeNull();
    expect(s.isWatching).toBe(true);
    expect(geo.calls.watchPosition).toBe(1);
    // And the pending question was answered with the fresh, REAL fix.
    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({
        query: "cheapest petrol",
        latitude: ACCURATE_FIX.latitude,
        longitude: ACCURATE_FIX.longitude,
      }),
    );
  });

  it("a stored accurate fix survives opening the AI panel unchanged", async () => {
    // Locate through the finder first (no panel mounted).
    renderFinder(false);
    fireEvent.click(screen.getByRole("button", { name: /^near me$/i }));
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));

    const geoCallsBefore = { ...geo.calls };

    // Now the user opens Fuel AI.
    requestMock.mockResolvedValue(makeEmptyResponse());
    render(withProviders(<FuelIntelligence onViewStation={vi.fn()} />));

    const s = useMapStore.getState();
    expect(s.userLocation).toEqual(ACCURATE_FIX);
    expect(s.locationStatus).toBe("tracking");
    expect(s.isWatching).toBe(true);
    expect(geo.calls).toEqual(geoCallsBefore); // zero new geolocation activity
  });
});

describe("rejected coarse fixes (5 km protection) — one lifecycle, one error surface", () => {
  it("the 50 km Abuja fix is rejected, nothing is stored, backend never sees it", async () => {
    requestMock.mockResolvedValue(makeEmptyResponse());
    renderFinder(true);

    fireEvent.change(screen.getByLabelText("Ask Fuel AI"), {
      target: { value: "petrol" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask fuel ai/i }));
    await screen.findByText(/I need your location/i);

    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    // Both attempts return the coarse city-level fix → both rejected.
    act(() => geo.getCurrentSuccess(COARSE_ABUJA.latitude, COARSE_ABUJA.longitude, COARSE_ABUJA.accuracy));
    act(() => geo.getCurrentSuccess(COARSE_ABUJA.latitude, COARSE_ABUJA.longitude, COARSE_ABUJA.accuracy));

    await screen.findByText(/couldn't determine your location/i);

    const s = useMapStore.getState();
    expect(s.userLocation).toBeNull(); // no fake coordinates, ever
    expect(s.locationStatus).toBe("error"); // fatal: no valid position exists
    expect(s.locationMessage).toContain("couldn't determine your location");
    expect(s.isWatching).toBe(false);
    expect(geo.calls.watchPosition).toBe(0);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("a coarse fix is never stored even when a previous valid position exists", async () => {
    // Good fix first.
    renderFinder(true);
    fireEvent.click(screen.getByRole("button", { name: /^near me$/i }));
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));

    // The watch later delivers a coarse 50 km fix — skipped, position kept.
    act(() => geo.watchSuccess(COARSE_ABUJA.latitude, COARSE_ABUJA.longitude, COARSE_ABUJA.accuracy));
    expect(useMapStore.getState().userLocation).toEqual(ACCURATE_FIX);
    expect(useMapStore.getState().locationStatus).toBe("tracking");
  });
});

describe("state machine rule: failure + existing position is never fatal", () => {
  it("transient failure during tracking degrades to temporarily_unavailable (position preserved)", async () => {
    renderFinder(true); // panel mounted while tracking — must make no difference
    fireEvent.click(screen.getByRole("button", { name: /^near me$/i }));
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));

    act(() => geo.watchError(3)); // TIMEOUT
    const s = useMapStore.getState();
    expect(s.userLocation).toEqual(ACCURATE_FIX); // never erased
    expect(s.locationStatus).toBe("temporarily_unavailable");
    expect(s.isWatching).toBe(true); // transient — watcher stays alive
  });

  it("re-request failure with an existing fix stays non-fatal and keeps tracking usable", async () => {
    renderFinder(true);
    fireEvent.click(screen.getByRole("button", { name: /^near me$/i }));
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));

    // Explicit recenter: silent refresh fails → last known position kept.
    fireEvent.click(screen.getByRole("button", { name: /recenter on me/i }));
    act(() => geo.getCurrentError(3));
    await waitFor(() =>
      expect(useMapStore.getState().locationStatus).toBe("tracking"),
    );
    expect(useMapStore.getState().userLocation).toEqual(ACCURATE_FIX);
  });
});

describe("single watcher / single lifecycle guarantees", () => {
  it("repeated requests across BOTH surfaces keep exactly one watcher", async () => {
    requestMock.mockResolvedValue(makeEmptyResponse());
    renderFinder(true);

    // 1) Locate via the finder.
    fireEvent.click(screen.getByRole("button", { name: /^near me$/i }));
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 20));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
    expect(geo.calls.watchPosition).toBe(1);

    // 2) Click the tracking button again → recenter, NOT a new watch.
    fireEvent.click(screen.getByRole("button", { name: /tracking you/i }));
    expect(geo.calls.watchPosition).toBe(1);

    // 3) The store-level acquisition restarts the same slot instead of stacking.
    await act(async () => {
      const p = useMapStore.getState().requestLocation();
      act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 30));
      await p;
    });
    expect(geo.calls.watchPosition).toBe(2); // restarted, not stacked
    expect(geo.activeWatchId).not.toBeNull();
    expect(useMapStore.getState().isWatching).toBe(true);
  });

  it("concurrent acquisition requests share ONE fix (no parallel lifecycles)", async () => {
    renderFinder(true);
    // While one acquisition is in flight, both buttons correctly lock
    // ("Locating…"); two concurrent store-level requests (the only way to
    // race) must share the same underlying fix instead of doubling the
    // getCurrentPosition lifecycle.
    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    act(() => {
      p1 = useMapStore.getState().requestLocation();
      p2 = useMapStore.getState().requestLocation();
    });
    act(() => geo.getCurrentSuccess(ACCURATE_FIX.latitude, ACCURATE_FIX.longitude, 25));
    await act(async () => {
      const [l1, l2] = await Promise.all([p1, p2]);
      expect(l1).toEqual(ACCURATE_FIX);
      expect(l2).toEqual(ACCURATE_FIX);
    });

    expect(geo.calls.getCurrentPosition).toBe(1);
    expect(geo.calls.watchPosition).toBe(1);
    expect(useMapStore.getState().userLocation).toEqual(ACCURATE_FIX);
    expect(useMapStore.getState().locationStatus).toBe("tracking");
  });
});
