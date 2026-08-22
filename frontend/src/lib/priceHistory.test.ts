/**
 * Unit tests for price-history helpers (Phase 8).
 *
 * The helpers must derive everything from ACTUAL reports — no invented data.
 */

import { describe, expect, it } from "vitest";

import {
  buildPriceSeries,
  sparklinePoints,
  trendDirection,
} from "@/lib/priceHistory";
import type { FuelReport } from "@/types/report";

function report(
  id: string,
  fuel: string,
  price: number,
  daysAgo: number,
  status: FuelReport["status"] = "verified",
): FuelReport {
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id,
    station: { id: "s1", name: "Test", brand: null },
    reported_by: { id: "u1", full_name: null },
    fuel_type: { code: fuel, name: fuel },
    price_per_litre: price,
    queue_length: null,
    photo_url: null,
    notes: null,
    status,
    created_at: at,
    updated_at: at,
  };
}

describe("buildPriceSeries", () => {
  it("groups by fuel and sorts chronologically", () => {
    const series = buildPriceSeries([
      report("r3", "PMS", 700, 1),
      report("r1", "PMS", 650, 5),
      report("r2", "PMS", 680, 3),
      report("r4", "AGO", 1200, 2),
    ]);
    expect(series.map((s) => s.fuelCode)).toEqual(["AGO", "PMS"]);

    const pms = series.find((s) => s.fuelCode === "PMS")!;
    expect(pms.points.map((p) => p.price)).toEqual([650, 680, 700]);
    expect(pms.latestPrice).toBe(700);
    expect(pms.change).toBe(20);
    expect(pms.changePercent).toBeCloseTo(20 / 680, 5);
    expect(pms.points[0].status).toBe("verified");
  });

  it("ignores reports without a price", () => {
    const noPrice: FuelReport = {
      ...report("r1", "PMS", 650, 2),
      price_per_litre: null,
    };
    const series = buildPriceSeries([noPrice]);
    expect(series).toHaveLength(0);
  });

  it("returns null trend when fewer than two reports", () => {
    const series = buildPriceSeries([report("r1", "PMS", 650, 2)]);
    expect(series[0].change).toBeNull();
    expect(series[0].changePercent).toBeNull();
  });
});

describe("trendDirection", () => {
  it("detects up/down/flat", () => {
    const up = buildPriceSeries([
      report("a", "PMS", 650, 5),
      report("b", "PMS", 700, 1),
    ])[0];
    const down = buildPriceSeries([
      report("a", "PMS", 700, 5),
      report("b", "PMS", 650, 1),
    ])[0];
    const flat = buildPriceSeries([
      report("a", "PMS", 650, 5),
      report("b", "PMS", 650, 1),
    ])[0];
    const single = buildPriceSeries([report("a", "PMS", 650, 1)])[0];

    expect(trendDirection(up)).toBe("up");
    expect(trendDirection(down)).toBe("down");
    expect(trendDirection(flat)).toBe("flat");
    expect(trendDirection(single)).toBeNull();
  });
});

describe("sparklinePoints", () => {
  it("builds valid SVG polyline points", () => {
    const series = buildPriceSeries([
      report("a", "PMS", 650, 5),
      report("b", "PMS", 680, 3),
      report("c", "PMS", 700, 1),
    ])[0];
    const points = sparklinePoints(series, 110, 36);
    const coords = points.split(" ").map((p) => p.split(",").map(Number));
    expect(coords).toHaveLength(3);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(110);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(36);
    }
    // First point on the left edge, last on the right edge.
    expect(coords[0][0]).toBeCloseTo(2);
    expect(coords[2][0]).toBeCloseTo(108);
  });

  it("returns empty string without data", () => {
    expect(sparklinePoints({ points: [] } as never, 110, 36)).toBe("");
  });
});
