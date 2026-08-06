"use client";

/**
 * Live community reports feed (Phase 7).
 *
 * Reads the public reports endpoint via React Query and live-updates through
 * the Supabase Realtime subscription (which invalidates the cache on insert).
 * Shows a connection badge ("Live" / "Polling") so the realtime behaviour is
 * visible.
 */

import { Loader2, MessageSquare, Radio } from "lucide-react";

import { useReportRealtime } from "@/hooks/useReportRealtime";
import { useReports } from "@/hooks/useReports";
import { resolveMediaUrl } from "@/services/api";
import { QUEUE_LENGTH_LABELS } from "@/types/report";

export function ReportsFeed() {
  const { data, isLoading, isError } = useReports();
  const realtime = useReportRealtime();

  const items = data?.items ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <MessageSquare className="h-4 w-4 text-emerald-700" /> Community reports
        </h2>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            realtime === "live"
              ? "bg-emerald-100 text-emerald-700"
              : realtime === "connecting"
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-500"
          }`}
        >
          <Radio className="h-3 w-3" />
          {realtime === "live" ? "Live" : realtime === "connecting" ? "Connecting" : "Polling"}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading reports…
          </div>
        )}

        {isError && (
          <p className="py-10 text-center text-sm text-gray-500">
            Couldn&apos;t load reports. Make sure the backend is running.
          </p>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">
            No reports yet. Be the first to share fuel info!
          </p>
        )}

        {items.map((report) => (
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
                  {report.fuel_type.code} · {report.fuel_type.name}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-emerald-700">
                  {report.status}
                </span>
                <span className="text-[11px] text-gray-400">
                  {formatRelative(report.created_at)}
                </span>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {report.price_per_litre != null && (
                <span className="rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                  ₦{report.price_per_litre.toLocaleString()}/L
                </span>
              )}
              {report.queue_length && (
                <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                  {QUEUE_LENGTH_LABELS[report.queue_length]}
                </span>
              )}
            </div>

            {report.notes && (
              <p className="mt-2 line-clamp-2 text-xs text-gray-600">{report.notes}</p>
            )}

            {(() => {
              const photoSrc = resolveMediaUrl(report.photo_url);
              if (!photoSrc) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoSrc}
                  alt="Reported station"
                  className="mt-2 h-24 w-full rounded-lg object-cover"
                />
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
