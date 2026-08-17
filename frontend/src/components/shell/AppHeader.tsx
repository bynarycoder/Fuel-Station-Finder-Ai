"use client";

/**
 * AppHeader — the finder's top bar, following the reference design.
 *
 * Composition: [menu] [brand mark + wordmark] ………… [theme] [avatar/account]
 *
 * Two deliberate departures from the previous header:
 *
 * 1. It sits on `surface`, not a saturated green slab. The reference treats
 *    the MAP as the coloured surface and keeps the chrome quiet, which is
 *    also what makes a single header work in both themes without a separate
 *    dark treatment.
 * 2. The account control is an avatar button that opens the Account sheet
 *    (owned by the page), rather than a bespoke dropdown duplicating the
 *    destinations that now live in Account. Signed-out users still get the
 *    explicit Sign in / Sign up pair, because burying auth behind an avatar
 *    is how people fail to realise they can contribute reports.
 *
 * The `menu` slot on the left is wired by the page to the Account sheet on
 * mobile; the About/Admin links it used to hold now live there.
 */

import Link from "next/link";
import { Info, Menu, User, UserPlus } from "lucide-react";

import { BrandGlyph } from "@/components/shell/BrandGlyph";
import { ThemeToggleButton } from "@/components/theme/ThemeSelector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The brand mark. The glyph itself lives in `BrandGlyph` so server components
 * can use it too; this re-export keeps the historical import path working.
 */
export { BrandGlyph as BrandMark } from "@/components/shell/BrandGlyph";

interface AppHeaderProps {
  authReady: boolean;
  isAuthed: boolean;
  isAuthAvailable: boolean;
  isAdmin: boolean;
  email?: string | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  /** Opens the account/profile surface (avatar + hamburger). */
  onOpenAccount?: () => void;
  /** Subtitle shown under the wordmark on ≥sm. */
  subtitle?: string;
  className?: string;
}

export function AppHeader({
  authReady,
  isAuthed,
  isAuthAvailable,
  email,
  onSignIn,
  onSignUp,
  onOpenAccount,
  subtitle = "Find fuel across Nigeria",
  className,
}: AppHeaderProps) {
  const initial = (email ?? "?").charAt(0).toUpperCase();

  return (
    <header
      className={cn(
        "z-header header-safe flex shrink-0 items-center justify-between gap-2 border-b border-hairline bg-surface px-2 sm:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        {onOpenAccount && (
          <button
            type="button"
            onClick={onOpenAccount}
            aria-label="Open menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <BrandGlyph />
          <span className="min-w-0">
            <span className="block truncate text-h3 leading-tight text-ink-900">
              FuelFinder
              <span className="ml-1 text-caption font-semibold text-brand-600">AI</span>
            </span>
            <span className="hidden truncate text-caption text-ink-500 sm:block">
              {subtitle}
            </span>
          </span>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggleButton />

        {authReady && isAuthed ? (
          <button
            type="button"
            onClick={onOpenAccount}
            aria-label={`Account — signed in as ${email ?? "your account"}`}
            className="flex h-11 items-center gap-2 rounded-pill px-1 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-action text-body-sm font-bold text-action-fg">
              {initial}
            </span>
            <span className="hidden max-w-[120px] truncate pr-2 text-body-sm font-semibold text-ink-800 sm:inline">
              {email?.split("@")[0]}
            </span>
          </button>
        ) : authReady && isAuthAvailable ? (
          <>
            {/* Icons drop out below `sm`: on a 320 px screen the menu, brand,
                theme toggle and two labelled actions already fill the bar. */}
            <Button variant="ghost" size="sm" onClick={onSignIn}>
              <User className="hidden h-4 w-4 sm:block" aria-hidden="true" />
              Sign in
            </Button>
            <Button variant="primary" size="sm" onClick={onSignUp}>
              <UserPlus className="hidden h-4 w-4 sm:block" aria-hidden="true" />
              <span className="hidden sm:inline">Create account</span>
              <span className="sm:hidden">Sign up</span>
            </Button>
          </>
        ) : (
          <Link
            href="/about"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-body-sm font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            About
          </Link>
        )}
      </div>
    </header>
  );
}
