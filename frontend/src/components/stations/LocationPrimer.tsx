"use client";

/**
 * Location primer — shown BEFORE the browser permission prompt.
 *
 * Asking for GPS cold, with no explanation, is the single easiest way to lose
 * a Nigerian driver's trust (and to get a permanent "Block"). This card tells
 * them what they get and what we do with it, then triggers the shared
 * `requestLocation()` lifecycle — the same one "Near me" uses. It never
 * invents a location and always offers the manual path.
 *
 * Two densities (spec §15 — "location access must stay compact"):
 *
 *   `compact` (default on the mobile bottom sheet)
 *      one row: icon · headline + one line · "Use my location".
 *      It costs ~72 px, so it can never eat the map.
 *
 *   full (desktop rail, where vertical space is not contested)
 *      the same content plus the privacy footnote.
 *
 * The primer is rendered ONLY while permission has not been granted; once a
 * location exists the caller drops it and shows nearby stations instead.
 */

import { MapPinned, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LocationPrimer({
  onUseLocation,
  onSearchManually,
  loading = false,
  compact = false,
  className,
}: {
  onUseLocation: () => void;
  onSearchManually: () => void;
  loading?: boolean;
  /** Single-row treatment for space-constrained surfaces (the sheet). */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/60 p-2.5",
          className,
        )}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-action text-action-fg"
          aria-hidden="true"
        >
          <MapPinned className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-semibold text-ink-900">
            {t("location.primerTitle")}
          </p>
          <button
            type="button"
            onClick={onSearchManually}
            className="truncate text-caption text-ink-500 underline-offset-2 hover:text-brand-700 hover:underline"
          >
            {t("location.primerCompactCta")}
          </button>
        </div>
        <Button
          variant="accent"
          size="sm"
          onClick={onUseLocation}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? t("location.locating") : t("location.allow")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-brand-200 bg-surface shadow-e1",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <MapPinned className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-ink-900">{t("location.primerTitle")}</h2>
          <p className="mt-1 text-body-sm text-ink-600">
            {t("location.primerBody")}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="accent" onClick={onUseLocation} disabled={loading}>
              <MapPinned className="h-4 w-4" aria-hidden="true" />
              {loading ? t("location.locating") : t("location.useMyLocation")}
            </Button>
            <Button variant="secondary" onClick={onSearchManually}>
              {t("location.searchManually")}
            </Button>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-1.5 border-t border-hairline bg-ink-50 px-4 py-2.5 text-caption text-ink-500">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
        {t("location.privacyNote")}
      </p>
    </div>
  );
}
