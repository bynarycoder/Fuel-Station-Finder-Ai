"use client";

/**
 * FuelFilterChips — the "All · Petrol · Diesel · LPG · CNG" pill row from the
 * reference design, sitting directly under the search field.
 *
 * It is a THIN VIEW over the existing filter state: it reads and writes
 * `filters.fuelType` on the shared map store, which is the same field the
 * filter sheet and the nearby query already use. No second filtering system,
 * no local copy of the selection to drift out of sync.
 *
 * Accessibility: a real tablist-style group of toggle buttons with
 * `aria-pressed`, horizontally scrollable on narrow phones (320 px fits
 * "All + Petrol + Diesel" and scrolls to the rest) with the scrollbar hidden
 * but scrolling intact.
 */

import { FUEL_TYPE_LABELS } from "@/types/station";
import { cn } from "@/lib/utils";
import { useMapStore } from "@/store/useMapStore";

/** Short chip labels; the full product names live in the filter sheet. */
const CHIPS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "PMS", label: "Petrol" },
  { value: "AGO", label: "Diesel" },
  { value: "LPG", label: "LPG" },
  { value: "CNG", label: "CNG" },
];

export function FuelFilterChips({ className }: { className?: string }) {
  const fuelType = useMapStore((s) => s.filters.fuelType);
  const setFilters = useMapStore((s) => s.setFilters);

  return (
    <div
      role="group"
      aria-label="Filter by fuel type"
      className={cn(
        "no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5",
        className,
      )}
    >
      {CHIPS.map(({ value, label }) => {
        const isActive = fuelType === value;
        const fullName =
          value === ""
            ? "all fuel types"
            : (FUEL_TYPE_LABELS[value as keyof typeof FUEL_TYPE_LABELS] ?? value);
        return (
          <button
            key={value || "all"}
            type="button"
            aria-pressed={isActive}
            aria-label={`Show ${fullName}`}
            onClick={() => setFilters({ fuelType: value })}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-pill border px-4 text-body-sm font-semibold",
              "transition-all duration-fast ease-entrance active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              "pointer-coarse:min-h-touch",
              isActive
                ? "border-action bg-action text-action-fg shadow-e1"
                : "border-hairline bg-surface text-ink-600 hover:border-brand-300 hover:text-brand-700",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
