"use client";

/**
 * Button — the product's single action primitive (cva + design tokens).
 *
 * Variants map to intent, not colour:
 * - `primary`   brand action ("Get directions", "Submit")
 * - `accent`    the ONE most important action on a surface ("Near me")
 * - `secondary` bordered, neutral ("Report update")
 * - `ghost`     low emphasis, inline
 * - `quiet`     tinted, no border — used inside cards/sheets
 * - `danger`    destructive
 *
 * Sizes keep a ≥44 px touch target on `md`/`lg`; `sm` is only for dense
 * desktop rails and `icon` uses a 44 px hit area with a smaller visual box.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-semibold transition-all duration-fast ease-entrance",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.98]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-action text-action-fg shadow-e1 hover:bg-action-hover hover:shadow-e2",
        accent:
          "bg-accent-400 text-[#2b1a02] shadow-e1 hover:bg-accent-300 hover:shadow-e2",
        secondary:
          "border border-hairline bg-surface text-ink-800 shadow-e1 hover:border-ink-300 hover:bg-ink-50",
        ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-800",
        quiet:
          "bg-brand-50 text-brand-800 hover:bg-brand-100",
        danger:
          "bg-danger text-white shadow-e1 hover:bg-danger-strong",
      },
      /**
       * Heights are the VISUAL box. On touch devices the compact sizes are
       * expanded to a 44 px hit area via `pointer-coarse:` so dense desktop
       * rails stay tight without ever shipping a sub-44 px tap target to a
       * phone (WCAG 2.5.8 / iOS + Android guidance).
       */
      size: {
        xs: "h-8 rounded-md px-2.5 text-caption pointer-coarse:min-h-touch",
        sm: "h-9 rounded-md px-3 text-body-sm pointer-coarse:min-h-touch",
        md: "h-11 rounded-lg px-4 text-body-sm",
        lg: "h-12 rounded-lg px-5 text-body",
        icon: "h-11 w-11 rounded-lg",
        "icon-sm": "h-9 w-9 rounded-md pointer-coarse:min-h-touch pointer-coarse:min-w-touch",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/** Anchor styled as a button — for real navigations (directions, external). */
export const ButtonLink = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & VariantProps<typeof buttonVariants>
>(({ className, variant, size, block, ...props }, ref) => (
  <a
    ref={ref}
    className={cn(buttonVariants({ variant, size, block }), "no-underline", className)}
    {...props}
  />
));
ButtonLink.displayName = "ButtonLink";

export { buttonVariants };
