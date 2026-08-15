"use client";

/**
 * Live community reports feed.
 *
 * Reads the public reports endpoint via React Query and live-updates through
 * the Supabase Realtime subscription (which invalidates the cache on insert).
 * The connection badge ("Live" / "Connecting" / "Polling") stays visible so
 * the realtime behaviour is honest and observable.
 */

import { useState } from "react";
import { MessageSquare, Radio, UserRound } from "lucide-react";

import { MyReports } from "@/components/reports/MyReports";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { useMyReports } from "@/hooks/useMyReports";
import { useReportRealtime } from "@/hooks/useReportRealtime";
import { useReports } from "@/hooks/useReports";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { confidenceColor, formatConfidencePercent } from "@/lib/confidence";
import { stationNameParts } from "@/lib/stationName";
import { isWellFormedReport } from "@/lib/stationSummary";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/services/api";
import { QUEUE_LENGTH_LABELS } from "@/types/report";

export function ReportsFeed({ isAuthed }: { isAuthed: boolean }) {
  const { data, isLoading, isError, refetch } = useReports();
  const realtime = useReportRealtime();
  const [showMine, setShowMine] = useState(false);
  const my = useMyReports(isAuthed && showMine);

  // Skip malformed rows (e.g. `station === null`) so one bad report can't
  // crash the whole feed; the valid reports still render.
  const items = (data?.items ?? []).filter(isWellFormedReport);

  if (showMine) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-hairline bg-surface px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => setShowMine(false)}>
            ← All community reports
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <MyReports
            reports={my.data?.items ?? []}
            isLoading={my.isLoading}
            isError={my.isError}
            onRetry={() => void my.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline bg-surface px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {isAuthed && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowMine(true);
                void refetch();
              }}
              title="View the status of your own reports"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" /> My reports
            </Button>
          )}
        </div>
        <Badge
          tone={
            realtime === "live"
              ? "success"
              : realtime === "connecting"
                ? "warning"
                : "neutral"
          }
          size="md"
        >
          <Radio
            className={cn("h-3 w-3", realtime === "live" && "animate-pulse")}
            aria-hidden="true"
          />
          {realtime === "live"
            ? "Live"
            : realtime === "connecting"
              ? "Connecting"
              : "Polling"}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && <LoadingSkeleton count={4} label="Loading reports" />}

        {isError && (
          <ErrorState
            title="We couldn't load community reports"
            description="Check your connection and try again."
            onRetry={() => void refetch()}
          />
        )}

        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title="No reports yet"
            description="Be the first driver to report current fuel conditions. Open any station and tap Report fuel price."
          />
        )}

        {items.map((report) => (
          <article
            key={report.id}
            className="rounded-xl border border-hairline bg-surface p-4 shadow-e1"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-h3 text-ink-900">
                  {(() => {
                    const parts = stationNameParts(
                      report.station.brand,
                      report.station.name,
                    );
                    return (
                      <>
                        {parts.brandPrefix && (
                          <span className="font-medium text-ink-500">
                            {parts.brandPrefix}{" "}
                          </span>
                        )}
                        {parts.name}
                      </>
                    );
                  })()}
                </h3>
                <p className="mt-0.5 text-caption text-ink-500">
                  {report.fuel_type.code} · {report.fuel_type.name}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge
                    tone={
                      report.status === "verified"
                        ? "success"
                        : report.status === "rejected"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {report.status}
                  </Badge>
                  {report.ai_confidence_score != null && (
                    <span
                      className={cn(
                        "rounded-pill px-1.5 py-0.5 text-[10px] font-bold",
                        confidenceColor(report.ai_confidence_score),
                      )}
                      title="AI verification confidence"
                    >
                      AI {formatConfidencePercent(report.ai_confidence_score)}
                    </span>
                  )}
                </div>
                <span className="text-caption text-ink-500">
                  <RelativeTime iso={report.created_at} />
                </span>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {report.price_per_litre != null && (
                <span className="text-h2 tabular-nums text-ink-900">
                  ₦{report.price_per_litre.toLocaleString()}
                  <span className="ml-0.5 text-caption font-semibold text-ink-500">
                    /L
                  </span>
                </span>
              )}
              {report.queue_length && (
                <Badge tone="neutral" size="md">
                  {QUEUE_LENGTH_LABELS[report.queue_length]}
                </Badge>
              )}
            </div>

            {report.notes && (
              <p className="mt-2 line-clamp-2 text-body-sm text-ink-600">
                {report.notes}
              </p>
            )}

            {(() => {
              const photoSrc = resolveMediaUrl(report.photo_url);
              if (!photoSrc) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoSrc}
                  alt={`Photo reported at ${report.station.name}`}
                  loading="lazy"
                  className="mt-2.5 h-28 w-full rounded-lg border border-hairline object-cover"
                />
              );
            })()}
          </article>
        ))}
      </div>
    </div>
  );
}
