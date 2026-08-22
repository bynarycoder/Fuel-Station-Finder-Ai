/**
 * Fuel report types mirroring the backend Pydantic schemas (Phase 6/7).
 */

import type { FuelTypeBrief } from "./station";

export type ReportStatus = "pending" | "under_review" | "verified" | "rejected";
export type QueueLength = "none" | "short" | "medium" | "long";

/** User-facing labels for the report verification workflow. */
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pending verification",
  under_review: "Under review",
  verified: "Verified",
  rejected: "Rejected",
};

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
  /** When a reviewer made a decision (null while pending). */
  reviewed_at?: string | null;
  /** Shown to the submitter when the report was rejected. */
  rejection_reason?: string | null;
}

/** Admin-only report view (reviewer identity + moderation notes). */
export interface FuelReportAdmin extends FuelReport {
  reviewed_by?: { id: string; full_name: string | null } | null;
  reviewer_notes?: string | null;
}

export interface PaginatedReports<T = FuelReport> {
  items: T[];
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
