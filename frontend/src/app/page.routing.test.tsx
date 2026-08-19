/**
 * Refresh / direct-entry routing for the finder's five destinations.
 *
 * The destinations (`/map`, `/stations`, `/ai`, `/report`, `/account`) are
 * tabs of a single shell served by app/page.tsx. The URL is the source of
 * truth: on hard refresh or direct address-bar entry, next.config.mjs rewrites
 * each path to `/` and the shell restores the matching tab from the pathname.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderPage from "@/app/page";
import type { StationItem } from "@/hooks/useStations";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";
import { installViewport, restoreViewport } from "@/test/viewport";
import { mockPathname } from "../../vitest.setup";

vi.mock("@/components/map/StationMap", () => {
  const React = require("react") as typeof import("react");
  function StationMapMock(props: {
    onSelect?: (id: string) => void;
    items?: Array<{ id: string }>;
  }) {
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
    fetchReports: vi.fn(),
  };
});

const mockedStations = vi.mocked(api.fetchAllStations);
const mockedFavorites = vi.mocked(api.fetchFavorites);
const mockedReports = vi.mocked(api.fetchReports);

function makeStation(id: string, name: string): StationItem {
  return {
    id,
    name,
    brand: "NNPC",
    address: "Wuse 2",
    city: "Abuja",
    state: "FCT",
    phone: null,
    latitude: 9.07,
    longitude: 7.48,
    is_active: true,
    data_source: "seed",
    verification_status: "verified",
    verified_at: null,
    last_verified_at: null,
    source_id: null,
    fuel_types: [{ code: "PMS", name: "Petrol (PMS)" }],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}

const STATION = makeStation("st-1", "Wuse Filling Station");

let client: QueryClient;
let geo: GeoMock;

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <FinderPage />
    </QueryClientProvider>,
  );
}

function nav() {
  return screen.getByRole("navigation", { name: /main/i });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  geo = installGeoMock();
  installViewport(390);
  mockPathname("/");

  mockedStations.mockResolvedValue({
    items: [STATION],
    total: 1,
    page: 1,
    page_size: 100,
  });
  mockedFavorites.mockResolvedValue({ items: [], total: 0 });
  mockedReports.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
});

afterEach(() => {
  useMapStore.getState().stopLocationWatch();
  removeGeoMock();
  restoreViewport();
  mockPathname("/");
  vi.restoreAllMocks();
});

describe.each([
  ["/map", "Map"],
  ["/stations", "Stations"],
  ["/ai", "AI Assistant"],
  ["/account", "Account"],
] as const)("direct entry to %s", (path, label) => {
  it(`restores the ${label} tab on refresh without redirecting home`, async () => {
    // Simulate a hard refresh / direct address-bar entry: the pathname is the
    // destination before the shell mounts.
    mockPathname(path);
    renderPage();
    await screen.findByTestId("station-map-mock");

    // The URL stays on the destination (we never push/replace away from it).
    expect(window.location.pathname).toBe(path);

    // The matching nav destination is marked active. The Stations tab's
    // accessible name includes the count badge ("1Stations"), so match the
    // tab label by substring (consistent with the rest of the suite).
    const tabButton = within(nav()).getByRole("button", {
      name: new RegExp(label, "i"),
    });
    await waitFor(() =>
      expect(tabButton).toHaveAttribute("aria-current", "page"),
    );
  });
});

describe("tab navigation writes to the URL", () => {
  it("updates the address bar when switching tabs, keeping the map mounted", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    expect(window.location.pathname).toBe("/");

    fireEvent.click(within(nav()).getByRole("button", { name: /stations/i }));
    await waitFor(() => expect(window.location.pathname).toBe("/stations"));
    // The map is never unmounted by a tab switch.
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();

    fireEvent.click(within(nav()).getByRole("button", { name: /ai assistant/i }));
    await waitFor(() => expect(window.location.pathname).toBe("/ai"));
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();
  });

  it("returns to /map when a surface is dismissed", async () => {
    mockPathname("/stations");
    renderPage();
    await screen.findByTestId("station-map-mock");

    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(window.location.pathname).toBe("/map"));
  });
});
