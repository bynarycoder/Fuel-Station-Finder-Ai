"use client";

/**
 * AppHeader — compact, consistent across every page.
 *
 * The previous header carried seven interactive elements and wrapped onto
 * three rows at 360 px, pushing the map below the fold. Secondary destinations
 * (Live reports, About, Admin) now live in the account menu and the mobile
 * bottom nav, leaving the header to do the two jobs a header should:
 * identify the product, and give access to the account.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Info,
  LogOut,
  MessageSquare,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-react";

import { BrandGlyph } from "@/components/shell/BrandGlyph";
import { ThemeControl } from "@/components/shell/ThemeControl";
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
  /** Opens the community reports panel (desktop only; mobile uses the nav). */
  onOpenReports?: () => void;
  /** Subtitle shown under the wordmark on ≥sm. */
  subtitle?: string;
  className?: string;
}

export function AppHeader({
  authReady,
  isAuthed,
  isAuthAvailable,
  isAdmin,
  email,
  onSignIn,
  onSignUp,
  onSignOut,
  onOpenReports,
  subtitle = "Find fuel across Nigeria",
  className,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header
      className={cn(
        "z-header flex h-14 shrink-0 items-center justify-between gap-3 border-b border-brand-800/40 bg-brand-900 px-3 text-white sm:h-16 sm:px-5",
        className,
      )}
    >
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
      >
        <BrandGlyph />
        <span className="min-w-0">
          <span className="block truncate text-h3 leading-tight text-white">
            FuelFinder
            <span className="ml-1 text-caption font-semibold text-accent-300">AI</span>
          </span>
          <span className="hidden truncate text-caption text-brand-200 sm:block">
            {subtitle}
          </span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeControl compact />

        {onOpenReports && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenReports}
            className="hidden text-brand-100 hover:bg-white/10 hover:text-white md:inline-flex"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Live reports
          </Button>
        )}

        {authReady && isAuthed ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-10 max-w-[168px] items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2.5 text-body-sm font-semibold text-white transition-colors hover:bg-white/15"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent-400 text-[11px] font-bold text-brand-950">
                {(email ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="hidden truncate sm:inline">
                {email?.split("@")[0]}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-header w-56 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-e3 animate-slide-up"
              >
                <p className="truncate px-3 py-2 text-caption text-ink-500">
                  Signed in as <span className="font-semibold text-ink-800">{email}</span>
                </p>
                <span className="block h-px bg-hairline" />
                {isAdmin && (
                  <MenuLink href="/admin" icon={ShieldCheck}>
                    Admin dashboard
                  </MenuLink>
                )}
                <MenuLink href="/about" icon={Info}>
                  About this project
                </MenuLink>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-body-sm font-medium text-danger-strong transition-colors hover:bg-danger-soft"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : authReady && isAuthAvailable ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignIn}
              className="text-brand-100 hover:bg-white/10 hover:text-white"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              Sign in
            </Button>
            <Button variant="accent" size="sm" onClick={onSignUp}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Create account</span>
              <span className="sm:hidden">Sign up</span>
            </Button>
          </>
        ) : (
          <Link
            href="/about"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-body-sm font-semibold text-brand-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            About
          </Link>
        )}
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 px-3 py-2.5 text-body-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
    >
      <Icon className="h-4 w-4 text-ink-400" aria-hidden="true" />
      {children}
    </Link>
  );
}
