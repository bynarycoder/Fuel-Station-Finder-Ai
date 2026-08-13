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

import { FileWarning, Loader2, MessageSquare } from "lucide-react";

import { RelativeTime } from "@/components/ui/RelativeTime";
import { REPORT_STATUS_LABELS, type FuelReport } from "@/types/report";
import { FUEL_TYPE_LABELS } from "@/types/station";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  under_review: "bg-blue-100 text-blue-700",
  verified: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
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
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <MessageSquare className="h-4 w-4 text-emerald-700" /> My reports
        </h2>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your reports…
          </div>
        )}

        {isError && (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-500">
              Couldn&apos;t load your reports.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && reports.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">
            You haven&apos;t submitted any reports yet.
          </p>
        )}

        {reports.map((report) => (
          <div
            key={report.id}
            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {report.station.brand ? `${report.station.brand} · ` : ""}
                  {report.station.name}
                </p>
                <p className="text-xs text-gray-500">
                  {report.fuel_type.code} ·{" "}
                  {FUEL_TYPE_LABELS[
                    report.fuel_type.code as keyof typeof FUEL_TYPE_LABELS
                  ] ?? report.fuel_type.name}
                  {report.price_per_litre != null && (
                    <span className="ml-1 font-semibold text-gray-700">
                      ₦{report.price_per_litre.toLocaleString()}/L
                    </span>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                  STATUS_STYLES[report.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {REPORT_STATUS_LABELS[report.status] ?? report.status}
              </span>
            </div>

            <p className="mt-1 text-[11px] text-gray-400">
              Reported <RelativeTime iso={report.created_at} />
            </p>

            {report.status === "rejected" && report.rejection_reason && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">
                <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Not accepted:</strong> {report.rejection_reason}
                </span>
              </p>
            )}
            {report.status === "pending" && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
                Your report is awaiting verification.
              </p>
            )}
            {report.status === "verified" && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700">
                ✓ Verified — thanks for helping other drivers!
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
