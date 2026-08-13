/**
 * Tests for the "My reports" panel (Phase 10): pending / verified / rejected
 * states and the rejection-reason message, plus loading/error states.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MyReports } from "@/components/reports/MyReports";
import type { FuelReport } from "@/types/report";

function makeReport(
  id: string,
  overrides: Partial<FuelReport> = {},
): FuelReport {
  return {
    id,
    station: { id: "s1", name: "NNPC Retail Ikeja", brand: "NNPC" },
    reported_by: { id: "u1", full_name: "Tunde" },
    fuel_type: { code: "PMS", name: "Petrol (PMS)" },
    price_per_litre: 650,
    queue_length: "short",
    photo_url: null,
    notes: "PMS available",
    status: "pending",
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    ai_confidence_score: null,
    reviewed_at: null,
    rejection_reason: null,
    ...overrides,
  };
}

describe("MyReports", () => {
  it("shows the pending state message", () => {
    render(
      <MyReports
        reports={[makeReport("r1", { status: "pending" })]}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(/awaiting verification/i)).toBeTruthy();
    expect(screen.getByText(/Pending verification/i)).toBeTruthy();
  });

  it("shows the verified state message", () => {
    render(
      <MyReports
        reports={[makeReport("r1", { status: "verified" })]}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
      />,
    );
    // The status pill and the confirmation message both say "Verified".
    expect(screen.getAllByText(/Verified/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/thanks for helping other drivers/i)).toBeTruthy();
  });

  it("shows the rejected state with the reviewer's reason", () => {
    render(
      <MyReports
        reports={[
          makeReport("r1", {
            status: "rejected",
            rejection_reason: "Image does not clearly show the station.",
          }),
        ]}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(/Rejected/i)).toBeTruthy();
    expect(
      screen.getByText(/Image does not clearly show the station\./i),
    ).toBeTruthy();
  });

  it("does not show a rejection reason for non-rejected reports", () => {
    render(
      <MyReports
        reports={[makeReport("r1", { status: "pending" })]}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByText(/Not accepted/i)).toBeNull();
  });

  it("shows a loading state", () => {
    render(
      <MyReports reports={[]} isLoading isError={false} onRetry={() => {}} />,
    );
    expect(screen.getByText(/Loading your reports/i)).toBeTruthy();
  });

  it("shows an error state and calls onRetry", () => {
    const onRetry = vi.fn();
    render(
      <MyReports reports={[]} isLoading={false} isError onRetry={onRetry} />,
    );
    expect(screen.getByText(/Couldn't load your reports/i)).toBeTruthy();
    screen.getByText("Try again").click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state", () => {
    render(
      <MyReports reports={[]} isLoading={false} isError={false} onRetry={() => {}} />,
    );
    expect(screen.getByText(/haven't submitted any reports/i)).toBeTruthy();
  });
});
