/**
 * Regression tests for station provenance and verification display.
 *
 * `data_source` and `verification_status` are separate backend fields. The
 * shared badge must render both values faithfully in the list, detail, map
 * popup, and nearby-card call sites that use it.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StationProvenanceBadge } from "@/components/stations/StationProvenanceBadge";
import {
  DATA_SOURCE_LABELS,
  VERIFICATION_STATUS_LABELS,
  type StationDataSource,
} from "@/types/station";

function renderBadge(
  dataSource: StationDataSource,
  verificationStatus: "unverified" | "pending" | "verified" | "rejected",
) {
  return render(
    <StationProvenanceBadge
      dataSource={dataSource}
      verificationStatus={verificationStatus}
    />,
  );
}

function sourcePill() {
  return screen.getByTestId("station-data-source");
}

function verificationPill() {
  return screen.getByTestId("station-verification-status");
}

describe("StationProvenanceBadge", () => {
  it("shows Demo Data for seed rows", () => {
    renderBadge("seed", "unverified");

    expect(sourcePill()).toHaveTextContent("Demo Data");
    expect(verificationPill()).toHaveTextContent("Unverified");
    expect(sourcePill()).toHaveAttribute(
      "title",
      expect.stringContaining("Demo data bundled with the app"),
    );
  });

  it("shows Imported for imported rows and never labels them Demo Data", () => {
    renderBadge("imported", "pending");

    expect(sourcePill()).toHaveTextContent("Imported");
    expect(screen.queryByText("Demo Data")).toBeNull();
    expect(sourcePill()).toHaveAttribute(
      "title",
      expect.stringContaining("external station dataset, such as OpenStreetMap"),
    );
  });

  it("renders imported + unverified as two honest, independent badges", () => {
    renderBadge("imported", "unverified");

    expect(sourcePill()).toHaveTextContent(/^Imported$/);
    expect(verificationPill()).toHaveTextContent(/^Unverified$/);
    expect(verificationPill()).toHaveAttribute(
      "title",
      expect.stringContaining("not yet been independently verified by the app"),
    );
  });

  it("renders official + verified as Official and Verified", () => {
    renderBadge("official", "verified");

    expect(sourcePill()).toHaveTextContent("Official");
    expect(verificationPill()).toHaveTextContent("Verified");
  });

  it.each([
    ["government", "Government Source"],
    ["community", "Community Report"],
    ["partner", "Partner Data"],
    ["other", "Other Source"],
  ] as const)("renders %s data source as %s", (dataSource, label) => {
    renderBadge(dataSource, "unverified");

    expect(sourcePill()).toHaveTextContent(label);
    expect(verificationPill()).toHaveTextContent("Unverified");
  });

  it.each([
    ["pending", "Awaiting Verification"],
    ["rejected", "Rejected"],
  ] as const)("renders %s verification as %s", (status, label) => {
    renderBadge("community", status);

    expect(sourcePill()).toHaveTextContent("Community Report");
    expect(verificationPill()).toHaveTextContent(label);
  });

  it("renders the compact variant with both source and verification", () => {
    render(
      <StationProvenanceBadge
        dataSource="imported"
        verificationStatus="unverified"
        compact
      />,
    );

    expect(sourcePill()).toHaveTextContent("Imported");
    expect(verificationPill()).toHaveTextContent("Unverified");
  });

  it("keeps label maps aligned with every backend enum value", () => {
    expect(DATA_SOURCE_LABELS).toMatchObject({
      seed: "Demo Data",
      imported: "Imported",
      official: "Official",
      government: "Government Source",
      community: "Community Report",
    });
    expect(Object.keys(VERIFICATION_STATUS_LABELS).sort()).toEqual([
      "pending",
      "rejected",
      "unverified",
      "verified",
    ]);
    expect(Object.keys(DATA_SOURCE_LABELS).sort()).toEqual([
      "community",
      "government",
      "imported",
      "official",
      "other",
      "partner",
      "seed",
    ]);
  });
});
