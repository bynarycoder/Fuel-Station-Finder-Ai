"use client";

/**
 * Location primer — shown BEFORE the browser permission prompt.
 *
 * Asking for GPS cold, with no explanation, is the single easiest way to lose
 * a Nigerian driver's trust (and to get a permanent "Block"). This compact
 * card tells them what they get in one line, then triggers the shared
 * `requestLocation()` lifecycle — the same one "Near me" uses. It never
 * invents a location and always offers the manual path.
 *
 * Redesigned to the reference: a single compact card (icon + one-line copy +
 * inline actions) instead of the previous tall two-block prompt, so the
 * station sheet's first card stays visible beneath it.
 */

import { MapPinned, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LocationPrimer({
  onUseLocation,
  onSearchManually,
  loading = false,
  className,
}: {
  onUseLocation: () => void;
  onSearchManually: () => void;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-brand-200 bg-surface p-3 shadow-e1",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <MapPinned className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-body-sm font-semibold text-ink-900">
            Find stations around you
          </h2>
          <p className="truncate text-caption text-ink-500">
            Allow location access for real distances and directions.
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          onClick={onUseLocation}
          disabled={loading}
        >
          <MapPinned className="h-4 w-4" aria-hidden="true" />
          {loading ? "Locating…" : "Use my location"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onSearchManually}>
          Search manually
        </Button>
        <p className="flex min-w-0 items-center gap-1 text-caption text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
          <span className="truncate">Used only to search — never stored.</span>
        </p>
      </div>
    </div>
  );
}
