/**
 * Tests for the station provenance badge (Phase 4/19).
 *
 * The badge must reflect the ACTUAL database status — seed data is shown as
 * "Unverified Demo Data", never as verified. Labels come from the backend
 * values via the shared label maps, not hard-coded per station.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StationProvenanceBadge } from "@/components/stations/StationProvenanceBadge";
import {
  DATA_SOURCE_LABELS,
  VERIFICATION_STATUS_LABELS,
} from "@/types/station";

describe("StationProvenanceBadge", () => {
  it("shows Verified for verified stations", () => {
    render(
      <StationProvenanceBadge
        verificationStatus="verified"
        dataSource="official"
      />,
    );
    expect(screen.getByText("Verified")).toBeTruthy();
  });

  it("shows Awaiting Verification for pending stations", () => {
    render(
      <StationProvenanceBadge
        verificationStatus="pending"
        dataSource="community"
      />,
    );
    expect(screen.getByText("Awaiting Verification")).toBeTruthy();
  });

  it("shows Unverified Demo Data for seed rows — never verified", () => {
    render(
      <StationProvenanceBadge
        verificationStatus="unverified"
        dataSource="seed"
      />,
    );
    expect(screen.getByText("Unverified Demo Data")).toBeTruthy();
    expect(screen.queryByText("Verified")).toBeNull();
  });

  it("shows plain Unverified for non-seed unverified rows", () => {
    render(
      <StationProvenanceBadge
        verificationStatus="unverified"
        dataSource="imported"
      />,
    );
    expect(screen.getByText("Unverified")).toBeTruthy();
  });

  it("shows Rejected for rejected rows", () => {
    render(
      <StationProvenanceBadge
        verificationStatus="rejected"
        dataSource="community"
      />,
    );
    expect(screen.getByText("Rejected")).toBeTruthy();
  });

  it("renders the compact variant without crashing", () => {
    render(
      <StationProvenanceBadge
        verificationStatus="unverified"
        dataSource="seed"
        compact
      />,
    );
    expect(screen.getByText("Unverified Demo Data")).toBeTruthy();
  });

  it("label maps cover every backend enum value", () => {
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
