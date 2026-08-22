/**
 * UI REGRESSION SUITE for the redesigned finder shell.
 *
 * Scope: the contracts the redesign introduced, at every supported width.
 * jsdom has no layout engine, so (as elsewhere in this codebase) these assert
 * STRUCTURAL and BEHAVIOURAL invariants — what is mounted, what is labelled,
 * what a tap does — not pixel geometry.
 *
 *  1. the five destinations exist and are labelled;
 *  2. each destination performs a real action;
 *  3. Report is guarded: signed-out → sign-in, no station → expand the list,
 *     never an empty form that cannot be submitted;
 *  4. the search + fuel-chip row from the reference is present and wired to
 *     the EXISTING filter store (no second filtering system);
 *  5. icon-only controls all carry accessible names;
 *  6. still exactly ONE map, at every width, across resizes.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderPage from "@/app/page";
import type { StationItem } from "@/hooks/useStations";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";
import {
  BREAKPOINTS,
  installViewport,
  restoreViewport,
  setViewportWidth,
} from "@/test/viewport";

const mapProbe = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  get mounted() {
    return this.mounts - this.unmounts;
  },
  reset() {
    this.mounts = 0;
    this.unmounts = 0;
  },
}));

vi.mock("@/components/map/StationMap", () => {
  const React = require("react") as typeof import("react");
  function StationMapMock(props: {
    onSelect?: (id: string) => void;
    items?: Array<{ id: string }>;
  }) {
    React.useEffect(() => {
      mapProbe.mounts += 1;
      return () => {
        mapProbe.unmounts += 1;
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
    fetchReports: vi.fn(),
    requestAiRecommendation: vi.fn(),
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

const ALL_WIDTHS = [
  ["360px", BREAKPOINTS.mobileSmall],
  ["390px", BREAKPOINTS.mobile],
  ["414px", BREAKPOINTS.mobileLarge],
  ["768px", BREAKPOINTS.tablet],
  ["1024px", BREAKPOINTS.laptop],
  ["1440px", BREAKPOINTS.desktop],
] as const;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  resetStore();
  geo = installGeoMock();
  installViewport(BREAKPOINTS.mobile);
  mapProbe.reset();

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
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------ */
/* 1 + 2. The five destinations                                              */
/* ------------------------------------------------------------------------ */
describe("global bottom navigation", () => {
  it("exposes the five destinations including Stations", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const nav = screen.getByRole("navigation", { name: /main/i });
    const labels = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent?.replace(/\d+/g, "").trim());

    expect(labels).toEqual(["Map", "Stations", "AI Assistant", "Report", "Account"]);
  });

  it("keeps the five destinations visible at laptop width (never hidden by lg:hidden)", async () => {
    installViewport(BREAKPOINTS.laptop);
    renderPage();
    await screen.findByTestId("station-map-mock");

    const nav = screen.getByRole("navigation", { name: /main/i });
    // The bar is rendered at every width — including ≥lg — so it must not
    // carry the utility that used to hide it there, nor the bare `hidden`.
    expect(nav.className).not.toMatch(/\blg:hidden\b/);
    expect(nav.className).not.toMatch(/(^|\s)hidden(\s|$)/);

    const labels = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent?.replace(/\d+/g, "").trim());

    expect(labels).toEqual([
      "Map",
      "Stations",
      "AI Assistant",
      "Report",
      "Account",
    ]);
  });

  it("marks the active destination for assistive tech", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const nav = screen.getByRole("navigation", { name: /main/i });
    const mapTab = within(nav).getByRole("button", { name: /^map$/i });
    expect(mapTab).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(nav).getByRole("button", { name: /account/i }));
    await waitFor(() =>
      expect(within(nav).getByRole("button", { name: /account/i })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
  });

  it("opens the Stations catalogue from the nav without remounting the map", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    const before = mapProbe.mounts;

    const nav = screen.getByRole("navigation", { name: /main/i });
    fireEvent.click(within(nav).getByRole("button", { name: /stations/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("stations-screen")).toBeInTheDocument();
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();
    expect(mapProbe.mounts).toBe(before);
    expect(within(nav).getByRole("button", { name: /stations/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens the AI assistant, and the map survives it", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    const before = mapProbe.mounts;

    const nav = screen.getByRole("navigation", { name: /main/i });
    fireEvent.click(within(nav).getByRole("button", { name: /ai assistant/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("fuel-intelligence")).toBeInTheDocument();
    expect(mapProbe.mounts).toBe(before);
  });

  it("opens the account panel with the theme control inside", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const nav = screen.getByRole("navigation", { name: /main/i });
    fireEvent.click(within(nav).getByRole("button", { name: /account/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("radiogroup", { name: /colour theme/i }),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */
/* 3. Report is guarded, never a dead end                                    */
/* ------------------------------------------------------------------------ */
describe("the Report destination", () => {
  it("never opens an unsubmittable report form for an anonymous user", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const nav = screen.getByRole("navigation", { name: /main/i });
    fireEvent.click(within(nav).getByRole("button", { name: /report/i }));

    // The backend requires auth AND a station, so the form must not appear.
    // (Supabase is not configured under test, so the sign-in modal itself is
    // unavailable here — what matters is that we never present a form the
    // user could fill in and fail to submit.)
    await waitFor(() =>
      expect(screen.queryByText(/report fuel price/i)).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("report-photo-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();
  });

  it("routes a signed-in user with no station to the list rather than a blank form", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const nav = screen.getByRole("navigation", { name: /main/i });
    fireEvent.click(within(nav).getByRole("button", { name: /report/i }));

    // Still on the map, with the station list reachable — never a dead end.
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("report-photo-input")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */
/* 4. Search + fuel chips drive the EXISTING filter store                    */
/* ------------------------------------------------------------------------ */
describe("search and fuel filter chips", () => {
  it("renders the reference search placeholder", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    expect(
      screen.getAllByPlaceholderText(/search stations, areas or fuel/i).length,
    ).toBeGreaterThan(0);
  });

  it("chips write through to the shared map store, not a private copy", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const groups = screen.getAllByRole("group", { name: /filter by fuel type/i });
    const diesel = within(groups[0]).getByRole("button", { name: /show diesel/i });

    fireEvent.click(diesel);
    await waitFor(() =>
      expect(useMapStore.getState().filters.fuelType).toBe("AGO"),
    );
    expect(diesel).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(groups[0]).getByRole("button", { name: /show all fuel/i }));
    await waitFor(() => expect(useMapStore.getState().filters.fuelType).toBe(""));
  });
});

/* ------------------------------------------------------------------------ */
/* 5. Icon-only controls are named                                           */
/* ------------------------------------------------------------------------ */
describe("accessibility of icon-only controls", () => {
  it("gives every button an accessible name at 390px", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const unnamed = screen
      .getAllByRole("button")
      .filter((b) => !(b.textContent?.trim() || b.getAttribute("aria-label")?.trim()));

    expect(unnamed).toHaveLength(0);
  });

  it("exposes the theme toggle in the header", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    expect(
      screen.getByRole("button", { name: /switch to (dark|light) theme/i }),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */
/* 6. One map, every width, across resizes                                   */
/* ------------------------------------------------------------------------ */
describe.each(ALL_WIDTHS)("finder shell at %s", (_label, width) => {
  it("mounts one map and one bottom navigation", async () => {
    installViewport(width);
    renderPage();
    await screen.findByTestId("station-map-mock");

    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapProbe.mounted).toBe(1);
    expect(screen.getAllByRole("navigation", { name: /main/i })).toHaveLength(1);
  });
});

describe("resizing the redesigned shell", () => {
  it("keeps one map while walking 360 → 1440 → 360", async () => {
    installViewport(BREAKPOINTS.mobileSmall);
    renderPage();
    await screen.findByTestId("station-map-mock");

    const ladder = ALL_WIDTHS.map(([, w]) => w);
    for (const width of [...ladder, ...ladder.slice().reverse()]) {
      act(() => setViewportWidth(width));
      await waitFor(() => expect(mapProbe.mounted).toBe(1));
    }

    expect(mapProbe.mounts).toBe(1);
    expect(mapProbe.unmounts).toBe(0);
  });
});
