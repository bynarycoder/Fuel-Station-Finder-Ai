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
 * - fatal panels (permission denied / unsupported / no-position errors)
 *   appear ONLY when there is no valid location at all, and always offer
 *   "Try again" and a manual path;
 * - we never invent a location and never silently fail.
 *
 * Desktop fallback (new): when the browser returns a hopelessly coarse fix
 * (e.g. ~200 km accuracy) the guard rejects it exactly like a failure, but
 * the copy becomes "We couldn't get an accurate location" — explaining that
 * the device only provided an approximate location — with "Choose a
 * location" as the primary action. Raw accuracy values / error codes are
 * NEVER shown to users; `failure.coarseAccuracy` is a UI flag only.
 *
 * Manual locations (new): `locationSource === "manual"` renders a distinct
 * "Using selected location — <label>" panel. Manual mode is NOT GPS: no
 * "live tracking" wording, and the actions are "Change location" and
 * "Use my current location" (the latter explicitly switches back to the
 * device lifecycle through the shared store).
 *
 * The wording and the `Could not get your location` / `Live tracking paused` /
 * `Using your last known location` headings are load-bearing (tests + user
 * trust) and are preserved verbatim.
 */

import { AlertCircle, Loader2, MapPin, MapPinned, Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { GeoFailure, LocationSource, LocationStatus } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/types/station";

interface LocationStatusBannerProps {
  status: LocationStatus;
  message: string | null;
  userLocation: LatLng | null;
  isNearby: boolean;
  isWatching: boolean;
  /** Where the active location came from (device GPS vs. manual selection). */
  locationSource?: LocationSource | null;
  /** Display label of the manually selected location, if any. */
  manualLocationLabel?: string | null;
  /** The last geolocation failure (only `coarseAccuracy` is surfaced to UI copy). */
  failure?: GeoFailure | null;
  onRetry: () => void;
  onSearchByCity: () => void;
  /** Opens the location picker (manual city/point selection). */
  onChooseLocation: () => void;
  /** Explicitly re-request the device GPS through the shared lifecycle. */
  onUseDeviceLocation?: () => void;
  className?: string;
}

export function LocationStatusBanner({
  status,
  message,
  userLocation,
  isNearby,
  isWatching,
  locationSource = null,
  manualLocationLabel = null,
  failure = null,
  onRetry,
  onSearchByCity,
  onChooseLocation,
  onUseDeviceLocation,
  className,
}: LocationStatusBannerProps) {
  const { t } = useTranslation();
  const hasPosition = userLocation !== null;
  const isManual = locationSource === "manual";

  // ---- Manual location (user-picked city/point — not GPS) ----------------
  if (isManual && hasPosition && isNearby) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-3 text-caption leading-relaxed text-brand-900",
          className,
        )}
      >
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold">{t("location.usingSelected")}</p>
          {manualLocationLabel && (
            <p className="mt-0.5 text-ink-800">{manualLocationLabel}</p>
          )}
          {message && <p className="mt-1 opacity-85">{message}</p>}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onChooseLocation}>
              {t("location.changeLocation")}
            </Button>
            {onUseDeviceLocation && (
              <Button variant="ghost" size="sm" onClick={onUseDeviceLocation}>
                <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                {t("location.useDeviceLocation")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const fatal =
    status === "error" ||
    status === "unsupported" ||
    (status === "permission_denied" && !hasPosition);

  const nonFatal =
    (status === "temporarily_unavailable" && hasPosition) ||
    (status === "permission_denied" && hasPosition) ||
    status === "updating";

  if (fatal) {
    // Desktop fallback: the browser returned a fix, but it was too coarse
    // (rejected by the 5 km guard). Explain what actually happened without
    // exposing the raw accuracy value.
    if (status === "error" && failure?.coarseAccuracy === true) {
      return (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-3 py-3 text-caption leading-relaxed text-warning-strong",
            className,
          )}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold">
              {t("location.coarseTitle")}
            </p>
            <p className="mt-0.5 opacity-90">{t("location.coarseBody")}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onChooseLocation}>
                <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
                {t("location.chooseALocation")}
              </Button>
              <Button variant="ghost" size="sm" onClick={onRetry}>
                {t("location.tryAgain")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-2.5 rounded-lg border px-3 py-3 text-caption leading-relaxed",
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
              ? t("location.denied")
              : status === "unsupported"
                ? t("location.unsupported")
                : t("location.couldNotGet")}
          </p>
          <p className="mt-0.5 opacity-90">{message}</p>
          {status === "permission_denied" && (
            <p className="mt-1.5 opacity-80">
              {t("location.deniedTipBefore")}{" "}
              <strong>{t("filters.nearMe")}</strong>{" "}
              {t("location.deniedTipAfter")}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("location.tryAgain")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onChooseLocation}>
              <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
              {t("location.chooseALocation")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onSearchByCity}>
              {t("location.searchByCity")}
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
          "flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-caption leading-relaxed text-warning-strong",
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
              ? t("location.trackingPaused")
              : status === "updating"
                ? t("location.updating")
                : t("location.lastKnown")}
          </p>
          <p className="mt-0.5 opacity-90">
            {status === "permission_denied"
              ? t("location.trackingPausedBody")
              : status === "updating"
                ? t("location.updatingBody")
                : (message ?? t("location.lastKnownBody"))}
          </p>
          {status === "temporarily_unavailable" && onRetry && (
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={onRetry}>
                {t("location.updateLocation")}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Healthy state — device GPS (never shown for manual; that has its own panel).
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
        <span>{t("location.usingCurrent")}</span>
        {isWatching && (
          <span className="text-ink-500">{t("location.liveTrackingOn")}</span>
        )}
      </p>
    );
  }

  return null;
}
