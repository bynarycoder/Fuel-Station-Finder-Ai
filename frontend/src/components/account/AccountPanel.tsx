"use client";

/**
 * AccountPanel — the Account / Profile surface from the reference design.
 *
 * Structure: a green profile header (avatar, greeting, email, verified badge)
 * over a rounded card of destination rows, then the theme control, then Sign
 * out.
 *
 * DATA IS REAL. The greeting is derived from the authenticated Supabase
 * user's own email (the reference's "Hello, Ahmed" is a mockup value and is
 * never hardcoded), and "Verified User" reflects the actual `role`/identity
 * the backend returned via /auth/me — it is not decoration. A signed-out
 * visitor gets a sign-in call to action instead of a fake profile.
 *
 * Sign out calls straight through to the existing `useAuth().signOut`, which
 * is Supabase's real session teardown.
 */

import Link from "next/link";
import {
  Bell,
  ChevronRight,
  FileText,
  HelpCircle,
  Heart,
  Info,
  LogOut,
  ShieldCheck,
  UserPlus,
  User as UserIcon,
  X,
} from "lucide-react";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { User } from "@/types/user";
import { useTranslation } from "react-i18next";

interface AccountPanelProps {
  user: User | null;
  isAuthed: boolean;
  isAuthAvailable: boolean;
  isAdmin: boolean;
  /** Number of stations the user has favourited (real favourites state). */
  favoriteCount?: number;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onOpenMyReports: () => void;
  onOpenSavedStations: () => void;
  onClose: () => void;
}

/** "ahmed@example.com" → "Ahmed". Never a hardcoded name. */
function greetingNameFor(user: User | null): string | null {
  const fullName = user?.full_name;
  if (fullName && fullName.trim()) return fullName.trim().split(/\s+/)[0];
  const local = user?.email?.split("@")[0];
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function AccountPanel({
  user,
  isAuthed,
  isAuthAvailable,
  isAdmin,
  favoriteCount,
  onSignIn,
  onSignUp,
  onSignOut,
  onOpenMyReports,
  onOpenSavedStations,
  onClose,
}: AccountPanelProps) {
  const { t } = useTranslation();
  const name = greetingNameFor(user);
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain bg-canvas pb-safe">
      {/* ------------------------------------------------ profile header --- */}
      <div className="relative shrink-0 bg-brand-sheen px-5 pb-7 pt-5 text-slab-fg">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-4 pr-10">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-pill bg-white/15 text-2xl font-bold ring-2 ring-white/25"
          >
            {isAuthed ? initial : <UserIcon className="h-7 w-7" />}
          </span>
          <div className="min-w-0 flex-1">
            {isAuthed ? (
              <>
                <p className="break-words text-h1 text-white">
                  {name ? t("account.hello", { name }) : t("account.yourAccount")}
                </p>
                <p className="mt-0.5 break-all text-body-sm text-white/85">
                  {user?.email}
                </p>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-2.5 py-1 text-caption font-semibold text-white ring-1 ring-white/25">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {isAdmin ? t("account.admin") : t("account.verifiedUser")}
                </span>
              </>
            ) : (
              <>
                <p className="text-h1 text-white">{t("account.welcome")}</p>
                <p className="mt-0.5 text-body-sm text-white/85">
                  {t("account.signInHint")}
                </p>
              </>
            )}
          </div>
        </div>

        {!isAuthed && isAuthAvailable && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="accent" onClick={onSignIn}>
              <UserIcon className="h-4 w-4" aria-hidden="true" />
              {t("nav.signIn")}
            </Button>
            <Button
              variant="secondary"
              onClick={onSignUp}
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {t("nav.createAccount")}
            </Button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- menu card --- */}
      <div className="-mt-4 flex-1 space-y-5 px-4 pb-8">
        <nav
          aria-label="Account"
          className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-e1"
        >
          {isAuthed && (
            <>
              <AccountRow
                icon={FileText}
                title={t("account.myReports")}
                subtitle={t("account.myReportsSub")}
                onClick={onOpenMyReports}
              />
              <AccountRow
                icon={Heart}
                title={t("account.saved")}
                subtitle={
                  typeof favoriteCount === "number" && favoriteCount > 0
                    ? favoriteCount === 1
                      ? t("account.favouriteOne", { count: favoriteCount })
                      : t("account.favourites", { count: favoriteCount })
                    : t("account.yourFavourites")
                }
                onClick={onOpenSavedStations}
              />
            </>
          )}

          <AccountRow
            icon={Bell}
            title={t("account.notifications")}
            subtitle={t("account.notificationsSub")}
            href="/about#notifications"
            onNavigate={onClose}
          />
          <AccountRow
            icon={HelpCircle}
            title={t("account.help")}
            subtitle={t("account.helpSub")}
            href="/about#support"
            onNavigate={onClose}
          />
          <AccountRow
            icon={Info}
            title={t("account.aboutApp")}
            subtitle={t("account.aboutSub")}
            href="/about"
            onNavigate={onClose}
          />
          {isAdmin && (
            <AccountRow
              icon={ShieldCheck}
              title={t("account.adminDash")}
              subtitle={t("account.adminSub")}
              href="/admin"
              onNavigate={onClose}
            />
          )}
        </nav>

        {/* ------------------------------------------------- appearance --- */}
        <section
          aria-labelledby="account-appearance"
          className="rounded-2xl border border-hairline bg-surface p-4 shadow-e1"
        >
          <h3 id="account-appearance" className="text-h3 text-ink-900">
            {t("account.appearance")}
          </h3>
          <p className="mt-0.5 text-caption text-ink-500">
            {t("account.appearanceHint")}
          </p>
          <ThemeSelector className="mt-3" />
          <h3 className="mt-4 text-h3 text-ink-900">{t("language.label")}</h3>
          <p className="mt-0.5 text-caption text-ink-500">
            {t("account.languageHint")}
          </p>
          <LanguageSelector className="mt-3" />
        </section>

        {isAuthed && (
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl border border-danger-border bg-danger-soft px-4 py-3 text-body-sm font-semibold text-danger-strong transition-colors hover:bg-danger-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("account.signOut")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * One destination row. Renders as a <button> for in-app surfaces and a real
 * <Link> for routes, so deep links keep working and middle-click/open-in-new-
 * tab behave natively.
 */
function AccountRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  href,
  onNavigate,
}: {
  icon: typeof Bell;
  title: string;
  subtitle: string;
  onClick?: () => void;
  href?: string;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-body-sm font-semibold text-ink-900">
          {title}
        </span>
        <span className="block truncate text-caption text-ink-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
    </>
  );

  const rowClass = cn(
    "flex min-h-[64px] w-full items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0",
    "transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600",
  );

  if (href) {
    return (
      <Link href={href} onClick={onNavigate} className={rowClass}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={rowClass}>
      {content}
    </button>
  );
}

/** Exported for tests that assert the greeting is derived, never hardcoded. */
export { greetingNameFor };
