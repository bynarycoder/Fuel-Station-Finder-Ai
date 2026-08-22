/**
 * StationCard — the product's primary decision unit.
 *
 * These are honesty + hierarchy tests:
 * - a price is shown ONLY when a real report carried one; otherwise the card
 *   says "No recent price" rather than implying free/zero/unknown pricing;
 * - provenance and verification remain two separate, faithful facts;
 * - availability is never claimed without evidence ("Not reported");
 * - the secondary controls (favourite, Directions) are real, separately
 *   labelled controls — not nested inside the card's title button, which was
 *   the previous implementation's keyboard trap.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StationCard } from "@/components/stations/StationCard";
import { summariseReports } from "@/lib/stationSummary";
import type { StationItem } from "@/hooks/useStations";
import type { FuelReport } from "@/types/report";

const NOW = new Date().toISOString();

function makeStation(overrides: Partial<StationItem> = {}): StationItem {
  return {
    id: "st-1",
    name: "A.A. Rano",
    brand: "A.A. Rano",
    address: "12 Ikorodu Road",
    city: "Lagos",
    state: "Lagos",
    phone: null,
    latitude: 6.52,
    longitude: 3.37,
    is_active: true,
    data_source: "imported",
    verification_status: "unverified",
    verified_at: null,
    last_verified_at: null,
    source_id: "osm-1",
    fuel_types: [
      { code: "PMS", name: "Petrol (PMS)" },
      { code: "AGO", name: "Diesel (AGO)" },
    ],
    created_at: NOW,
    updated_at: NOW,
    distance_meters: 2100,
    ...overrides,
  };
}

function makeReport(overrides: Partial<FuelReport> = {}): FuelReport {
  return {
    id: "r-1",
    station: { id: "st-1", name: "A.A. Rano", brand: "A.A. Rano" },
    reported_by: { id: "u-1", full_name: "Driver" },
    fuel_type: { code: "PMS", name: "Petrol (PMS)" },
    price_per_litre: 850,
    queue_length: "short",
    photo_url: null,
    notes: null,
    status: "verified",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function renderCard(
  props: Partial<React.ComponentProps<typeof StationCard>> = {},
  reports: FuelReport[] = [],
) {
  const onSelect = vi.fn();
  const onToggleFavorite = vi.fn();
  render(
    <StationCard
      station={makeStation()}
      summary={summariseReports(reports)}
      userLocation={{ latitude: 6.5, longitude: 3.35 }}
      isSelected={false}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
      {...props}
    />,
  );
  return { onSelect, onToggleFavorite };
}

describe("StationCard — the six questions", () => {
  it("answers what / where / what fuel / how much", () => {
    renderCard({}, [makeReport()]);

    expect(screen.getByText("A.A. Rano")).toBeInTheDocument();
    expect(screen.getByText("2.1 km")).toBeInTheDocument();
    expect(screen.getByText("PMS")).toBeInTheDocument();
    expect(screen.getByText("₦850")).toBeInTheDocument();
  });

  it("shows report freshness so the user knows if it is current", () => {
    renderCard({}, [makeReport()]);
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });
});

describe("StationCard — honesty", () => {
  it("never invents a price when no report exists", () => {
    renderCard({}, []);

    expect(screen.getByTestId("price-unavailable")).toHaveTextContent(
      "No recent price",
    );
    expect(screen.queryByText(/₦/)).toBeNull();
    expect(screen.getByText("No price reports yet")).toBeInTheDocument();
  });

  it("never claims availability without a report backing it", () => {
    renderCard({}, []);

    // Both listed fuels render, but as "Not reported" — not "Unavailable".
    expect(screen.getByTitle("PMS: Not reported")).toBeInTheDocument();
    expect(screen.getByTitle("AGO: Not reported")).toBeInTheDocument();
  });

  it("marks a fuel available only when a real priced report says so", () => {
    renderCard({}, [makeReport()]);

    expect(screen.getByTitle("PMS: Available")).toBeInTheDocument();
    // AGO had no report, so it stays honest.
    expect(screen.getByTitle("AGO: Not reported")).toBeInTheDocument();
  });

  it("keeps data source and verification status as separate facts", () => {
    renderCard();

    expect(screen.getByTestId("station-data-source")).toHaveTextContent("Imported");
    expect(screen.getByTestId("station-verification-status")).toHaveTextContent(
      "Unverified",
    );
  });

  it("shows a verified station as verified without changing its source", () => {
    renderCard({
      station: makeStation({
        data_source: "official",
        verification_status: "verified",
      }),
    });

    expect(screen.getByTestId("station-data-source")).toHaveTextContent("Official");
    expect(screen.getByTestId("station-verification-status")).toHaveTextContent(
      "Verified",
    );
  });
});

describe("StationCard — interaction", () => {
  it("selects the station from the title and from View", () => {
    const { onSelect } = renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: /A.A. Rano — view station details/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith("st-1");
  });

  it("exposes favourite as its own labelled, toggleable control", () => {
    const { onToggleFavorite, onSelect } = renderCard();

    const fav = screen.getByRole("button", { name: /add .* to favourites/i });
    expect(fav).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(fav);

    expect(onToggleFavorite).toHaveBeenCalledWith("st-1");
    // Toggling a favourite must NOT also select the station.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders Directions as a real link to the station's exact coordinates", () => {
    renderCard();

    const link = screen.getByRole("link", { name: /get driving directions/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("destination=6.52%2C3.37");
  });

  it("marks the nearest station and exposes selection to assistive tech", () => {
    const { container } = render(
      <StationCard
        station={makeStation()}
        summary={summariseReports([])}
        userLocation={null}
        isSelected
        isClosest
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Closest to you")).toBeInTheDocument();
    const card = container.querySelector('[data-testid="station-card"]')!;
    expect(card).toHaveAttribute("aria-current", "true");
    expect(within(card as HTMLElement).getByText("A.A. Rano")).toBeInTheDocument();
  });
});
