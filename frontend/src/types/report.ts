/**
 * Fuel report types mirroring the backend Pydantic schemas (Phase 6/7).
 */

import type { FuelTypeBrief } from "./station";

export type ReportStatus = "pending" | "verified" | "rejected";
export type QueueLength = "none" | "short" | "medium" | "long";

export interface ReportStationBrief {
  id: string;
  name: string;
  brand: string | null;
}

export interface ReporterBrief {
  id: string;
  full_name: string | null;
}

export interface FuelReport {
  id: string;
  station: ReportStationBrief;
  reported_by: ReporterBrief;
  fuel_type: FuelTypeBrief;
  price_per_litre: number | null;
  queue_length: QueueLength | null;
  photo_url: string | null;
  notes: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  /** Gemini verification score (0..1); null until an AI verification ran. */
  ai_confidence_score?: number | null;
}

export interface PaginatedReports {
  items: FuelReport[];
  total: number;
  page: number;
  page_size: number;
}

export const QUEUE_LENGTH_LABELS: Record<QueueLength, string> = {
  none: "No queue",
  short: "Short queue",
  medium: "Medium queue",
  long: "Long queue",
};
