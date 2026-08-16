"use client";

/**
 * Overlay surfaces: BottomSheet (mobile-first), SidePanel (desktop drawer) and
 * Modal. All three share one behaviour contract:
 *
 * - Escape closes, the scrim closes, focus is trapped while open
 * - Focus returns to the trigger on close
 * - `role="dialog"` + `aria-modal` + a labelled title
 * - Reduced-motion users get no transform animation (handled globally in CSS)
 *
 * These replace the ad-hoc `SlideOver`/`CenteredModal` helpers that previously
 * lived inside `app/page.tsx` with no focus management at all.
 */

import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/* --------------------------------------------------------- shared plumbing */

function useDialogBehaviour(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // Move focus into the dialog without stealing it from an autofocused field.
    const raf = requestAnimationFrame(() => {
      const root = containerRef.current;
      if (!root) return;
      if (root.contains(document.activeElement)) return;
      const target =
        root.querySelector<HTMLElement>("[data-autofocus]") ??
        root.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
      target?.focus();
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  return containerRef;
}

/**
 * How many pixels of the layout viewport the on-screen keyboard is covering.
 *
 * A bottom-anchored dialog is positioned against the LAYOUT viewport, which
 * does not shrink when the soft keyboard opens — so on a phone the keyboard
 * sits on top of the dialog's last row (the report form's Submit button, the
 * AI composer). `visualViewport` reports the actually-visible area; padding
 * the overlay by the difference lifts the dialog above the keyboard.
 *
 * Returns 0 when the API is unavailable (SSR, jsdom, older browsers), so the
 * layout is exactly what it was before.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // offsetTop accounts for a viewport scrolled by the focused field.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Ignore sub-100px changes: those are toolbar collapses, not keyboards.
      setInset(covered > 100 ? Math.round(covered) : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);

  return inset;
}

function Scrim({ onClose }: { onClose: () => void }) {
  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className="absolute inset-0 bg-ink-900/45 animate-fade-in backdrop-blur-[1px]"
    />
  );
}

export function DialogHeader({
  title,
  subtitle,
  onClose,
  titleId,
  className,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  titleId?: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-hairline bg-surface px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="truncate text-h2 text-ink-900">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 truncate text-caption text-ink-500">{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Modal ---- */

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}) {
  const ref = useDialogBehaviour(open, onClose);
  // Hooks must run unconditionally — `open` gates the effect, not the call.
  const keyboardInset = useKeyboardInset(open);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-modal flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
    >
      <Scrim onClose={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 flex max-h-sheet w-full flex-col overflow-hidden bg-surface shadow-e3",
          "rounded-t-2xl animate-sheet-in sm:max-w-md sm:rounded-2xl sm:animate-slide-up",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- SidePanel ---- */

/**
 * Right-side drawer on desktop; full-height bottom sheet on mobile.
 * Used for station detail and the community feed.
 */
export function SidePanel({
  open,
  onClose,
  children,
  labelledBy,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}) {
  const ref = useDialogBehaviour(open, onClose);
  const keyboardInset = useKeyboardInset(open);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-modal flex items-end justify-end sm:items-stretch"
      style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
    >
      <Scrim onClose={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 flex h-sheet-tall w-full flex-col overflow-hidden bg-canvas shadow-e3",
          "rounded-t-2xl animate-sheet-in",
          "sm:h-full sm:w-full sm:max-w-[440px] sm:rounded-none sm:animate-panel-in",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- BottomSheet --- */

export type SheetSnap = "peek" | "half" | "full";

const SNAP_CLASS: Record<SheetSnap, string> = {
  peek: "h-[38%]",
  half: "h-[62%]",
  full: "h-[92%]",
};

/**
 * Non-modal bottom sheet that co-exists with the map (the map stays
 * interactive above it). Drag the grabber, or use the keyboard: ArrowUp /
 * ArrowDown move between snap points, Escape collapses to peek.
 */
export function BottomSheet({
  snap,
  onSnapChange,
  title,
  children,
  className,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const startY = useRef<number | null>(null);

  const order: SheetSnap[] = ["peek", "half", "full"];

  const move = useCallback(
    (delta: number) => {
      const i = order.indexOf(snap);
      const next = order[Math.min(order.length - 1, Math.max(0, i + delta))];
      if (next !== snap) onSnapChange(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, onSnapChange],
  );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "pointer-events-auto absolute inset-x-0 bottom-0 z-sheet flex flex-col",
        "rounded-t-2xl border-t border-hairline bg-surface shadow-e3",
        "transition-[height] duration-slow ease-entrance",
        SNAP_CLASS[snap],
        className,
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`${title} — drag or use arrow keys to resize`}
        aria-expanded={snap !== "peek"}
        className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-1 rounded-t-2xl px-4 pb-1 pt-2 active:cursor-grabbing"
        onPointerDown={(e) => {
          startY.current = e.clientY;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (startY.current == null) return;
          const dy = e.clientY - startY.current;
          startY.current = null;
          if (Math.abs(dy) < 24) {
            // Treat as a tap: cycle up, wrapping back to peek from full.
            onSnapChange(snap === "full" ? "peek" : snap === "half" ? "full" : "half");
            return;
          }
          move(dy < 0 ? 1 : -1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Escape") {
            onSnapChange("peek");
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSnapChange(snap === "full" ? "peek" : "full");
          }
        }}
      >
        <span className="h-1.5 w-10 rounded-pill bg-ink-300" aria-hidden="true" />
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {children}
      </div>
    </section>
  );
}
