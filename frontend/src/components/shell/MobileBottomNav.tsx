"use client";

/**
 * MobileBottomNav — the product's global bottom navigation.
 *
 * Four destinations, matching the reference design, each a real action:
 *   Map      → collapse the sheet, show the map
 *   AI       → open the Fuel AI assistant
 *   Report   → start a price report (station-aware)
 *   Account  → open the account / profile sheet
 *
 * The station list is NOT a tab: the reference reaches it by dragging the
 * nearby sheet, and spending a quarter of the navigation on "the thing
 * already on screen" is what made the old bar feel like a web dashboard.
 * `stationCount` therefore annotates the Map tab instead.
 *
 * Ergonomics: 56 px targets on a 68 px bar, safe-area aware (iPhone home
 * indicator), and hidden at ≥lg where the split layout exposes every
 * destination at once.
 */

import { Map as MapIcon, MessageSquarePlus, Sparkles, User } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type FinderTab = "map" | "ai" | "report" | "account";

interface MobileBottomNavProps {
  active: FinderTab;
  onChange: (tab: FinderTab) => void;
  /** Count badge on the map tab (stations currently in view). */
  stationCount?: number;
  className?: string;
}

const TABS: Array<{ id: FinderTab; labelKey: string; Icon: typeof MapIcon }> = [
  { id: "map", labelKey: "nav.map", Icon: MapIcon },
  { id: "ai", labelKey: "nav.ai", Icon: Sparkles },
  { id: "report", labelKey: "nav.report", Icon: MessageSquarePlus },
  { id: "account", labelKey: "nav.account", Icon: User },
];

export function MobileBottomNav({
  active,
  onChange,
  stationCount,
  className,
}: MobileBottomNavProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("nav.main")}
      className={cn(
        "z-nav flex h-nav shrink-0 items-stretch border-t border-hairline bg-surface pb-safe",
        "shadow-[0_-2px_12px_-4px_rgb(0_0_0_/_0.10)]",
        className,
      )}
    >
      {TABS.map(({ id, labelKey, Icon }) => {
        const label = t(labelKey);
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 px-1 pt-1",
              "text-[11px] font-semibold leading-tight transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600",
              isActive ? "text-brand-700" : "text-ink-500 hover:text-ink-800",
            )}
          >
            {/* Selected indicator — a colour change alone would be the only
                signal for a colour-blind user, so the bar is doubled up with
                the weight/fill change on the icon. */}
            <span
              className={cn(
                "absolute top-0 h-0.5 w-8 rounded-pill transition-all duration-base ease-entrance",
                isActive ? "bg-action opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            <span className="relative">
              <Icon
                className={cn("h-5 w-5", isActive && "stroke-[2.4]")}
                aria-hidden="true"
              />
              {id === "map" && typeof stationCount === "number" && stationCount > 0 && (
                // The count is 9 px type, so it uses the always-dark brand
                // slab rather than the primary fill: white on the primary
                // green is a 3.1:1 pair — acceptable for a 14 px semibold
                // button label, not for a badge this small.
                <span className="absolute -right-2.5 -top-1.5 rounded-pill bg-slab px-1.5 text-[9px] font-bold leading-4 text-slab-fg">
                  {stationCount > 99 ? "99+" : stationCount}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
