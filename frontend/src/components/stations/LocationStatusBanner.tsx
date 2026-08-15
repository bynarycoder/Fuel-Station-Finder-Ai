"use client";

/**
 * Geolocation status surface.
 *
 * Extracted from the old 509-line filter component so the location state
 * machine has ONE presentation, reusable anywhere. The behaviour contract is
 * unchanged and is covered by `StationFilters.test.tsx`:
 *
 * - a TIMEOUT / POSITION_UNAVAILABLE while a valid position exists is
 *   non-fatal → amber status strip, results and marker stay on screen;
 * - fatal panels (permission denied / unsupported / no-position errors) appear
 *   ONLY when there is no valid location at all, and always offer both
 *   "Try again" and "Search by city";
 * - we never invent a location and never silently fail.
 *
 * The wording and the `Could not get your location` / `Live tracking paused` /
 * `Using your last known location` headings are load-bearing (tests + user
 * trust) and are preserved verbatim.
 */

import { AlertCircle, Loader2, MapPinned } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LocationStatus } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/types/station";

interface LocationStatusBannerProps {
  status: LocationStatus;
  message: string | null;
  userLocation: LatLng | null;
  isNearby: boolean;
  isWatching: boolean;
  onRetry: () => void;
  onSearchByCity: () => void;
  className?: string;
}

export function LocationStatusBanner({
  status,
  message,
  userLocation,
  isNearby,
  isWatching,
  onRetry,
  onSearchByCity,
  className,
}: LocationStatusBannerProps) {
  const hasPosition = userLocation !== null;

  const fatal =
    status === "error" ||
    status === "unsupported" ||
    (status === "permission_denied" && !hasPosition);

  const nonFatal =
    (status === "temporarily_unavailable" && hasPosition) ||
    (status === "permission_denied" && hasPosition) ||
    status === "updating";

  if (fatal) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-2.5 rounded-xl border px-3 py-3 text-caption leading-relaxed",
          status === "permission_denied"
            ? "border-warning-border bg-warning-soft text-warning-strong"
            : "border-danger-border bg-danger-soft text-danger-strong",
          className,
        )}
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold">
            {status === "permission_denied"
              ? "Location access denied"
              : status === "unsupported"
                ? "Location not supported"
                : "Could not get your location"}
          </p>
          <p className="mt-0.5 opacity-90">{message}</p>
          {status === "permission_denied" && (
            <p className="mt-1.5 opacity-80">
              Tip: in your browser address bar, tap the lock or location icon →
              allow location, then tap <strong>Near me</strong> again.
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
            <Button variant="ghost" size="sm" onClick={onSearchByCity}>
              Search by city
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (nonFatal) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-soft px-3 py-2.5 text-caption leading-relaxed text-warning-strong",
          className,
        )}
      >
        {status === "updating" ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <span
            className="mt-1 inline-block h-2 w-2 shrink-0 animate-pulse rounded-pill bg-warning"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold">
            {status === "permission_denied"
              ? "Live tracking paused"
              : status === "updating"
                ? "Updating location"
                : "Using your last known location"}
          </p>
          <p className="mt-0.5 opacity-90">
            {status === "permission_denied"
              ? "Location access is blocked. Showing results from your last known location — allow location access in your browser settings to resume live tracking."
              : status === "updating"
                ? "Updating your position…"
                : (message ??
                  "Using your last known location. Trying to update...")}
          </p>
        </div>
      </div>
    );
  }

  // Healthy tracking confirmation — quiet, never a full banner.
  if (isNearby && hasPosition) {
    return (
      <p
        className={cn(
          "flex items-center gap-1.5 text-caption text-brand-700",
          className,
        )}
        role="status"
      >
        <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
        Location detected
        {isWatching ? " · live tracking on" : ""}
      </p>
    );
  }

  return null;
}
