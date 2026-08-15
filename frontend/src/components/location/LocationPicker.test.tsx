/**
 * LocationPicker tests — the desktop manual-location fallback surface.
 *
 * Contracts under test:
 * - the picker searches through the BACKEND proxy (no third-party host, no
 *   coordinates in the request);
 * - results are listed and the FIRST result is NEVER auto-selected — the
 *   "Use this location" action stays disabled until the user explicitly
 *   clicks a result;
 * - confirming returns the selected coordinates + label (a real provider
 *   place, never invented/defaulted);
 * - dragging the map marker updates the coordinates and refreshes the label
 *   through the backend reverse-geocode endpoint;
 * - search errors render a friendly message (never raw provider errors);
 * - the picker NEVER touches navigator.geolocation.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocationPicker, type PickedLocation } from "@/components/location/LocationPicker";
import * as api from "@/services/api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, searchLocations: vi.fn(), reverseGeocode: vi.fn() };
});

// The picker's Leaflet map is lazy-loaded; tests stub it with a tiny surface
// whose button simulates the draggable marker's dragend event.
vi.mock("@/components/location/LocationMap", () => ({
  default: ({
    latitude,
    longitude,
    onMove,
  }: {
    latitude: number;
    longitude: number;
    onMove: (lat: number, lng: number) => void;
  }) => (
    <div data-testid="location-map-mock">
      <button
        type="button"
        onClick={() => onMove(latitude + 0.001, longitude + 0.001)}
      >
        drag marker
      </button>
      <span>
        {latitude},{longitude}
      </span>
    </div>
  ),
}));

const searchMock = vi.mocked(api.searchLocations);
const reverseMock = vi.mocked(api.reverseGeocode);

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

function renderPicker(onConfirm: (loc: PickedLocation) => void = vi.fn()) {
  return render(
    <LocationPicker open onClose={vi.fn()} onConfirm={onConfirm} />,
  );
}

beforeEach(() => {
  searchMock.mockReset();
  reverseMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("search", () => {
  it("shows a search field, example place names and no preselected location", () => {
    renderPicker();
    expect(
      screen.getByLabelText(/search for a city, town or area/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search city, town, area…")).toBeInTheDocument();
    // Example place names are search TERMS, never coordinates.
    expect(screen.getByRole("button", { name: "Kaduna" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lagos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use this location/i })).toBeDisabled();
  });

  it("debounces the query and never auto-selects the first result", async () => {
    searchMock.mockResolvedValue({
      query: "Kaduna",
      results: [KADUNA_PLACE],
    });
    renderPicker();

    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });

    // Immediately after typing: searching, confirm still disabled.
    expect(await screen.findByText("Searching…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use this location/i })).toBeDisabled();

    // Debounced request resolves; the first result is listed but NOT chosen.
    const resultButton = await screen.findByRole("button", {
      name: /Kaduna, Kaduna State, Nigeria/i,
    });
    expect(resultButton).toBeInTheDocument();
    expect(resultButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /use this location/i })).toBeDisabled();
  });

  it("searches through the backend proxy — never a third-party geocoder", async () => {
    searchMock.mockResolvedValue({ query: "Lagos", results: [] });
    renderPicker();

    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Lagos" },
    });
    await waitFor(() => expect(searchMock).toHaveBeenCalledWith("Lagos"));
  });

  it("shows a friendly message when the search fails", async () => {
    searchMock.mockRejectedValue(new Error("Location search is busy right now. Try again in a moment."));
    renderPicker();

    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });

    expect(await screen.findByText(/search isn't working/i)).toBeInTheDocument();
    expect(screen.getByText(/busy right now/i)).toBeInTheDocument();
  });
});

describe("selection + confirmation", () => {
  it("selecting a result enables confirmation and returns its real coordinates + label", async () => {
    searchMock.mockResolvedValue({ query: "Kaduna", results: [KADUNA_PLACE] });
    reverseMock.mockResolvedValue(null);
    const onConfirm = vi.fn();
    renderPicker(onConfirm);

    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Kaduna, Kaduna State, Nigeria/i }),
    );

    // Selection shown with the label + map (the map is lazy-loaded, so wait).
    expect(screen.getByText(/selected location/i)).toBeInTheDocument();
    expect(await screen.findByTestId("location-map-mock")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: /use this location/i });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({
      latitude: 10.5264296,
      longitude: 7.4387398,
      label: "Kaduna, Kaduna State, Nigeria",
    });
  });

  it("dragging the marker updates the coordinates and the label (reverse geocode)", async () => {
    searchMock.mockResolvedValue({ query: "Kaduna", results: [KADUNA_PLACE] });
    reverseMock.mockResolvedValue({
      latitude: 10.5274296,
      longitude: 7.4397398,
      display_name: "Barnawa, Kaduna, Nigeria",
      name: "Barnawa",
      city: "Kaduna",
      state: "Kaduna State",
      country: "Nigeria",
      type: "neighbourhood",
    });
    const onConfirm = vi.fn();
    renderPicker(onConfirm);

    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Kaduna, Kaduna State, Nigeria/i }),
    );

    fireEvent.click(screen.getByRole("button", { name: /drag marker/i }));
    await screen.findByText(/Barnawa, Kaduna, Nigeria/i);

    fireEvent.click(screen.getByRole("button", { name: /use this location/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      latitude: 10.5274296,
      longitude: 7.4397398,
      label: "Barnawa, Kaduna, Nigeria",
    });
  });

  it("closing without confirming stores nothing", async () => {
    searchMock.mockResolvedValue({ query: "Kaduna", results: [KADUNA_PLACE] });
    const onConfirm = vi.fn();
    renderPicker(onConfirm);

    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });
    await screen.findByRole("button", { name: /Kaduna, Kaduna State, Nigeria/i });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("geolocation isolation", () => {
  it("mounting and interacting with the picker never calls navigator.geolocation", () => {
    const geolocationCalls = {
      getCurrentPosition: 0,
      watchPosition: 0,
    };
    const original = navigator.geolocation;
    const spy = {
      getCurrentPosition: vi.fn(() => {
        geolocationCalls.getCurrentPosition += 1;
      }),
      watchPosition: vi.fn(() => {
        geolocationCalls.watchPosition += 1;
        return 1;
      }),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: { ...original, ...spy },
      configurable: true,
    });

    renderPicker();
    fireEvent.change(screen.getByLabelText(/search for a city, town or area/i), {
      target: { value: "Kaduna" },
    });

    expect(geolocationCalls.getCurrentPosition).toBe(0);
    expect(geolocationCalls.watchPosition).toBe(0);

    Object.defineProperty(navigator, "geolocation", {
      value: original,
      configurable: true,
    });
  });
});
