/**
 * Pure helpers that turn REAL fuel reports into the facts a station card shows.
 *
 * Honesty rules (mirrors the AI contract in `types/ai.ts`):
 * - a price is only ever a price that was actually reported;
 * - "available"/"unavailable" is only claimed when a report says so — the
 *   absence of reports is `unknown`, never "unavailable";
 * - freshness is derived from the report timestamp, never invented.
 */

import type {
  FuelReport,
  ReportStatus,
  ReportStationBrief,
} from "@/types/report";
import type { FuelTypeBrief } from "@/types/station";

/** Availability we can honestly claim for a fuel at a station. */
export type FuelAvailability = "available" | "unavailable" | "unknown";

export interface StationPriceFact {
  fuelCode: string;
  fuelName: string;
  /** Naira per litre, or null when the report carried no price. */
  price: number | null;
  reportedAt: string;
  status: ReportStatus;
  availability: FuelAvailability;
}

export interface StationSummary {
  /** Latest report per fuel code, newest first by report time. */
  byFuel: Map<string, StationPriceFact>;
  /** The single most recent report across all fuels (or null). */
  latest: StationPriceFact | null;
  /** ISO timestamp of the most recent report, or null when there are none. */
  lastReportedAt: string | null;
  /** True when at least one report has been verified by a reviewer. */
  hasVerifiedReport: boolean;
}

const EMPTY_SUMMARY: StationSummary = {
  byFuel: new Map(),
  latest: null,
  lastReportedAt: null,
  hasVerifiedReport: false,
};

/**
 * Runtime shape guard: a report is only usable when the nested objects it
 * depends on (`station`, `fuel_type`) actually exist with the fields we read.
 *
 * The API contract says these are always present, but a malformed row
 * (e.g. `station === null`, a missing `fuel_type`) must be SKIPPED, not allowed
 * to throw `Cannot read properties of null` and blank the whole card. One bad
 * row must never take down the valid ones.
 */
export function isWellFormedReport(report: FuelReport | null | undefined): boolean {
  if (!report || typeof report !== "object") return false;
  const station = report.station as Partial<ReportStationBrief> | null | undefined;
  const fuel = report.fuel_type as Partial<FuelTypeBrief> | null | undefined;
  return (
    station != null &&
    typeof station.id === "string" &&
    fuel != null &&
    typeof fuel.code === "string" &&
    typeof fuel.name === "string" &&
    typeof report.created_at === "string" &&
    typeof report.status === "string"
  );
}

/**
 * A report implies availability when it carries a price (someone bought or saw
 * fuel being sold). A zero/negative price is treated as "no price", not as
 * evidence of anything.
 */
function availabilityOf(report: FuelReport): FuelAvailability {
  if (report.status === "rejected") return "unknown";
  if (typeof report.price_per_litre === "number" && report.price_per_litre > 0) {
    return "available";
  }
  return "unknown";
}

function toFact(report: FuelReport): StationPriceFact {
  return {
    fuelCode: report.fuel_type.code,
    fuelName: report.fuel_type.name,
    price:
      typeof report.price_per_litre === "number" && report.price_per_litre > 0
        ? report.price_per_litre
        : null,
    reportedAt: report.created_at,
    status: report.status,
    availability: availabilityOf(report),
  };
}

/** Build a station summary from that station's reports (any order). */
export function summariseReports(reports: FuelReport[] | undefined): StationSummary {
  if (!reports || reports.length === 0) return EMPTY_SUMMARY;

  // Skip malformed rows; summarise the valid ones instead of crashing.
  const sorted = reports
    .filter(isWellFormedReport)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (sorted.length === 0) return EMPTY_SUMMARY;

  const byFuel = new Map<string, StationPriceFact>();
  for (const report of sorted) {
    if (report.status === "rejected") continue;
    if (!byFuel.has(report.fuel_type.code)) {
      byFuel.set(report.fuel_type.code, toFact(report));
    }
  }

  const newest = sorted.find((r) => r.status !== "rejected");

  return {
    byFuel,
    latest: newest ? toFact(newest) : null,
    lastReportedAt: newest?.created_at ?? null,
    hasVerifiedReport: sorted.some((r) => r.status === "verified"),
  };
}

/** Group a mixed feed of reports by station id, then summarise each station. */
export function summariseFeedByStation(
  reports: FuelReport[] | undefined,
): Map<string, StationSummary> {
  const grouped = new Map<string, FuelReport[]>();
  for (const report of reports ?? []) {
    if (!isWellFormedReport(report)) continue;
    const list = grouped.get(report.station.id);
    if (list) list.push(report);
    else grouped.set(report.station.id, [report]);
  }
  const out = new Map<string, StationSummary>();
  for (const [stationId, list] of grouped) {
    out.set(stationId, summariseReports(list));
  }
  return out;
}

/**
 * Freshness bucket for a report timestamp, used to colour the "Updated …"
 * line. Stale data is a trust signal, so it is shown, not hidden.
 */
export type Freshness = "fresh" | "recent" | "stale" | "none";

export function freshnessOf(iso: string | null, nowMs: number): Freshness {
  if (!iso) return "none";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "none";
  const hours = (nowMs - then) / 3_600_000;
  if (hours <= 6) return "fresh";
  if (hours <= 48) return "recent";
  return "stale";
}

export const EMPTY_STATION_SUMMARY = EMPTY_SUMMARY;
