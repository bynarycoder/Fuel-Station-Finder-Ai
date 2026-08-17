/**
 * MAP-FIRST HOME CONTRACT.
 *
 * The redesign's central claim is a hierarchy, not a colour:
 *
 *     Header → Search → Fuel filters → Compact actions → MAP → sheet → nav
 *
 * jsdom has no layout engine, so (as everywhere in this codebase) these are
 * STRUCTURAL assertions: what is mounted, in what order, with what role, and
 * how each control is themed. Each one encodes something the spec calls out:
 *
 *  1. the seven Home bands exist exactly once, in the specified order;
 *  2. the map is a sibling of the sheet — the sheet OVERLAYS the map instead
 *     of pushing it off-screen, and the map never unmounts when it expands;
 *  3. the collapsed sheet exposes the station count and a way to expand;
 *  4. all five fuel filters (CNG included) are reachable at 320 px inside a
 *     horizontally scrollable rail, while the page itself never scrolls
 *     sideways;
 *  5. "Near me" is the orange proximity action and "Browse all" the
 *     dark-green supporting one;
 *  6. the map's floating controls are lifted by exactly the sheet's own snap
 *     heights (the literals in page.tsx and SHEET_SNAP_PERCENT cannot drift).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinderPage from "@/app/page";
import { SHEET_PEEK_SHORT_PERCENT, SHEET_SNAP_PERCENT } from "@/components/ui/Sheet";
import type { StationItem } from "@/hooks/useStations";
import * as api from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";
import {
  BREAKPOINTS,
  installViewport,
  restoreViewport,
} from "@/test/viewport";

const mapProbe = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  controlsClassName: [] as string[],
  reset() {
    this.mounts = 0;
    this.unmounts = 0;
    this.controlsClassName = [];
  },
}));

vi.mock("@/components/map/StationMap", () => {
  const React = require("react") as typeof import("react");
  function StationMapMock(props: { controlsClassName?: string }) {
    React.useEffect(() => {
      mapProbe.mounts += 1;
      return () => {
        mapProbe.unmounts += 1;
      };
    }, []);
    mapProbe.controlsClassName.push(props.controlsClassName ?? "");
    return React.createElement("div", { "data-testid": "station-map-mock" });
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
    brand: "Total Energies",
    address: "Zaria Road",
    city: "Kaduna",
    state: "Kaduna",
    phone: null,
    latitude: 10.52,
    longitude: 7.44,
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
  installViewport(BREAKPOINTS.mobile);
  mapProbe.reset();

  mockedStations.mockResolvedValue({
    items: [makeStation("st-1", "Zaria Road"), makeStation("st-2", "Ahmadu Bello Way")],
    total: 2,
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

/** Document order helper: is `a` before `b` in the DOM? */
function isBefore(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

/* ------------------------------------------------------------------------ */
/* 1. The Home bands, in the specified order                                 */
/* ------------------------------------------------------------------------ */
describe("map-first Home composition", () => {
  it("stacks header → search → fuel filters → actions → map → nav", async () => {
    renderPage();
    const map = await screen.findByTestId("station-map-mock");

    const header = screen.getByRole("banner");
    // The mobile band is the LAST search field / chip rail in the document
    // (the desktop rail renders the same components above it).
    const searches = screen.getAllByRole("searchbox", {
      name: /search stations or ask/i,
    });
    const search = searches[searches.length - 1];
    const filters = screen.getAllByRole("group", { name: /filter by fuel type/i }).at(-1)!;
    const nearMe = screen.getAllByRole("button", { name: /^near me$/i }).at(-1)!;
    const nav = screen.getByRole("navigation", { name: /main/i });

    expect(isBefore(header, search)).toBe(true);
    expect(isBefore(search, filters)).toBe(true);
    expect(isBefore(filters, nearMe)).toBe(true);
    expect(isBefore(nearMe, map)).toBe(true);
    expect(isBefore(map, nav)).toBe(true);
  });

  it("overlays the station sheet on the map instead of replacing it", async () => {
    renderPage();
    const map = await screen.findByTestId("station-map-mock");

    const mapSection = screen.getByRole("region", { name: /station map/i });
    expect(mapSection).toContainElement(map);

    // The sheet lives inside the same section — i.e. on top of the map.
    const grabber = screen.getByRole("button", { name: /drag or use arrow keys/i });
    expect(mapSection).toContainElement(grabber);

    // Expanding it must not remount the map (a remount is what produced
    // Leaflet's `flyTo(NaN, NaN)` crash).
    fireEvent.keyDown(grabber, { key: "ArrowUp" });
    await waitFor(() => expect(mapProbe.controlsClassName.length).toBeGreaterThan(1));
    expect(mapProbe.mounts - mapProbe.unmounts).toBe(1);
    expect(mapProbe.mounts).toBe(1);
  });
});

/* ------------------------------------------------------------------------ */
/* 2 + 3. The collapsible station sheet                                      */
/* ------------------------------------------------------------------------ */
describe("station bottom sheet", () => {
  it("shows the list title, the station count and a way to expand", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const mapSection = screen.getByRole("region", { name: /station map/i });
    const sheet = within(mapSection);

    expect(await sheet.findByRole("heading", { name: /all stations/i })).toBeVisible();
    // The count is a compact badge ("2") with the noun exposed to screen
    // readers only, so match on the element's full accessible text.
    await waitFor(() =>
      expect(
        sheet.getByText(
          (_, el) => el?.textContent?.replace(/\s+/g, " ").trim() === "2 stations found",
        ),
      ).toBeInTheDocument(),
    );
    expect(sheet.getByRole("button", { name: /see all/i })).toBeInTheDocument();
  });

  it("swaps 'See all' for 'Show map' once expanded, so the map is one tap away", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");
    const mapSection = screen.getByRole("region", { name: /station map/i });

    fireEvent.click(within(mapSection).getByRole("button", { name: /see all/i }));

    const showMap = await within(mapSection).findByRole("button", {
      name: /show map/i,
    });
    fireEvent.click(showMap);
    await waitFor(() =>
      expect(
        within(mapSection).getByRole("button", { name: /see all/i }),
      ).toBeInTheDocument(),
    );
  });

  it("gives a short viewport more map by shrinking the collapsed sheet", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    // A 320x640 phone: the chrome is fixed (44 px touch targets), so the
    // collapsed sheet is what has to give. Both the sheet and the control
    // offset carry the `shorty:` variant, and they must agree.
    const sheet = screen
      .getByRole("button", { name: /drag or use arrow keys/i })
      .closest("section")!;
    expect(sheet.className).toContain(`h-[${SHEET_SNAP_PERCENT.peek}%]`);
    expect(sheet.className).toContain(`shorty:h-[${SHEET_PEEK_SHORT_PERCENT}%]`);
    expect(mapProbe.controlsClassName.at(-1)).toContain(
      `shorty:bottom-[calc(${SHEET_PEEK_SHORT_PERCENT}%+0.75rem)]`,
    );
  });

  it("lifts the map controls by exactly the sheet's own snap heights", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const offset = () =>
      /bottom-\[calc\((\d+)%/.exec(mapProbe.controlsClassName.at(-1) ?? "")?.[1];

    expect(Number(offset())).toBe(SHEET_SNAP_PERCENT.peek);

    const grabber = screen.getByRole("button", { name: /drag or use arrow keys/i });
    fireEvent.keyDown(grabber, { key: "ArrowUp" });
    await waitFor(() => expect(Number(offset())).toBe(SHEET_SNAP_PERCENT.half));
  });
});

/* ------------------------------------------------------------------------ */
/* 4. Fuel filters survive the narrowest supported phone                     */
/* ------------------------------------------------------------------------ */
describe("fuel filters at 320px", () => {
  it("keeps all five filters — CNG included — in a scrollable rail", async () => {
    installViewport(320);
    renderPage();
    await screen.findByTestId("station-map-mock");

    const rail = screen.getAllByRole("group", { name: /filter by fuel type/i }).at(-1)!;
    const labels = within(rail)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(labels).toEqual(["All", "Petrol", "Diesel", "LPG", "CNG"]);

    // The rail scrolls; the PAGE must not.
    expect(rail.className).toContain("overflow-x-auto");
    expect(document.querySelector(".flex.h-\\[100dvh\\]")?.className).toContain(
      "overflow-hidden",
    );
  });

  it("selecting a filter writes to the shared store, not a second filter system", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const rail = screen.getAllByRole("group", { name: /filter by fuel type/i }).at(-1)!;
    fireEvent.click(within(rail).getByRole("button", { name: /compressed natural gas/i }));

    await waitFor(() => expect(useMapStore.getState().filters.fuelType).toBe("CNG"));
  });
});

/* ------------------------------------------------------------------------ */
/* 5. Visual hierarchy of the two map actions                                */
/* ------------------------------------------------------------------------ */
describe("map actions", () => {
  it("renders Near me in orange and Browse all in dark green", async () => {
    renderPage();
    await screen.findByTestId("station-map-mock");

    const nearMe = screen.getAllByRole("button", { name: /^near me$/i }).at(-1)!;
    const browseAll = screen.getAllByRole("button", { name: /browse all/i }).at(-1)!;

    expect(nearMe.className).toContain("bg-accent-400");
    expect(browseAll.className).toContain("bg-slab");
  });
});
