/**
 * Price-history helpers (Phase 8) — derived ONLY from actual database reports.
 *
 * Reports arrive newest-first from the API; we group them per fuel type, sort
 * chronologically, compute latest/previous prices and a simple trend, and
 * build a tiny responsive SVG sparkline (no chart library dependency).
 */

import type { FuelReport } from "@/types/report";

export interface PricePoint {
  /** ISO timestamp of the report. */
  at: string;
  price: number;
  status: FuelReport["status"];
  confidence: number | null;
}

export interface PriceSeries {
  fuelCode: string;
  fuelName: string;
  /** Chronological (oldest → newest) price points with prices only. */
  points: PricePoint[];
  latestPrice: number | null;
  /** Absolute change vs the previous report, null when <2 reports. */
  change: number | null;
  /** Signed percent change vs the previous report, null when <2 reports. */
  changePercent: number | null;
  /** ISO timestamp of the most recent report. */
  latestAt: string | null;
}

/** Group a station's reports by fuel type and build per-fuel price series. */
export function buildPriceSeries(reports: FuelReport[]): PriceSeries[] {
  const byFuel = new Map<string, FuelReport[]>();
  for (const r of reports) {
    if (r.price_per_litre == null) continue; // price-only series
    const list = byFuel.get(r.fuel_type.code) ?? [];
    list.push(r);
    byFuel.set(r.fuel_type.code, list);
  }

  const series: PriceSeries[] = [];
  for (const [code, list] of byFuel) {
    const chronological = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const points: PricePoint[] = chronological.map((r) => ({
      at: r.created_at,
      price: r.price_per_litre as number,
      status: r.status,
      confidence: r.ai_confidence_score ?? null,
    }));
    const latest = points[points.length - 1] ?? null;
    const previous = points[points.length - 2] ?? null;
    const change =
      latest && previous ? latest.price - previous.price : null;
    const changePercent =
      latest && previous && previous.price > 0
        ? (change as number) / previous.price
        : null;

    series.push({
      fuelCode: code,
      fuelName: list[0].fuel_type.name,
      points,
      latestPrice: latest ? latest.price : null,
      change,
      changePercent,
      latestAt: latest ? latest.at : null,
    });
  }

  // Stable ordering by fuel code for the UI.
  return series.sort((a, b) => a.fuelCode.localeCompare(b.fuelCode));
}

/** Whether the price moved up, down, or held (null when no trend data). */
export function trendDirection(series: PriceSeries): "up" | "down" | "flat" | null {
  if (series.change == null || series.change === 0) {
    return series.change == null ? null : "flat";
  }
  return series.change > 0 ? "up" : "down";
}

/**
 * Build SVG polyline points for a sparkline inside a `w × h` viewBox.
 * Returns an empty string when there is no price data.
 */
export function sparklinePoints(
  series: PriceSeries,
  w: number,
  h: number,
  pad = 2,
): string {
  if (series.points.length === 0) return "";
  const prices = series.points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return prices
    .map((price, i) => {
      const x = pad + (i / (prices.length - 1)) * innerW;
      const y = pad + innerH - ((price - min) / span) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
