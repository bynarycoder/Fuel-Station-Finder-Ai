/**
 * Tests for the Fuel Intelligence panel.
 *
 * These are honesty tests:
 * - Without a valid user location, the backend is NEVER called (no invented
 *   coordinates, no city fallback).
 * - A coarse GPS fix is rejected by the real geolocation hook, so no request
 *   is made with it.
 * - Prices that the backend didn't return are never rendered ("Price
 *   information is currently unavailable.").
 * - Provenance is rendered with the shared badge: imported/unverified stays
 *   imported/unverified — AI does not mean verified.
 * - Provider failures produce an error panel that says the regular finder is
 *   unaffected.
 * - "View Station" hands the real station id back to the page.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FuelIntelligence } from "@/components/ai/FuelIntelligence";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";
import type { AIRecommendResponse } from "@/types/ai";

let geo: GeoMock;

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    requestAiRecommendation: vi.fn(),
  };
});

const requestMock = vi.mocked(api.requestAiRecommendation);

const LAGOS_FIX = { latitude: 6.5244, longitude: 3.3792 };

function makeResponse(overrides: Partial<AIRecommendResponse> = {}): AIRecommendResponse {
  return {
    query: "cheapest petrol",
    intent: {
      fuel_type: "PMS",
      max_price: null,
      min_price: null,
      sort_preference: "price",
      require_verified: false,
      radius_meters: 5000,
    },
    intent_source: "fallback",
    answer_source: "fallback",
    needs_location: false,
    answer: "This station has one of the lowest recent petrol prices nearby.",
    recommendations: [
      {
        station: {
          id: "11111111-1111-1111-1111-111111111111",
          name: "OSM Petrol",
          brand: null,
          address: null,
          city: "Lagos",
          state: "Lagos",
          phone: null,
          latitude: LAGOS_FIX.latitude + 0.01,
          longitude: LAGOS_FIX.longitude,
          is_active: true,
          data_source: "imported",
          verification_status: "unverified",
          verified_at: null,
          last_verified_at: null,
          source_id: "osm-1",
          fuel_types: [{ code: "PMS", name: "Petrol (PMS)" }],
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-14T00:00:00Z",
          distance_meters: 1100,
        },
        score: 0.91,
        reason: "Lowest recent petrol price among nearby stations.",
        latest_price: null,
        latest_price_fuel_type: null,
        latest_price_reported_at: null,
        breakdown: {
          distance: 0.8,
          price: 0.5,
          verification: 0.25,
          freshness: 0.9,
          availability: 1.0,
        },
      },
    ],
    ...overrides,
  };
}

function resetStore() {
  useMapStore.setState({
    mode: "browse",
    filters: { q: "", brand: "", city: "", fuelType: "" },
    userLocation: null,
    locationStatus: "idle",
    locationMessage: null,
    radiusMeters: 5000,
    selectedStationId: null,
    favoritesOnly: false,
  });
}

function renderPanel(onViewStation = vi.fn()) {
  return render(<FuelIntelligence onViewStation={onViewStation} />);
}

function typeAndAsk(query: string) {
  fireEvent.change(screen.getByLabelText("Ask Fuel AI"), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: /ask fuel ai/i }));
}

beforeEach(() => {
  resetStore();
  geo = installGeoMock();
  requestMock.mockReset();
});

afterEach(() => {
  removeGeoMock();
  vi.restoreAllMocks();
});

describe("location honesty", () => {
  it("never calls the backend without a valid location", async () => {
    renderPanel();
    typeAndAsk("cheapest petrol");

    expect(
      await screen.findByText(/I need your location to find stations near you/i),
    ).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("share location uses the real GPS fix and then answers", async () => {
    requestMock.mockResolvedValue(makeResponse());
    renderPanel();
    typeAndAsk("cheapest petrol");

    await screen.findByText(/I need your location/i);
    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    act(() => geo.getCurrentSuccess(LAGOS_FIX.latitude, LAGOS_FIX.longitude, 20));

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({
        query: "cheapest petrol",
        latitude: LAGOS_FIX.latitude,
        longitude: LAGOS_FIX.longitude,
      }),
    );
    expect(useMapStore.getState().userLocation).toEqual(LAGOS_FIX);
  });

  it("rejects a coarse GPS fix and never sends it to the backend", async () => {
    requestMock.mockResolvedValue(makeResponse());
    renderPanel();
    typeAndAsk("cheapest petrol");
    await screen.findByText(/I need your location/i);

    fireEvent.click(screen.getByRole("button", { name: /share my location/i }));
    // First attempt: 50 km accuracy fix -> rejected by the real hook, which
    // retries with looser options; then the browser times out entirely.
    act(() => geo.getCurrentSuccess(LAGOS_FIX.latitude, LAGOS_FIX.longitude, 50_000));
    act(() => geo.getCurrentError(3));

    await waitFor(() =>
      expect(screen.getByText(/couldn't get your location in time/i)).toBeInTheDocument(),
    );
    expect(requestMock).not.toHaveBeenCalled();
    expect(useMapStore.getState().userLocation).toBeNull();
  });

  it("honours the backend needs_location safety net", async () => {
    requestMock.mockResolvedValue(
      makeResponse({ needs_location: true, intent: null, recommendations: [] }),
    );
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();
    typeAndAsk("petrol");

    expect(
      await screen.findByText(/I need your location to find stations near you/i),
    ).toBeInTheDocument();
  });
});

describe("result honesty", () => {
  it("renders imported/unverified labels unchanged and never invents a price", async () => {
    requestMock.mockResolvedValue(makeResponse());
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();
    typeAndAsk("cheapest petrol");

    await screen.findByTestId("ai-top-recommendation");
    expect(screen.getByTestId("station-data-source")).toHaveTextContent("Imported");
    expect(screen.getByTestId("station-verification-status")).toHaveTextContent(
      "Unverified",
    );
    // No price was returned -> the honest copy, not a made-up number.
    expect(screen.getByTestId("ai-price-unavailable")).toHaveTextContent(
      "Price information is currently unavailable.",
    );
    expect(screen.queryByText(/₦\d/)).toBeNull();
  });

  it("renders the reported price when the backend supplied one", async () => {
    requestMock.mockResolvedValue(
      makeResponse({
        recommendations: [
          {
            ...makeResponse().recommendations[0],
            latest_price: 850,
            latest_price_fuel_type: "PMS",
          },
        ],
      }),
    );
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();
    typeAndAsk("cheapest petrol");

    await screen.findByTestId("ai-top-recommendation");
    expect(screen.getByTestId("ai-price")).toHaveTextContent("₦850/L");
  });

  it("labels fallback answers as explained without AI", async () => {
    requestMock.mockResolvedValue(makeResponse({ answer_source: "fallback" }));
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();
    typeAndAsk("cheapest petrol");

    await screen.findByTestId("ai-top-recommendation");
    expect(screen.getByText(/explained without ai/i)).toBeInTheDocument();
  });

  it("shows the reason and answer from the backend verbatim", async () => {
    requestMock.mockResolvedValue(makeResponse());
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();
    typeAndAsk("cheapest petrol");

    await screen.findByTestId("ai-top-recommendation");
    expect(
      screen.getByText("Lowest recent petrol price among nearby stations."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This station has one of the lowest recent petrol prices nearby."),
    ).toBeInTheDocument();
  });

  it("View Station hands the station id to the page", async () => {
    const onViewStation = vi.fn();
    requestMock.mockResolvedValue(makeResponse());
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel(onViewStation);
    typeAndAsk("cheapest petrol");

    await screen.findByTestId("ai-top-recommendation");
    fireEvent.click(screen.getByRole("button", { name: /view station/i }));
    expect(onViewStation).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  it("shows an honest empty result when no stations match", async () => {
    requestMock.mockResolvedValue(
      makeResponse({
        answer: "I couldn't find a nearby station matching your request.",
        recommendations: [],
      }),
    );
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();
    typeAndAsk("cheapest petrol");

    expect(
      await screen.findByText("I couldn't find a nearby station matching your request."),
    ).toBeInTheDocument();
  });
});

describe("failure handling", () => {
  it("shows an error panel and confirms the regular finder is unaffected", async () => {
    requestMock.mockRejectedValue(new Error("Request to /ai/recommend failed (503)."));
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();
    typeAndAsk("cheapest petrol");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /regular station finder is unaffected/i,
    );
  });

  it("does not ask the AI continuously — only on explicit Ask", async () => {
    requestMock.mockResolvedValue(makeResponse());
    useMapStore.setState({ userLocation: LAGOS_FIX });
    renderPanel();

    expect(requestMock).not.toHaveBeenCalled();
    typeAndAsk("cheapest petrol");
    await screen.findByTestId("ai-top-recommendation");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
