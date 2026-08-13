/**
 * Orchestration tests for StationFilters — the component that wires the
 * browser geolocation hook to the store (the production bug lived here).
 *
 * Uses the REAL hook + REAL zustand store against a mocked
 * `navigator.geolocation`, so these tests cover the full client-side
 * location lifecycle:
 *
 *  A. initial success → lastKnownPosition stored, nearby mode, tracking
 *  B. initial timeout (no position) → fatal error panel, stays in browse
 *  C. later watchPosition TIMEOUT → position/results preserved, NON-fatal
 *  D. watch success → store updated only past the movement threshold
 *  E. PERMISSION_DENIED during watch → tracking stops, useful message
 *  F. POSITION_UNAVAILABLE → lastKnownPosition preserved
 *  G. repeated Near Me clicks → exactly one watcher
 *  I. recenter → uses last known position immediately, then refreshes
 *  J. closest-station prerequisite: nearby results stay visible on timeout
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { StationFilters } from "@/components/stations/StationFilters";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";

let queryClient: QueryClient;

function renderFilters() {
  return render(
    <QueryClientProvider client={queryClient}>
      <StationFilters />
    </QueryClientProvider>,
  );
}

const JOS_COORDS = { latitude: 9.0567, longitude: 7.49698 };
const KADUNA_COORDS = { latitude: 10.5207, longitude: 7.4386 };

let geo: GeoMock;

function resetStore() {
  useMapStore.setState({
    mode: "browse",
    filters: { q: "", brand: "", city: "", fuelType: "" },
    userLocation: null,
    locationStatus: "idle",
    locationMessage: null,
    radiusMeters: 5000,
    selectedStationId: null,
  });
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  resetStore();
  geo = installGeoMock();
});

afterEach(() => {
  removeGeoMock();
  vi.restoreAllMocks();
});

function clickNearMe() {
  fireEvent.click(screen.getByRole("button", { name: /near me/i }));
}

/** Drive a full successful Near Me session: request + watch. */
async function startTracking() {
  clickNearMe();
  act(() => geo.getCurrentSuccess(JOS_COORDS.latitude, JOS_COORDS.longitude));
  await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
  expect(geo.calls.watchPosition).toBe(1);
}

describe("initial location (test A)", () => {
  it("stores lastKnownPosition, switches to nearby mode and starts ONE watcher", async () => {
    renderFilters();
    clickNearMe();

    expect(useMapStore.getState().locationStatus).toBe("requesting");
    expect(screen.getByRole("button", { name: /locating/i })).toBeInTheDocument();

    act(() => geo.getCurrentSuccess(JOS_COORDS.latitude, JOS_COORDS.longitude));

    await waitFor(() => {
      const s = useMapStore.getState();
      expect(s.userLocation).toEqual(JOS_COORDS);
      expect(s.mode).toBe("nearby");
      expect(s.locationStatus).toBe("tracking");
    });
    expect(geo.calls.watchPosition).toBe(1);
    expect(geo.activeWatchId).not.toBeNull();
    expect(screen.getByRole("button", { name: /tracking you/i })).toBeInTheDocument();
  });
});

describe("initial timeout (test B)", () => {
  it("shows a fatal error and stays in browse mode", async () => {
    renderFilters();
    clickNearMe();
    act(() => {
      // High-accuracy timeout then low-accuracy timeout → fatal (no position).
      geo.getCurrentError(3);
      geo.getCurrentError(3);
    });

    await waitFor(() => {
      expect(useMapStore.getState().locationStatus).toBe("error");
      expect(useMapStore.getState().mode).toBe("browse");
    });
    // Fatal panel — no valid location exists, so this IS fatal.
    expect(screen.getByText("Could not get your location")).toBeInTheDocument();
    expect(screen.getByText(/couldn't get your location in time/)).toBeInTheDocument();
    // No watcher was created, and no silent city was stored.
    expect(geo.calls.watchPosition).toBe(0);
    expect(useMapStore.getState().userLocation).toBeNull();
    expect(useMapStore.getState().userLocation).not.toEqual({
      latitude: 9.0765,
      longitude: 7.3986,
    });
    // Retry + manual city search — never a hardcoded fallback city.
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search by city/i })).toBeInTheDocument();
  });

  it("Search by city stays in browse and does not invent coordinates", async () => {
    renderFilters();
    clickNearMe();
    act(() => {
      geo.getCurrentError(3);
      geo.getCurrentError(3);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /search by city/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /search by city/i }));
    expect(useMapStore.getState().mode).toBe("browse");
    expect(useMapStore.getState().userLocation).toBeNull();
    await waitFor(() => {
      expect(document.getElementById("station-city-filter")).toBe(document.activeElement);
    });
  });
});

describe("initial POSITION_UNAVAILABLE", () => {
  it("shows a fatal panel with retry + search by city and stores no coordinates", async () => {
    renderFilters();
    clickNearMe();
    act(() => {
      geo.getCurrentError(2);
      geo.getCurrentError(2);
    });
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("error"));
    expect(useMapStore.getState().userLocation).toBeNull();
    expect(screen.getByText(/couldn't determine your location/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search by city/i })).toBeInTheDocument();
  });
});

describe("later watchPosition TIMEOUT (test C — the production bug)", () => {
  it("preserves position, results and tracking intent; shows NON-fatal banner", async () => {
    renderFilters();
    await startTracking();

    // The screenshot scenario: nearby API already returned 200, then the
    // watch reports a timeout. Before the fix this rendered the fatal
    // "Could not get your location" panel.
    act(() => geo.watchError(3));

    await waitFor(() => {
      expect(useMapStore.getState().locationStatus).toBe("temporarily_unavailable");
    });

    // Nothing was cleared.
    expect(useMapStore.getState().userLocation).toEqual(JOS_COORDS);
    expect(useMapStore.getState().mode).toBe("nearby");

    // Non-fatal, non-blocking status message.
    expect(screen.getByText("Using your last known location")).toBeInTheDocument();
    expect(screen.getByText(/Using your last known location\. Trying to update/)).toBeInTheDocument();

    // NO fatal panel.
    expect(screen.queryByText("Could not get your location")).not.toBeInTheDocument();

    // Tracking intent intact (button stays "Tracking you", watcher alive).
    expect(screen.getByRole("button", { name: /tracking you/i })).toBeInTheDocument();
    expect(geo.activeWatchId).not.toBeNull();

    // A later watch success recovers to tracking.
    act(() => geo.watchSuccess(JOS_COORDS.latitude, JOS_COORDS.longitude));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
    expect(useMapStore.getState().userLocation).toEqual(JOS_COORDS);
  });
});

describe("watch success + movement threshold (test D)", () => {
  it("does NOT update the store on sub-threshold jitter", async () => {
    renderFilters();
    await startTracking();

    // ~33 m east — below the 75 m threshold.
    act(() => geo.watchSuccess(JOS_COORDS.latitude, JOS_COORDS.longitude + 0.0003));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
    expect(useMapStore.getState().userLocation).toEqual(JOS_COORDS);
  });

  it("updates the store (and therefore nearby results) past the threshold", async () => {
    renderFilters();
    await startTracking();

    // ~220 m east — beyond the 75 m threshold.
    const moved = { latitude: JOS_COORDS.latitude, longitude: JOS_COORDS.longitude + 0.002 };
    act(() => geo.watchSuccess(moved.latitude, moved.longitude));

    await waitFor(() => expect(useMapStore.getState().userLocation).toEqual(moved));
    expect(useMapStore.getState().locationStatus).toBe("tracking");
  });
});

describe("PERMISSION_DENIED during watch (test E)", () => {
  it("stops tracking, keeps last known position, shows a useful message", async () => {
    renderFilters();
    await startTracking();

    act(() => geo.watchError(1));

    await waitFor(() => {
      expect(useMapStore.getState().locationStatus).toBe("permission_denied");
    });
    // Tracking stopped — no repeated permission prompts.
    expect(geo.activeWatchId).toBeNull();
    expect(geo.calls.clearWatch).toBeGreaterThan(0);
    // Last known position and results stay visible.
    expect(useMapStore.getState().userLocation).toEqual(JOS_COORDS);
    expect(useMapStore.getState().mode).toBe("nearby");
    // Non-fatal banner (a position exists) with the permission message.
    expect(screen.getByText("Live tracking paused")).toBeInTheDocument();
    expect(screen.getByText(/Location access is blocked/)).toBeInTheDocument();
    expect(screen.queryByText("Could not get your location")).not.toBeInTheDocument();
    // Button offers to restart tracking.
    expect(screen.getByRole("button", { name: /start tracking/i })).toBeInTheDocument();
  });
});

describe("POSITION_UNAVAILABLE during watch (test F)", () => {
  it("preserves last known position and shows a temporary status", async () => {
    renderFilters();
    await startTracking();

    act(() => geo.watchError(2));

    await waitFor(() => {
      expect(useMapStore.getState().locationStatus).toBe("temporarily_unavailable");
    });
    expect(useMapStore.getState().userLocation).toEqual(JOS_COORDS);
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("Could not get your location")).not.toBeInTheDocument();
    // Watcher kept alive for retries.
    expect(geo.activeWatchId).not.toBeNull();
  });
});

describe("repeated Near Me clicks (test G)", () => {
  it("keeps exactly one active watcher", async () => {
    renderFilters();
    await startTracking();

    // Second click on the same button (now labelled "Tracking you") while
    // tracking → recenter path, NOT a second watcher.
    fireEvent.click(screen.getByRole("button", { name: /tracking you/i }));
    await vi.waitFor(() => expect(geo.calls.getCurrentPosition).toBeGreaterThanOrEqual(2));
    expect(geo.calls.watchPosition).toBe(1);
    expect(geo.activeWatchId).not.toBeNull();
  });
});

describe("Recenter on Me (test I)", () => {
  it("recenters immediately on the last known position, then refreshes", async () => {
    const recenterListener = vi.fn();
    window.addEventListener("recenter-on-me", recenterListener);
    renderFilters();
    await startTracking();

    fireEvent.click(screen.getByRole("button", { name: /recenter on me/i }));

    // The recenter event fires synchronously — before any fresh GPS result.
    expect(recenterListener).toHaveBeenCalledTimes(1);
    // A background refresh was kicked off.
    expect(geo.calls.getCurrentPosition).toBeGreaterThanOrEqual(2);
    // Status briefly "updating", then back to "tracking".
    expect(useMapStore.getState().locationStatus).toBe("updating");

    act(() => geo.getCurrentSuccess(JOS_COORDS.latitude, JOS_COORDS.longitude));
    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
    expect(useMapStore.getState().userLocation).toEqual(JOS_COORDS);

    window.removeEventListener("recenter-on-me", recenterListener);
  });

  it("keeps the last known position when the background refresh times out", async () => {
    renderFilters();
    await startTracking();

    fireEvent.click(screen.getByRole("button", { name: /recenter on me/i }));
    act(() => geo.getCurrentError(3));

    await waitFor(() => expect(useMapStore.getState().locationStatus).toBe("tracking"));
    expect(useMapStore.getState().userLocation).toEqual(JOS_COORDS);
    expect(screen.queryByText("Could not get your location")).not.toBeInTheDocument();
  });
});

describe("Browse all (tracking stop)", () => {
  it("stops the watcher and resets the status", async () => {
    renderFilters();
    await startTracking();

    fireEvent.click(screen.getByRole("button", { name: /browse all/i }));

    await waitFor(() => {
      expect(useMapStore.getState().mode).toBe("browse");
      expect(useMapStore.getState().locationStatus).toBe("idle");
    });
    expect(geo.activeWatchId).toBeNull();
    expect(screen.getByRole("button", { name: /near me/i })).toBeInTheDocument();
  });
});
