"use client";

/**
 * MobileBottomNav — thumb-reachable navigation for the finder.
 *
 * Four destinations, each a real action (never a decorative tab):
 *   Map      → collapse the sheet, show the map
 *   List     → expand the sheet to full-height station list
 *   Ask AI   → open Fuel Intelligence
 *   Reports  → open the community reports feed
 *
 * 56 px targets, safe-area aware, hidden on ≥lg where the split layout makes
 * every destination visible at once.
 */

import { List, Map as MapIcon, MessageSquare, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export type FinderTab = "map" | "list" | "ai" | "reports";

interface MobileBottomNavProps {
  active: FinderTab;
  onChange: (tab: FinderTab) => void;
  /** Count badge on the list tab. */
  stationCount?: number;
  className?: string;
}

const TABS: Array<{ id: FinderTab; label: string; Icon: typeof MapIcon }> = [
  { id: "map", label: "Map", Icon: MapIcon },
  { id: "list", label: "Stations", Icon: List },
  { id: "ai", label: "Ask AI", Icon: Sparkles },
  { id: "reports", label: "Reports", Icon: MessageSquare },
];

export function MobileBottomNav({
  active,
  onChange,
  stationCount,
  className,
}: MobileBottomNavProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "z-nav flex h-nav shrink-0 items-stretch border-t border-hairline bg-surface pb-safe shadow-[0_-2px_12px_-4px_rgb(20_27_33_/_0.10)]",
        className,
      )}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 pt-1 text-[11px] font-semibold transition-colors duration-fast",
              isActive ? "text-brand-700" : "text-ink-500 hover:text-ink-700",
            )}
          >
            <span
              className={cn(
                "absolute top-0 h-0.5 w-8 rounded-pill transition-all duration-base ease-entrance",
                isActive ? "bg-brand-600 opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            <span className="relative">
              <Icon
                className={cn("h-5 w-5", isActive && "stroke-[2.4]")}
                aria-hidden="true"
              />
              {id === "list" && typeof stationCount === "number" && stationCount > 0 && (
                <span className="absolute -right-2.5 -top-1.5 rounded-pill bg-brand-700 px-1.5 text-[9px] font-bold leading-4 text-white">
                  {stationCount > 99 ? "99+" : stationCount}
                </span>
              )}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
