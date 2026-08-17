/**
 * MOBILE REGRESSION SUITE — the finder must be usable one-handed on a phone.
 *
 * jsdom has no layout engine, so these tests assert *behavioural* invariants
 * (what is mounted, what a tap does, what the map is told) rather than pixel
 * geometry. Each one encodes a real mobile failure mode:
 *
 *  1. exactly ONE map surface at 360 / 390 / 414 / 430 / 768 / 1024 / 1440;
 *  2. never two AI surfaces at once (the mobile sheet and the desktop rail
 *     panel are resolved in JS — a CSS-only `lg:hidden` would leave a second,
 *     invisible dialog mounted and stealing focus);
 *  3. the map's floating controls stay ABOVE the bottom sheet at every snap
 *     (a fixed offset buried zoom/locate as soon as the sheet was dragged up);
 *  4. every mobile destination is reachable AND dismissible with one tap:
 *     Ask AI, station list, station details, community reports;
 *  5. opening/closing an overlay returns the user to the map, with the map
 *     never remounting (a remount is what produced `flyTo(NaN, NaN)`).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderPage from "@/app/page";
import { SHEET_SNAP_PERCENT } from "@/components/ui/Sheet";
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

/** Records map mounts and the control offset the page asks for. */
const mapProbe = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  controlsClassName: [] as string[],
  get mounted() {
    return this.mounts - this.unmounts;
  },
  reset() {
    this.mounts = 0;
    this.unmounts = 0;
    this.controlsClassName = [];
  },
}));

vi.mock("@/components/map/StationMap", () => {
  const React = require("react") as typeof import("react");
  function StationMapMock(props: {
    onSelect?: (id: string) => void;
    items?: Array<{ id: string }>;
    controlsClassName?: string;
  }) {
    React.useEffect(() => {
      mapProbe.mounts += 1;
      return () => {
        mapProbe.unmounts += 1;
      };
    }, []);
    mapProbe.controlsClassName.push(props.controlsClassName ?? "");
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

const PHONE_WIDTHS = [
  ["360px (small Android)", BREAKPOINTS.mobileSmall],
  ["390px (iPhone 13/14)", BREAKPOINTS.mobile],
  ["414px (iPhone 11/XR)", BREAKPOINTS.mobileLarge],
  ["430px (iPhone Pro Max)", BREAKPOINTS.mobileXl],
  ["768px (tablet portrait)", BREAKPOINTS.tablet],
] as const;

const ALL_WIDTHS = [
  ...PHONE_WIDTHS,
  ["1024px (laptop)", BREAKPOINTS.laptop],
  ["1440px (desktop)", BREAKPOINTS.desktop],
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
/* 1 + 2. One map, never a duplicate interaction surface                     */
/* ------------------------------------------------------------------------ */
describe.each(ALL_WIDTHS)("finder at %s", (_label, width) => {
  it("mounts exactly one map surface", async () => {
    installViewport(width);
    renderPage();
    await screen.findByTestId("station-map-mock");

    expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1);
    expect(mapProbe.mounted).toBe(1);
  });

  it("never mounts two AI surfaces at once", async () => {
    installViewport(width);
    renderPage();
    await screen.findByTestId("station-map-mock");

    // Open Fuel Intelligence through whichever affordance this width offers.
    const opener =
      screen.queryAllByRole("button", { name: /ai assistant/i })[0] ??
      screen.queryAllByRole("button", { name: /ask fuel intelligence/i })[0];
    expect(opener, "every width must expose a way to reach the AI").toBeTruthy();
    fireEvent.click(opener!);

    await waitFor(() =>
      expect(screen.getAllByTestId("fuel-intelligence").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByTestId("fuel-intelligence")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ */
/* 3. Map controls are never buried under the bottom sheet                   */
/* ------------------------------------------------------------------------ */
describe("map controls vs. the bottom sheet (mobile)", () => {
  function offsetPercent(className: string): number | null {
    const match = /bottom-\[calc\((\d+)%/.exec(className);
    return match ? Number(match[1]) : null;
  }

  it("raises the controls as the sheet is expanded, and lowers them again", async () => {
    installViewport(BREAKPOINTS.mobile);
    renderPage();
    await screen.findByTestId("station-map-mock");

    const atPeek = offsetPercent(mapProbe.controlsClassName.at(-1) ?? "");
    expect(atPeek).toBe(SHEET_SNAP_PERCENT.peek); // sheet's peek height

    const grabber = screen.getByRole("button", { name: /drag or use arrow keys/i });
    fireEvent.keyDown(grabber, { key: "ArrowUp" }); // peek -> half
    await waitFor(() =>
      expect(offsetPercent(mapProbe.controlsClassName.at(-1) ?? "")).toBe(
        SHEET_SNAP_PERCENT.half,
      ),
    );

    fireEvent.keyDown(grabber, { key: "ArrowUp" }); // half -> full
    await waitFor(() =>
      expect(offsetPercent(mapProbe.controlsClassName.at(-1) ?? "")).toBe(
        SHEET_SNAP_PERCENT.full,
      ),
    );

    fireEvent.keyDown(grabber, { key: "Escape" }); // back to peek
    await waitFor(() =>
      expect(offsetPercent(mapProbe.controlsClassName.at(-1) ?? "")).toBe(
        SHEET_SNAP_PERCENT.peek,
      ),
    );
  });

  it("keeps the desktop offset independent of the sheet", async () => {
    installViewport(BREAKPOINTS.desktop);
    renderPage();
    await screen.findByTestId("station-map-mock");
    expect(mapProbe.controlsClassName.at(-1)).toContain("lg:bottom-4");
  });
});

/* ------------------------------------------------------------------------ */
/* 4 + 5. Every mobile destination opens AND closes, map never remounts      */
/* ------------------------------------------------------------------------ */
describe("one-handed navigation (390px)", () => {
  beforeEach(() => installViewport(BREAKPOINTS.mobile));

  it("opens and closes Fuel Intelligence from the bottom nav", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    const mountsBefore = mapProbe.mounts;

    const nav = screen.getByRole("navigation", { name: /main/i });
    fireEvent.click(within(nav).getByRole("button", { name: /ai assistant/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("fuel-intelligence")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /close fuel intelligence/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Back on the map, and the map was never torn down.
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();
    expect(mapProbe.mounts).toBe(mountsBefore);
  });

  it("opens and closes station details from the station list", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    const mountsBefore = mapProbe.mounts;

    // The rail (desktop) and the sheet (mobile) both render a list; only one
    // is displayed at a time via CSS, so tap the first match.
    const cards = await screen.findAllByText("Wuse Filling Station");
    fireEvent.click(cards[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mapProbe.mounts).toBe(mountsBefore);
  });

  it("opens the account surface and returns to the map", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    const mountsBefore = mapProbe.mounts;

    const nav = screen.getByRole("navigation", { name: /main/i });
    fireEvent.click(within(nav).getByRole("button", { name: /account/i }));
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();
    expect(mapProbe.mounts).toBe(mountsBefore);
  });

  it("keeps the full station list reachable from the nearby sheet", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    const mountsBefore = mapProbe.mounts;

    fireEvent.click(screen.getByRole("button", { name: /^see all$/i }));
    // The sheet expands rather than navigating away from the map.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /drag or use arrow keys/i }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    expect(screen.getByTestId("station-map-mock")).toBeInTheDocument();
    expect(mapProbe.mounts).toBe(mountsBefore);
  });
});

/* ------------------------------------------------------------------------ */
/* 6. Rotating / resizing a phone never duplicates the map                   */
/* ------------------------------------------------------------------------ */
describe("resizing across phone widths", () => {
  it("keeps exactly one map from 360px to 430px and back", async () => {
    installViewport(BREAKPOINTS.mobileSmall);
    renderPage();
    await screen.findByTestId("station-map-mock");

    for (const width of [
      BREAKPOINTS.mobile,
      BREAKPOINTS.mobileLarge,
      BREAKPOINTS.mobileXl,
      BREAKPOINTS.tablet,
      BREAKPOINTS.mobileSmall,
    ]) {
      act(() => setViewportWidth(width));
      await waitFor(() =>
        expect(screen.getAllByTestId("station-map-mock")).toHaveLength(1),
      );
      expect(mapProbe.mounted).toBe(1);
    }
  });
});
