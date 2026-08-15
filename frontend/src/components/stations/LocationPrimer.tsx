"use client";

/**
 * Location primer — shown BEFORE the browser permission prompt.
 *
 * Asking for GPS cold, with no explanation, is the single easiest way to lose
 * a Nigerian driver's trust (and to get a permanent "Block"). This card tells
 * them what they get and what we do with it, then triggers the shared
 * `requestLocation()` lifecycle — the same one "Near me" uses. It never
 * invents a location and always offers the manual path.
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
        "overflow-hidden rounded-2xl border border-brand-200 bg-surface shadow-e1",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <MapPinned className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-ink-900">Find stations around you</h2>
          <p className="mt-1 text-body-sm text-ink-600">
            Allow location access to see nearby fuel stations, real distances
            and directions from where you actually are.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="accent" onClick={onUseLocation} disabled={loading}>
              <MapPinned className="h-4 w-4" aria-hidden="true" />
              {loading ? "Locating…" : "Use my location"}
            </Button>
            <Button variant="secondary" onClick={onSearchManually}>
              Search manually
            </Button>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-1.5 border-t border-hairline bg-ink-50 px-4 py-2.5 text-caption text-ink-500">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
        Your position is used only to search for stations. It is never stored on
        our servers.
      </p>
    </div>
  );
}
