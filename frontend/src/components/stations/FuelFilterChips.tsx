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

import { useTranslation } from "react-i18next";

import { FUEL_TYPE_LABELS } from "@/types/station";
import { cn } from "@/lib/utils";
import { useMapStore } from "@/store/useMapStore";

/**
 * Short chip labels; the full product names live in the filter sheet.
 *
 * `labelKey` is translated at render time — the fuel CODE (`PMS`, `AGO`, …)
 * that is written to the store is never localised.
 */
const CHIPS: Array<{ value: string; labelKey: string }> = [
  { value: "", labelKey: "fuel.all" },
  { value: "PMS", labelKey: "fuel.petrol" },
  { value: "AGO", labelKey: "fuel.diesel" },
  { value: "LPG", labelKey: "fuel.lpg" },
  { value: "CNG", labelKey: "fuel.cng" },
];

export function FuelFilterChips({
  className,
  compact = false,
}: {
  className?: string;
  /** Shorter pills for the map-first mobile overlay. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const fuelType = useMapStore((s) => s.filters.fuelType);
  const setFilters = useMapStore((s) => s.setFilters);

  return (
    <div
      role="group"
      aria-label={t("fuel.groupLabel")}
      className={cn(
        "no-scrollbar -mx-1 flex max-h-[60px] flex-nowrap items-center overflow-x-auto overflow-y-hidden px-1",
        compact ? "h-10 gap-1.5 py-0" : "gap-2 py-0.5",
        className,
      )}
    >
      {CHIPS.map(({ value, labelKey }) => {
        const isActive = fuelType === value;
        const label = t(labelKey);
        const fullName =
          value === ""
            ? t("fuel.allTypes")
            : (FUEL_TYPE_LABELS[value as keyof typeof FUEL_TYPE_LABELS] ?? value);
        return (
          <button
            key={value || "all"}
            type="button"
            aria-pressed={isActive}
            aria-label={t("fuel.show", { name: fullName })}
            onClick={() => setFilters({ fuelType: value })}
            className={cn(
              "flex shrink-0 items-center justify-center whitespace-nowrap rounded-pill border font-semibold leading-none",
              compact ? "h-8 px-3 text-caption" : "h-9 px-4 text-body-sm pointer-coarse:min-h-touch",
              "transition-all duration-fast ease-entrance active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
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
