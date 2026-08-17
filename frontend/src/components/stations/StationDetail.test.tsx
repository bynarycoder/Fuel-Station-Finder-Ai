/**
 * STATION DETAILS — the screen a driver lands on after picking a station.
 *
 * These lock the reference's structure and, more importantly, its honesty
 * rules:
 *
 *  1. the top bar is Back · Share · Favourite;
 *  2. "Get Directions" is the primary action and points at a real maps URL
 *     built from the station's own coordinates;
 *  3. "Report a Price" is present but secondary, and prompts sign-in for
 *     anonymous users instead of opening a form they cannot submit;
 *  4. Services / Opening hours are rendered ONLY from real data — a station
 *     without them shows no section at all, and nothing is invented.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StationDetail } from "@/components/stations/StationDetail";
import * as api from "@/services/api";
import type { Station } from "@/types/station";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, fetchStationReports: vi.fn() };
});

const STATION: Station = {
  id: "st-1",
  name: "Zaria Road",
  brand: "Total Energies",
  address: "Zaria Road",
  city: "Kaduna",
  state: "Kaduna",
  phone: null,
  latitude: 10.5207,
  longitude: 7.4386,
  is_active: true,
  data_source: "official",
  verification_status: "verified",
  verified_at: null,
  last_verified_at: null,
  source_id: null,
  fuel_types: [
    { code: "PMS", name: "Petrol (PMS)" },
    { code: "AGO", name: "Diesel (AGO)" },
  ],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

function renderDetail(overrides: Partial<Parameters<typeof StationDetail>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    station: STATION,
    userLocation: null,
    isAuthed: true,
    isFavorite: false,
    onToggleFavorite: vi.fn(),
    onReportPrice: vi.fn(),
    onRequireSignIn: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={client}>
      <StationDetail {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  vi.mocked(api.fetchStationReports).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
});

describe("top bar", () => {
  it("offers Back, Share and Favourite", () => {
    renderDetail();
    expect(screen.getByRole("button", { name: /back to stations/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^share /i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add .* to favourites/i }),
    ).toBeInTheDocument();
  });

  it("Back closes the screen", () => {
    const props = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /back to stations/i }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("primary actions", () => {
  it("makes Get Directions the primary action, pointing at real coordinates", () => {
    renderDetail();
    const directions = screen.getByRole("link", { name: /get driving directions/i });
    expect(directions).toHaveAttribute(
      "href",
      expect.stringContaining("10.5207"),
    );
    expect(directions).toHaveAttribute("href", expect.stringContaining("7.4386"));
    // Primary = the brand-green fill, not a bordered/ghost treatment.
    expect(directions.className).toContain("bg-action");
  });

  it("keeps Report a Price available, and asks anonymous users to sign in", () => {
    const props = renderDetail({ isAuthed: false });
    fireEvent.click(screen.getByRole("button", { name: /report a price/i }));
    expect(props.onRequireSignIn).toHaveBeenCalled();
    expect(props.onReportPrice).not.toHaveBeenCalled();
  });
});

describe("data honesty", () => {
  it("shows no Services or Opening hours section when the API has none", () => {
    renderDetail();
    expect(screen.queryByText(/station services/i)).toBeNull();
    expect(screen.queryByText(/opening hours/i)).toBeNull();
  });

  it("renders them when — and only when — the station really carries them", () => {
    renderDetail({
      station: {
        ...STATION,
        services: ["restroom", "atm"],
        opening_hours: "6:00 AM – 10:00 PM",
        is_open_now: true,
      },
    });
    expect(screen.getByText(/station services/i)).toBeInTheDocument();
    expect(screen.getByText("Restroom")).toBeInTheDocument();
    expect(screen.getByText("ATM")).toBeInTheDocument();
    expect(screen.getByText(/opening hours/i)).toBeInTheDocument();
    expect(screen.getByText("6:00 AM – 10:00 PM")).toBeInTheDocument();
    expect(screen.getByText(/open now/i)).toBeInTheDocument();
  });
});
