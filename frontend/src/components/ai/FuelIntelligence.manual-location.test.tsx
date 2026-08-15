/**
 * Fuel AI + MANUAL location — the desktop fallback path (Step 14).
 *
 * Fuel AI must consume the SAME shared location source. When no location
 * exists it offers BOTH "Share my location" (device GPS via the store's
 * lifecycle) and "Choose a location" (the shared picker, delegated through
 * the parent). When the user picks a manual location through the store
 * (`setManualLocation`), the parked question is answered with EXACTLY those
 * selected coordinates — no second geolocation lifecycle, no invented data.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { FuelIntelligence } from "@/components/ai/FuelIntelligence";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, requestAiRecommendation: vi.fn() };
});

const requestMock = vi.mocked(api.requestAiRecommendation);

const KADUNA = { latitude: 10.5264296, longitude: 7.4387398 };
const KADUNA_LABEL = "Kaduna, Kaduna State, Nigeria";

let queryClient: QueryClient;
let geo: GeoMock;

function renderPanel(onChooseLocation = vi.fn()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <FuelIntelligence
        onViewStation={vi.fn()}
        onChooseLocation={onChooseLocation}
      />
    </QueryClientProvider>,
  );
}

function makeEmptyResponse() {
  return {
    query: "cheapest petrol",
    intent: null,
    intent_source: "fallback" as const,
    answer_source: "fallback" as const,
    needs_location: false,
    answer: "No stations matched.",
    recommendations: [],
  };
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  geo = installGeoMock();
  requestMock.mockReset();
  requestMock.mockResolvedValue(makeEmptyResponse());
});

afterEach(() => {
  useMapStore.getState().stopLocationWatch();
  removeGeoMock();
  vi.restoreAllMocks();
});

describe("Fuel AI manual-location flow (shared location owner)", () => {
  it("offers 'Choose a location' next to 'Share my location' and delegates it", async () => {
    const onChooseLocation = vi.fn();
    renderPanel(onChooseLocation);

    fireEvent.change(screen.getByLabelText("Ask Fuel AI"), {
      target: { value: "cheapest petrol" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask fuel ai/i }));
    await screen.findByText(/I need your location/i);

    expect(
      screen.getByRole("button", { name: /share my location/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /choose a location/i }));
    expect(onChooseLocation).toHaveBeenCalledTimes(1);

    // Delegation is pure UI — no geolocation side effects from the panel.
    expect(geo.calls.getCurrentPosition).toBe(0);
    expect(geo.calls.watchPosition).toBe(0);
  });

  it("answers a parked question with the MANUAL location the user picked", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText("Ask Fuel AI"), {
      target: { value: "cheapest petrol" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask fuel ai/i }));
    await screen.findByText(/I need your location/i);
    expect(requestMock).not.toHaveBeenCalled();

    // The user picks Kaduna through the shared picker → the page stores it
    // via the store's single owner (what the panel is wired to consume).
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({
        query: "cheapest petrol",
        latitude: KADUNA.latitude,
        longitude: KADUNA.longitude,
      }),
    );

    // Zero geolocation calls: the manual path never touches GPS.
    expect(geo.calls.getCurrentPosition).toBe(0);
    expect(geo.calls.watchPosition).toBe(0);

    // The panel labels the location honestly — never GPS/live tracking.
    expect(
      screen.getByText(/Using selected location — Kaduna, Kaduna State, Nigeria/i),
    ).toBeInTheDocument();
  });

  it("shows the manual-location indicator when one is already active", () => {
    act(() => {
      useMapStore.getState().setManualLocation(KADUNA, KADUNA_LABEL);
    });
    renderPanel();

    expect(
      screen.getByText(/Using selected location — Kaduna, Kaduna State, Nigeria/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/live tracking|GPS/i)).toBeNull();
  });
});
