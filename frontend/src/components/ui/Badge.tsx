"use client";

/**
 * Badge — the single pill primitive for statuses, counts and metadata.
 *
 * Tones are semantic. Every badge that communicates *status* must also carry
 * an icon or text, never colour alone (WCAG 1.4.1).
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill border font-semibold leading-none",
  {
    variants: {
      tone: {
        neutral: "border-hairline bg-ink-50 text-ink-600",
        brand: "border-brand-200 bg-brand-50 text-brand-800",
        accent: "border-accent-200 bg-accent-50 text-accent-700",
        success: "border-success-border bg-success-soft text-success-strong",
        warning: "border-warning-border bg-warning-soft text-warning-strong",
        danger: "border-danger-border bg-danger-soft text-danger-strong",
        info: "border-info-border bg-info-soft text-info-strong",
        solid: "border-transparent bg-brand-800 text-white",
        "solid-accent": "border-transparent bg-accent-400 text-brand-950",
      },
      size: {
        sm: "px-2 py-[3px] text-[11px]",
        md: "px-2.5 py-1 text-caption",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export { badgeVariants };
