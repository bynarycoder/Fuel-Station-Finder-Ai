"use client";

/**
 * Station detail — a premium profile page for one station.
 *
 * Information architecture (progressive disclosure, not a data dump):
 *
 *   1. Identity      brand · name, address, distance, provenance
 *   2. Decision      the headline latest price + freshness
 *   3. Actions       Get Directions (primary) · Report update (secondary)
 *   4. Fuel          per-fuel availability and latest price
 *   5. Details       phone, coordinates, listing status  (collapsed)
 *   6. Price history per-fuel trend                       (collapsed)
 *   7. Reports       recent community reports             (collapsed)
 *
 * Facts only: prices, queues and freshness come from real reports; provenance
 * and verification stay two separate fields; nothing is inferred.
 *
 * "Report fuel price" remains the discoverable reporting entry point, and
 * still prompts sign-in for anonymous users (the backend requires auth).
 */

import {
  ChevronDown,
  Clock3,
  Fuel,
  Heart,
  MapPin,
  Navigation,
  Phone,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { StationBrandMark } from "@/components/stations/StationBrandMark";
import { StationProvenanceBadge } from "@/components/stations/StationProvenanceBadge";
import {
  FreshnessLine,
  FuelAvailabilityBadge,
  PriceDisplay,
} from "@/components/stations/facts";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useStationReports } from "@/hooks/useStationReports";
import type { StationItem } from "@/hooks/useStations";
import {
  confidenceLabel,
  confidenceColor,
  formatConfidencePercent,
} from "@/lib/confidence";
import { directionsUrl, formatDistance, haversineDistance } from "@/lib/format";
import {
  buildPriceSeries,
  sparklinePoints,
  trendDirection,
} from "@/lib/priceHistory";
import { stationNameParts } from "@/lib/stationName";
import { summariseReports } from "@/lib/stationSummary";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/services/api";
import { QUEUE_LENGTH_LABELS, type FuelReport } from "@/types/report";
import {
  FUEL_TYPE_CODES,
  FUEL_TYPE_LABELS,
  type LatLng,
  type Station,
} from "@/types/station";

const STATUS_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  under_review: "info" as never,
  verified: "success",
  rejected: "danger",
};

interface StationDetailProps {
  station: Station & Partial<StationItem>;
  userLocation: LatLng | null;
  isAuthed: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (stationId: string) => void;
  onReportPrice: () => void;
  onRequireSignIn: () => void;
  onClose: () => void;
}

export function StationDetail({
  station,
  userLocation,
  isAuthed,
  isFavorite = false,
  onToggleFavorite,
  onReportPrice,
  onRequireSignIn,
  onClose,
}: StationDetailProps) {
  const { data, isLoading } = useStationReports(station.id);
  const reports = data?.items ?? [];
  const summary = summariseReports(reports);
  const latest = reports[0];

  // Distance: prefer server-provided distance_meters (nearby), else Haversine.
  const distanceMeters =
    typeof (station as StationItem).distance_meters === "number"
      ? (station as StationItem).distance_meters
      : userLocation
        ? haversineDistance(userLocation, {
            latitude: station.latitude,
            longitude: station.longitude,
          })
        : null;

  const directions = directionsUrl(
    { latitude: station.latitude, longitude: station.longitude },
    userLocation,
  );

  // Confidence hint: numeric AI score when available, else verification-based.
  const aiScore = latest?.ai_confidence_score ?? null;
  const confidence =
    aiScore != null
      ? {
          label: `AI Confidence ${formatConfidencePercent(aiScore)} — ${confidenceLabel(aiScore)}`,
          color: confidenceColor(aiScore),
        }
      : latest?.status === "verified"
        ? {
            label: "High — verified community report",
            color: "text-success-strong bg-success-soft border-success-border",
          }
        : latest?.status === "pending"
          ? {
              label: "Medium — pending verification",
              color: "text-warning-strong bg-warning-soft border-warning-border",
            }
          : reports.length === 0
            ? {
                label: "No reports yet — be the first",
                color: "text-ink-600 bg-ink-50 border-hairline",
              }
            : {
                label: "Community reports available",
                color: "text-ink-600 bg-ink-50 border-hairline",
              };

  const priceSeries = buildPriceSeries(reports);
  const { brandPrefix, name: stationName, label } = stationNameParts(
    station.brand,
    station.name,
  );

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* ---------------------------------------------------- 1. identity -- */}
      <div className="shrink-0 border-b border-hairline bg-surface">
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <StationBrandMark
            brand={station.brand}
            name={station.name}
            size="lg"
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <h2 id="station-detail-title" className="text-h1 text-ink-900">
              {brandPrefix && (
                <span className="font-medium text-ink-500">{brandPrefix} </span>
              )}
              {stationName}
            </h2>
            {(station.address || station.city || station.state) && (
              <p className="mt-1 flex items-start gap-1.5 text-body-sm text-ink-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                <span>
                  {[
                    station.address,
                    [station.city, station.state].filter(Boolean).join(", "),
                  ]
                    .filter(Boolean)
                    .join(" — ")}
                </span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {distanceMeters != null && (
                <Badge tone="solid-accent" size="md">
                  {formatDistance(distanceMeters)} away
                </Badge>
              )}
              <StationProvenanceBadge
                dataSource={station.data_source}
                verificationStatus={station.verification_status}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onToggleFavorite && (
              <button
                type="button"
                aria-pressed={isFavorite}
                onClick={() => onToggleFavorite(station.id)}
                aria-label={
                  isFavorite
                    ? `Remove ${label} from favourites`
                    : `Add ${label} to favourites`
                }
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
                  isFavorite
                    ? "text-accent-500 hover:bg-accent-50"
                    : "text-ink-300 hover:bg-ink-100 hover:text-accent-400",
                )}
              >
                <Heart
                  className={cn("h-5 w-5", isFavorite && "fill-accent-400")}
                  aria-hidden="true"
                />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close station details"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------- 2. decision -- */}
        <div className="mx-4 mb-3 rounded-xl border border-hairline bg-ink-50 p-3.5">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          ) : summary.latest ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <PriceDisplay
                  price={summary.latest.price}
                  fuelCode={summary.latest.fuelCode}
                  size="lg"
                  emphasis
                />
                <Badge tone={STATUS_TONE[summary.latest.status] ?? "neutral"} size="md">
                  {summary.latest.status === "verified"
                    ? "Verified report"
                    : "Pending verification"}
                </Badge>
              </div>
              <FreshnessLine
                iso={summary.lastReportedAt}
                className="mt-1.5 block"
              />
            </>
          ) : (
            <EmptyState
              dense
              icon={Fuel}
              title="No recent price reported"
              description="Be the first driver to report current conditions here."
              action={
                <Button
                  size="sm"
                  onClick={() => (isAuthed ? onReportPrice() : onRequireSignIn())}
                >
                  Report price
                </Button>
              }
              className="border-none bg-transparent px-0 py-1"
            />
          )}
        </div>

        {/* -------------------------------------------------- 3. actions -- */}
        <div className="flex gap-2 px-4 pb-4">
          {directions ? (
            <ButtonLink
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              size="lg"
              className="flex-1"
              aria-label={`Get driving directions to ${label}`}
            >
              <Navigation className="h-4 w-4" aria-hidden="true" />
              Get directions
            </ButtonLink>
          ) : (
            <div className="flex-1 rounded-lg bg-ink-100 px-3 py-3 text-center text-caption text-ink-500">
              Directions unavailable for this station
            </div>
          )}
          <Button
            variant="secondary"
            size="lg"
            onClick={() => (isAuthed ? onReportPrice() : onRequireSignIn())}
          >
            Report update
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------ scroller --- */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {/* 4. Fuel availability */}
        <section className="rounded-xl border border-hairline bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-h3 text-ink-900">
            <Fuel className="h-4 w-4 text-brand-600" aria-hidden="true" /> Fuel Prices
          </h3>
          <ul className="space-y-2">
            {FUEL_TYPE_CODES.filter(
              (code) =>
                station.fuel_types.some((f) => f.code === code) ||
                summary.byFuel.has(code),
            ).map((code) => {
              const fact = summary.byFuel.get(code);
              const offered = station.fuel_types.some((f) => f.code === code);
              return (
                <li
                  key={code}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-ink-50/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FuelAvailabilityBadge
                        code={code}
                        availability={fact?.availability ?? "unknown"}
                      />
                      {!offered && (
                        <span className="text-caption text-ink-500">
                          not listed at this station
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-caption text-ink-500">
                      {FUEL_TYPE_LABELS[code]}
                      {fact?.reportedAt ? (
                        <>
                          {" · "}
                          <RelativeTime iso={fact.reportedAt} />
                        </>
                      ) : (
                        ""
                      )}
                    </p>
                  </div>
                  <PriceDisplay price={fact?.price ?? null} size="sm" emphasis />
                </li>
              );
            })}
            {station.fuel_types.length === 0 && summary.byFuel.size === 0 && (
              <li className="text-caption text-ink-500">
                No fuel products listed for this station yet.
              </li>
            )}
          </ul>
          <div
            className={cn(
              "mt-3 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-caption font-medium",
              confidence.color,
            )}
          >
            <Star className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Confidence: {confidence.label}</span>
          </div>
        </section>

        {/* Latest report photo */}
        {latest?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveMediaUrl(latest.photo_url) ?? undefined}
            alt={`Photo from the latest report at ${station.name}`}
            loading="lazy"
            className="h-40 w-full rounded-xl border border-hairline object-cover"
          />
        )}

        {/* 5. Station details (collapsed) */}
        <Disclosure title="Station details" defaultOpen={false}>
          <dl className="space-y-2.5 text-body-sm">
            <Row label="Listing status">
              <Badge tone={station.is_active ? "success" : "danger"} size="md">
                {station.is_active ? "Active listing" : "Inactive"}
              </Badge>
            </Row>
            {station.phone && (
              <Row label="Phone">
                <a
                  href={`tel:${station.phone}`}
                  className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {station.phone}
                </a>
              </Row>
            )}
            <Row label="Coordinates">
              <span className="font-mono text-caption text-ink-600">
                {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}
              </span>
            </Row>
            <Row label="Record updated">
              <span className="inline-flex items-center gap-1 text-caption text-ink-600">
                <Clock3 className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
                <RelativeTime iso={station.updated_at} />
              </span>
            </Row>
          </dl>
        </Disclosure>

        {/* 6. Price history (collapsed) */}
        {priceSeries.length > 0 && (
          <Disclosure title="Price history by fuel" defaultOpen={false}>
            <div className="space-y-2">
              {priceSeries.map((series) => {
                const direction = trendDirection(series);
                return (
                  <div
                    key={series.fuelCode}
                    className="rounded-lg border border-hairline bg-ink-50/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-body-sm font-semibold text-ink-900">
                          {series.fuelCode}
                          <span className="ml-1.5 font-normal text-ink-500">
                            {series.fuelName}
                          </span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5">
                          <PriceDisplay price={series.latestPrice ?? null} size="sm" />
                          {series.change != null && series.change !== 0 && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 text-[11px] font-bold",
                                series.change > 0
                                  ? "text-danger-strong"
                                  : "text-success-strong",
                              )}
                            >
                              {series.change > 0 ? (
                                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <TrendingDown className="h-3 w-3" aria-hidden="true" />
                              )}
                              {series.change > 0 ? "+" : ""}
                              {series.changePercent != null
                                ? `${(series.changePercent * 100).toFixed(1)}%`
                                : `₦${Math.abs(series.change).toFixed(0)}`}
                            </span>
                          )}
                        </p>
                      </div>
                      {series.points.length >= 2 && (
                        <svg
                          width={110}
                          height={36}
                          viewBox="0 0 110 36"
                          role="img"
                          aria-label={`${series.fuelCode} price trend sparkline`}
                          className="shrink-0"
                        >
                          <polyline
                            points={sparklinePoints(series, 110, 36)}
                            fill="none"
                            stroke="#059669"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <p className="mt-1.5 text-caption text-ink-500">
                      {series.points.length} report
                      {series.points.length === 1 ? "" : "s"} ·
                      {direction === "up"
                        ? " price rising"
                        : direction === "down"
                          ? " price falling"
                          : direction === "flat"
                            ? " price stable"
                            : " no trend yet"}
                      {series.latestAt ? (
                        <>
                          {" "}
                          · last <RelativeTime iso={series.latestAt} />
                        </>
                      ) : (
                        ""
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </Disclosure>
        )}

        {/* 7. Community reports (collapsed) */}
        <Disclosure
          title={`Community reports${reports.length ? ` (${reports.length})` : ""}`}
          defaultOpen={false}
        >
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : reports.length === 0 ? (
            <EmptyState
              dense
              title="No reports yet"
              description="Be the first driver to report current conditions."
              action={
                <Button
                  size="sm"
                  onClick={() => (isAuthed ? onReportPrice() : onRequireSignIn())}
                >
                  Submit report
                </Button>
              }
              className="border-none bg-transparent"
            />
          ) : (
            <div className="space-y-2">
              {reports.slice(0, 6).map((r) => (
                <ReportRow key={r.id} report={r} />
              ))}
              {reports.length > 6 && (
                <p className="pt-1 text-center text-caption text-ink-500">
                  Showing the latest 6 of {reports.length} reports
                </p>
              )}
            </div>
          )}
        </Disclosure>
      </div>

      {/* Sticky reporting CTA — the discoverable home of "Report fuel price" */}
      <div className="shrink-0 border-t border-hairline bg-surface p-4 pb-safe">
        <Button
          block
          size="lg"
          variant="accent"
          onClick={() => (isAuthed ? onReportPrice() : onRequireSignIn())}
        >
          Report fuel price
        </Button>
        <p className="mt-1.5 text-center text-caption text-ink-500">
          {isAuthed
            ? "Your report helps other drivers find fuel faster."
            : "You'll need to sign in to report a price."}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- internals */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-caption text-ink-500">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function Disclosure({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-ink-50"
      >
        <span className="text-h3 text-ink-900">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-400 transition-transform duration-base",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && <div className="border-t border-hairline p-4 animate-fade-in">{children}</div>}
    </section>
  );
}

function ReportRow({ report }: { report: FuelReport }) {
  const aiScore = report.ai_confidence_score ?? null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-ink-50/60 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-body-sm font-semibold text-ink-800">
          {report.fuel_type.code}
        </span>
        {report.queue_length && (
          <span className="text-caption text-ink-500">
            {QUEUE_LENGTH_LABELS[report.queue_length]}
          </span>
        )}
        {aiScore != null && (
          <span
            className={cn(
              "rounded-pill px-1.5 py-0.5 text-[10px] font-bold",
              confidenceColor(aiScore),
            )}
            title="AI verification confidence"
          >
            AI {formatConfidencePercent(aiScore)}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        {report.price_per_litre != null && (
          <span className="text-body-sm font-semibold tabular-nums text-ink-900">
            ₦{report.price_per_litre.toLocaleString()}/L
          </span>
        )}
        <span className="text-caption text-ink-500">
          <RelativeTime iso={report.created_at} />
        </span>
      </span>
    </div>
  );
}
