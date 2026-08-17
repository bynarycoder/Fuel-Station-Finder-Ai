/**
 * BrandGlyph — the FuelFinder mark: a fuel drop with a navigation chevron
 * inside it, because the product is fuel meeting wayfinding.
 *
 * Extracted into its own module so server components (the footer, the About
 * page) can render the brand without importing the client-side `AppHeader`
 * and dragging its menu state into the bundle. `AppHeader` re-exports it as
 * `BrandMark` so existing call sites keep working.
 */

import { cn } from "@/lib/utils";

export function BrandGlyph({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg bg-action shadow-e1",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M12 2.6c3.4 4 5.4 6.8 5.4 9.4A5.4 5.4 0 0 1 12 17.4a5.4 5.4 0 0 1-5.4-5.4c0-2.6 2-5.4 5.4-9.4Z"
          className="fill-action-fg"
        />
        <path
          d="M12 8.4l2.9 5.9L12 13l-2.9 1.3L12 8.4Z"
          className="fill-action"
        />
      </svg>
    </span>
  );
}
