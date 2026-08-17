"use client";

/**
 * Compact floating control group for the map.
 *
 * One vertical stack in the bottom-right, out of the way of the bottom sheet
 * and the mobile nav, instead of the old wide text button that competed with
 * the map. Each control is a real 44 px touch target with a screen-reader
 * label; the locate button reflects the shared location state machine.
 */

import { Crosshair, Loader2, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
  /** True while a fix is being acquired. */
  locating?: boolean;
  /** True when live tracking is active (control reads as "on"). */
  tracking?: boolean;
  /** Offsets the stack above the bottom sheet on mobile. */
  className?: string;
}

export function MapControls({
  onZoomIn,
  onZoomOut,
  onLocate,
  locating = false,
  tracking = false,
  className,
}: MapControlsProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-3 z-mapctl flex flex-col items-end gap-2",
        className,
      )}
    >
      <div className="flex flex-col overflow-hidden rounded-md border border-hairline bg-surface shadow-e2">
        <ControlButton label="Zoom in" onClick={onZoomIn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </ControlButton>
        <span className="h-px w-full bg-hairline" aria-hidden="true" />
        <ControlButton label="Zoom out" onClick={onZoomOut}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </ControlButton>
      </div>

      <button
        type="button"
        onClick={onLocate}
        disabled={locating}
        aria-label={tracking ? "Recenter on my location" : "Find my location"}
        aria-pressed={tracking}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-md border shadow-e2 transition-colors duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
          tracking
            ? "border-action bg-action text-action-fg hover:bg-action-hover"
            : "border-hairline bg-surface text-ink-700 hover:bg-ink-50",
          locating && "opacity-70",
        )}
      >
        {locating ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Crosshair className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center text-ink-700 transition-colors duration-fast hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
    >
      {children}
    </button>
  );
}
