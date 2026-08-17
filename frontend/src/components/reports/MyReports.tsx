"use client";

/**
 * "My reports" panel — the submitter's window into the verification workflow
 * (Phase 10).
 *
 * Shows every report the signed-in user submitted, with its real status from
 * the backend:
 *
 *   Pending verification → Under review → Verified | Rejected
 *
 * Rejected reports (which the public feed hides) show the reviewer's
 * rejection reason so the user understands the outcome. Reviewer identity is
 * never exposed here.
 */

import { FileWarning, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";

import { RelativeTime } from "@/components/ui/RelativeTime";
import { stationLabel } from "@/lib/stationName";
import { isWellFormedReport } from "@/lib/stationSummary";
import { REPORT_STATUS_LABELS, type FuelReport } from "@/types/report";
import { FUEL_TYPE_LABELS } from "@/types/station";

const STATUS_TONE: Record<
  string,
  "warning" | "info" | "success" | "danger" | "neutral"
> = {
  pending: "warning",
  under_review: "info",
  verified: "success",
  rejected: "danger",
};

export function MyReports({
  reports,
  isLoading,
  isError,
  onRetry,
}: {
  reports: FuelReport[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  // Skip malformed rows so one bad report can't crash the panel.
  const safeReports = reports.filter(isWellFormedReport);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-3">
        <h2 className="flex items-center gap-2 text-h3 text-ink-900">
          <MessageSquare className="h-4 w-4 text-brand-700" aria-hidden="true" /> My
          reports
        </h2>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && <LoadingSkeleton count={3} label="Loading your reports" />}

        {isError && (
          <ErrorState
            title="Couldn&apos;t load your reports."
            description="Check your connection and try again."
            onRetry={onRetry}
          />
        )}

        {!isLoading && !isError && safeReports.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title="No reports yet"
            description="You haven&apos;t submitted any reports yet. Report a price at any station to help other drivers."
          />
        )}

        {safeReports.map((report) => (
          <div
            key={report.id}
            className="rounded-lg border border-hairline bg-surface p-4 shadow-e1"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-h3 text-ink-900">
                  {stationLabel(report.station.brand, report.station.name)}
                </p>
                <p className="mt-0.5 text-caption text-ink-500">
                  {report.fuel_type.code} ·{" "}
                  {FUEL_TYPE_LABELS[
                    report.fuel_type.code as keyof typeof FUEL_TYPE_LABELS
                  ] ?? report.fuel_type.name}
                  {report.price_per_litre != null && (
                    <span className="ml-1 font-semibold tabular-nums text-ink-800">
                      ₦{report.price_per_litre.toLocaleString()}/L
                    </span>
                  )}
                </p>
              </div>
              <Badge
                tone={STATUS_TONE[report.status] ?? "neutral"}
                size="md"
                className="shrink-0"
              >
                {REPORT_STATUS_LABELS[report.status] ?? report.status}
              </Badge>
            </div>

            <p className="mt-1.5 text-caption text-ink-500">
              Reported <RelativeTime iso={report.created_at} />
            </p>

            {report.status === "rejected" && report.rejection_reason && (
              <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-caption text-danger-strong">
                <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Not accepted:</strong> {report.rejection_reason}
                </span>
              </p>
            )}
            {report.status === "pending" && (
              <p className="mt-2.5 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-caption text-warning-strong">
                Your report is awaiting verification.
              </p>
            )}
            {report.status === "verified" && (
              <p className="mt-2.5 rounded-lg border border-success-border bg-success-soft px-3 py-2 text-caption text-success-strong">
                ✓ Verified — thanks for helping other drivers!
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
