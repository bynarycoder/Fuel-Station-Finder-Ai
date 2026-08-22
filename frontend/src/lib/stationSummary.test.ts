/**
 * Report summarisation — the layer that decides what a station card is allowed
 * to claim. These tests exist because every "helpful" inference here would be
 * a lie to a driver deciding where to spend fuel money.
 */

import { describe, expect, it } from "vitest";

import {
  freshnessOf,
  isWellFormedReport,
  summariseFeedByStation,
  summariseReports,
} from "@/lib/stationSummary";
import type { FuelReport, ReportStatus } from "@/types/report";

function report(
  overrides: Partial<FuelReport> & { id: string; created_at: string },
): FuelReport {
  return {
    station: { id: "st-1", name: "Station", brand: null },
    reported_by: { id: "u-1", full_name: null },
    fuel_type: { code: "PMS", name: "Petrol (PMS)" },
    price_per_litre: 900,
    queue_length: null,
    photo_url: null,
    notes: null,
    status: "pending" as ReportStatus,
    updated_at: overrides.created_at,
    ...overrides,
  } as FuelReport;
}

describe("summariseReports", () => {
  it("returns an empty, safe summary when there are no reports", () => {
    const s = summariseReports([]);
    expect(s.latest).toBeNull();
    expect(s.lastReportedAt).toBeNull();
    expect(s.byFuel.size).toBe(0);
    expect(s.hasVerifiedReport).toBe(false);
  });

  it("picks the newest report regardless of input ordering", () => {
    const s = summariseReports([
      report({ id: "old", created_at: "2026-08-01T00:00:00Z", price_per_litre: 700 }),
      report({ id: "new", created_at: "2026-08-10T00:00:00Z", price_per_litre: 950 }),
    ]);
    expect(s.latest?.price).toBe(950);
    expect(s.lastReportedAt).toBe("2026-08-10T00:00:00Z");
  });

  it("keeps the latest report per fuel type", () => {
    const s = summariseReports([
      report({
        id: "pms",
        created_at: "2026-08-10T00:00:00Z",
        price_per_litre: 950,
      }),
      report({
        id: "ago",
        created_at: "2026-08-09T00:00:00Z",
        price_per_litre: 1100,
        fuel_type: { code: "AGO", name: "Diesel (AGO)" },
      }),
    ]);
    expect(s.byFuel.get("PMS")?.price).toBe(950);
    expect(s.byFuel.get("AGO")?.price).toBe(1100);
  });

  it("treats a report with no price as no price — never zero", () => {
    const s = summariseReports([
      report({ id: "a", created_at: "2026-08-10T00:00:00Z", price_per_litre: null }),
    ]);
    expect(s.latest?.price).toBeNull();
    expect(s.latest?.availability).toBe("unknown");
  });

  it("does not treat a zero price as evidence of availability", () => {
    const s = summariseReports([
      report({ id: "a", created_at: "2026-08-10T00:00:00Z", price_per_litre: 0 }),
    ]);
    expect(s.latest?.price).toBeNull();
    expect(s.latest?.availability).toBe("unknown");
  });

  it("ignores rejected reports entirely", () => {
    const s = summariseReports([
      report({
        id: "bad",
        created_at: "2026-08-11T00:00:00Z",
        price_per_litre: 5,
        status: "rejected",
      }),
      report({ id: "good", created_at: "2026-08-10T00:00:00Z", price_per_litre: 950 }),
    ]);
    expect(s.latest?.price).toBe(950);
    expect(s.byFuel.get("PMS")?.price).toBe(950);
  });

  it("reports whether any submission was verified", () => {
    expect(
      summariseReports([
        report({ id: "a", created_at: "2026-08-10T00:00:00Z", status: "verified" }),
      ]).hasVerifiedReport,
    ).toBe(true);
    expect(
      summariseReports([report({ id: "a", created_at: "2026-08-10T00:00:00Z" })])
        .hasVerifiedReport,
    ).toBe(false);
  });
});

describe("summariseFeedByStation", () => {
  it("indexes a mixed feed by station id", () => {
    const map = summariseFeedByStation([
      report({
        id: "a",
        created_at: "2026-08-10T00:00:00Z",
        price_per_litre: 900,
        station: { id: "st-1", name: "One", brand: null },
      }),
      report({
        id: "b",
        created_at: "2026-08-10T00:00:00Z",
        price_per_litre: 1000,
        station: { id: "st-2", name: "Two", brand: null },
      }),
    ]);
    expect(map.get("st-1")?.latest?.price).toBe(900);
    expect(map.get("st-2")?.latest?.price).toBe(1000);
    expect(map.get("st-3")).toBeUndefined();
  });
});

describe("malformed report rows are skipped, not fatal", () => {
  it("rejects a report whose station is null", () => {
    const bad = {
      ...report({ id: "x", created_at: "2026-08-10T00:00:00Z" }),
      station: null,
    } as unknown as FuelReport;
    expect(isWellFormedReport(bad)).toBe(false);
  });

  it("rejects a report whose fuel_type is missing", () => {
    const bad = {
      ...report({ id: "x", created_at: "2026-08-10T00:00:00Z" }),
      fuel_type: null,
    } as unknown as FuelReport;
    expect(isWellFormedReport(bad)).toBe(false);
  });

  it("skips a malformed row and still summarises the valid ones", () => {
    const valid = report({ id: "ok", created_at: "2026-08-10T00:00:00Z", price_per_litre: 950 });
    const bad = {
      ...report({ id: "bad", created_at: "2026-08-11T00:00:00Z", price_per_litre: 10 }),
      station: null,
    } as unknown as FuelReport;

    // Must not throw, and must not lose the valid report.
    const s = summariseReports([bad, valid]);
    expect(s.latest?.price).toBe(950);
    expect(s.byFuel.get("PMS")?.price).toBe(950);
  });

  it("summariseFeedByStation skips malformed rows without crashing", () => {
    const valid = report({
      id: "ok",
      created_at: "2026-08-10T00:00:00Z",
      price_per_litre: 950,
      station: { id: "st-1", name: "One", brand: null },
    });
    const bad = {
      ...report({ id: "bad", created_at: "2026-08-11T00:00:00Z" }),
      station: null,
    } as unknown as FuelReport;

    const map = summariseFeedByStation([bad, valid]);
    expect(map.get("st-1")?.latest?.price).toBe(950);
  });

  it("returns a safe empty summary when every row is malformed", () => {
    const bad = {
      ...report({ id: "bad", created_at: "2026-08-10T00:00:00Z" }),
      station: null,
    } as unknown as FuelReport;
    expect(summariseReports([bad]).latest).toBeNull();
    expect(summariseReports([bad]).byFuel.size).toBe(0);
  });
});

describe("freshnessOf", () => {
  const now = Date.parse("2026-08-15T12:00:00Z");

  it("buckets by age so stale data can be flagged, not hidden", () => {
    expect(freshnessOf("2026-08-15T09:00:00Z", now)).toBe("fresh");
    expect(freshnessOf("2026-08-14T12:00:00Z", now)).toBe("recent");
    expect(freshnessOf("2026-08-01T12:00:00Z", now)).toBe("stale");
  });

  it("returns none for a missing or unparseable timestamp", () => {
    expect(freshnessOf(null, now)).toBe("none");
    expect(freshnessOf("not-a-date", now)).toBe("none");
  });
});
