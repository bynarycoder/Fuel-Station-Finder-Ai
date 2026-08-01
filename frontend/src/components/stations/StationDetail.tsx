"use client";

/**
 * Station details panel — the discoverable home of "Report fuel price".
 *
 * Shows the station summary, its offered fuels, the latest reported price
 * (with timestamp) fetched from `GET /reports?station_id=…`, a short recent
 * list, and a prominent "Report price" button that opens the report form (or
 * prompts sign-in when the user is anonymous, since reporting is authenticated).
 */

import { DollarSign, Fuel, Loader2, MapPin, Navigation, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStationReports } from "@/hooks/useStationReports";
import { directionsUrl, formatRelative } from "@/lib/format";
import { QUEUE_LENGTH_LABELS, type FuelReport } from "@/types/report";
import { FUEL_TYPE_LABELS, type LatLng, type Station } from "@/types/station";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  verified: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

interface StationDetailProps {
  station: Station;
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

        {station.fuel_types.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Fuel className="h-3.5 w-3.5 text-gray-400" />
            {station.fuel_types.map((f) => (
              <span
                key={f.code}
                className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
              >
                {f.code}
              </span>
            ))}
          </div>
        )}
        <a
          href={directionsUrl(
            { latitude: station.latitude, longitude: station.longitude },
            userLocation,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
        >
          <Navigation className="h-3.5 w-3.5" /> Get directions
        </a>
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

        {reports.length > 1 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Recent reports
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
