"use client";

/**
 * Station details panel — the discoverable home of "Report fuel price".
 *
 * Shows the station summary, its offered fuels, the latest reported price
 * (with timestamp) fetched from `GET /reports?station_id=…`, a short recent
 * list, and a prominent "Report price" button that opens the report form (or
 * prompts sign-in when the user is anonymous, since reporting is authenticated).
 *
 * Enhanced for the capstone Near Me audit:
 * - Distance (from server or Haversine fallback)
 * - Coordinates, verified/active badge, last updated
 * - Per-fuel availability + latest price per fuel (derived from recent reports)
 * - Queue status, confidence/verification hint, price history
 * - Favorite placeholder (coming soon) and Directions
 */

import {
  Clock3,
  DollarSign,
  Fuel,
  Heart,
  Loader2,
  MapPin,
  Navigation,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStationReports } from "@/hooks/useStationReports";
import {
  directionsUrl,
  formatDistance,
  formatRelative,
  haversineDistance,
} from "@/lib/format";
import { QUEUE_LENGTH_LABELS, type FuelReport } from "@/types/report";
import {
  FUEL_TYPE_CODES,
  FUEL_TYPE_LABELS,
  type LatLng,
  type Station,
} from "@/types/station";
import type { StationItem } from "@/hooks/useStations";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  verified: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

interface StationDetailProps {
  station: Station & Partial<StationItem>;
  userLocation: LatLng | null;
  isAuthed: boolean;
  onReportPrice: () => void;
  onRequireSignIn: () => void;
  onClose: () => void;
}

export function StationDetail({
  station,
  userLocation,
  isAuthed,
  onReportPrice,
  onRequireSignIn,
  onClose,
}: StationDetailProps) {
  const { data, isLoading } = useStationReports(station.id);
  const reports = data?.items ?? [];
  const latest = reports[0];

  // Distance: prefer server-provided distance_meters (nearby mode), else Haversine.
  const distanceMeters =
    typeof (station as StationItem).distance_meters === "number"
      ? (station as StationItem).distance_meters
      : userLocation
        ? haversineDistance(userLocation, {
            latitude: station.latitude,
            longitude: station.longitude,
          })
        : null;

  // Per-fuel latest report (for the fuel availability / price grid).
  const latestByFuel = new Map<string, FuelReport>();
  for (const r of reports) {
    if (!latestByFuel.has(r.fuel_type.code)) {
      latestByFuel.set(r.fuel_type.code, r);
    }
  }

  // Confidence hint: based on latest report verification.
  const confidence =
    latest?.status === "verified"
      ? { label: "High — verified community report", color: "text-emerald-700 bg-emerald-50 border-emerald-200" }
      : latest?.status === "pending"
        ? { label: "Medium — pending verification", color: "text-amber-700 bg-amber-50 border-amber-200" }
        : reports.length === 0
          ? { label: "No reports yet — be the first", color: "text-gray-600 bg-gray-50 border-gray-200" }
          : { label: "Community reports available", color: "text-gray-600 bg-gray-50 border-gray-200" };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900">
              {station.brand ? `${station.brand} · ` : ""}
              {station.name}
            </p>
            {(station.address || station.city || station.state) && (
              <p className="mt-1 flex items-start gap-1 text-xs text-gray-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {[station.address, [station.city, station.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  station.is_active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                {station.is_active ? "Active · Listed" : "Inactive"}
              </span>
              {distanceMeters != null && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  {formatDistance(distanceMeters)} away
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                <Clock3 className="h-3 w-3" /> Updated {formatRelative(station.updated_at)}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-gray-400">
              {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Fuel availability grid */}
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">
            <Fuel className="h-3.5 w-3.5" /> Fuel availability
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FUEL_TYPE_CODES.map((code) => {
              const offered = station.fuel_types.some((f) => f.code === code);
              const latestForFuel = latestByFuel.get(code);
              return (
                <div
                  key={code}
                  className={`rounded-lg border bg-white px-2.5 py-2 ${
                    offered ? "border-emerald-200" : "border-gray-200 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">{code}</span>
                    <span
                      className={`h-2 w-2 rounded-full ${offered ? "bg-emerald-500" : "bg-gray-300"}`}
                    />
                  </div>
                  <p className="text-[11px] font-medium text-gray-500">
                    {FUEL_TYPE_LABELS[code]}
                  </p>
                  <p className="mt-1 text-[11px]">
                    {offered ? (
                      <span className="font-semibold text-emerald-700">Offered</span>
                    ) : (
                      <span className="text-gray-400">Not offered</span>
                    )}
                    {latestForFuel?.price_per_litre != null && (
                      <span className="ml-1 font-bold text-gray-900">
                        · ₦{latestForFuel.price_per_litre.toLocaleString()}/L
                      </span>
                    )}
                  </p>
                  {latestForFuel?.queue_length && (
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Queue: {QUEUE_LENGTH_LABELS[latestForFuel.queue_length]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Prices & queue from community reports below. Tap <strong>Report fuel price</strong> to update.
          </p>
        </div>

        {/* Confidence / trust */}
        <div className={`mt-3 flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${confidence.color}`}>
          <Star className="h-3.5 w-3.5" />
          <span>Confidence: {confidence.label}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={directionsUrl(
              { latitude: station.latitude, longitude: station.longitude },
              userLocation,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Navigation className="h-3.5 w-3.5" /> Get directions
          </a>
          <button
            type="button"
            disabled
            title="Favorites coming soon — saved stations for quick access"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-400"
          >
            <Heart className="h-3.5 w-3.5" /> Favorite (soon)
          </button>
        </div>
      </div>

      {/* Latest price */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-gray-900">Latest reported price</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : latest ? (
          <LatestPriceCard report={latest} />
        ) : (
          <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
            No price reported yet. Be the first to share!
          </p>
        )}

        {reports.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Price history (recent)
            </h4>
            <div className="space-y-2">
              {reports.slice(0, 6).map((r) => (
                <ReportRow key={r.id} report={r} />
              ))}
              {reports.length > 6 && (
                <p className="pt-1 text-center text-[11px] text-gray-400">
                  Showing latest {Math.min(6, reports.length)} of {reports.length} reports · 7-day history available in Reports feed
                </p>
              )}
            </div>
          </div>
        )}

        {reports.length > 1 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Recent community reports
            </h4>
            <div className="space-y-2">
              {reports.slice(1, 6).map((r) => (
                <ReportRow key={r.id} report={r} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Primary action */}
      <div className="border-t border-gray-200 p-4">
        <Button
          className="w-full"
          onClick={() => (isAuthed ? onReportPrice() : onRequireSignIn())}
        >
          Report fuel price
        </Button>
        {!isAuthed && (
          <p className="mt-1 text-center text-[11px] text-gray-400">
            You&apos;ll need to sign in to report a price.
          </p>
        )}
      </div>
    </div>
  );
}

function LatestPriceCard({ report }: { report: FuelReport }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-extrabold text-emerald-900">
          {report.price_per_litre != null
            ? `₦${report.price_per_litre.toLocaleString()}`
            : "—"}
          <span className="ml-1 text-sm font-semibold text-emerald-700">/L</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
            STATUS_STYLES[report.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {report.status}
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-gray-600">
        {FUEL_TYPE_LABELS[report.fuel_type.code as keyof typeof FUEL_TYPE_LABELS] ??
          report.fuel_type.name}
        {report.queue_length ? ` · ${QUEUE_LENGTH_LABELS[report.queue_length]}` : ""}
      </p>
      <p className="mt-1 text-[11px] text-gray-500">
        Reported {formatRelative(report.created_at)}
        {report.reported_by?.full_name ? ` by ${report.reported_by.full_name}` : ""}
      </p>
      {report.notes && (
        <p className="mt-2 rounded-lg bg-white px-2 py-1.5 text-xs text-gray-600">{report.notes}</p>
      )}
    </div>
  );
}

function ReportRow({ report }: { report: FuelReport }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2 text-xs">
      <span className="font-medium text-gray-700">
        {report.fuel_type.code}
        {report.queue_length ? ` · ${QUEUE_LENGTH_LABELS[report.queue_length]}` : ""}
      </span>
      <span className="flex items-center gap-2">
        {report.price_per_litre != null && (
          <span className="font-semibold text-gray-900">
            ₦{report.price_per_litre.toLocaleString()}/L
          </span>
        )}
        <span className="text-[11px] text-gray-400">{formatRelative(report.created_at)}</span>
      </span>
    </div>
  );
}
