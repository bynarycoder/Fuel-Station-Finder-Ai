"use client";

/**
 * Designed loading / empty / error states.
 *
 * The product rule: no screen may ever show a blank area, a bare spinner, or a
 * raw backend error. Every state below is shaped like the content it replaces
 * and every empty/error state offers the user a next action.
 */

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- skeleton */

/** Raw shimmer block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden="true" />;
}

/**
 * Station-card shaped skeleton — mirrors the real card's geometry so the
 * transition to loaded content doesn't reflow the list.
 */
export function StationCardSkeleton() {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-e1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-6 w-16 rounded-pill" />
      </div>
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-5 w-14 rounded-pill" />
        <Skeleton className="h-5 w-20 rounded-pill" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    </div>
  );
}

/** A list of station-card skeletons. */
export function LoadingSkeleton({
  count = 4,
  label = "Loading stations",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: count }).map((_, i) => (
        <StationCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Inline "working" indicator with an intentional 3-bar pulse (used by AI). */
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-end gap-[3px]", className)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-3 w-[3px] origin-bottom rounded-pill bg-current animate-thinking"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------- empty state */

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Compact variant for inside cards. */
  dense?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  dense = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-surface text-center",
        dense ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        className,
      )}
    >
      {Icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-ink-100 text-ink-500">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <p className="text-h3 text-ink-900">{title}</p>
      {description && (
        <p className="max-w-xs text-body-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- error state */

interface ErrorStateProps {
  /** Human sentence. Never a status code, never a stack trace. */
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: ReactNode;
  className?: string;
  dense?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please check your connection and try again.",
  onRetry,
  retryLabel = "Try again",
  secondaryAction,
  className,
  dense = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-danger-border bg-danger-soft text-center",
        dense ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-white text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-h3 text-ink-900">{title}</p>
      {description && (
        <p className="max-w-xs text-body-sm text-ink-600">{description}</p>
      )}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {retryLabel}
          </Button>
        )}
        {secondaryAction}
      </div>
    </div>
  );
}
