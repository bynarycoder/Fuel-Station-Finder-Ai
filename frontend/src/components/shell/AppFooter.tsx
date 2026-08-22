/**
 * AppFooter — the product's closing statement.
 *
 * Deliberately NOT a strip of grey links. It restates the mission, exposes
 * the honest description of where data comes from, and credits the maker,
 * because on a page about trust the footer is where a sceptical user looks.
 *
 * Design notes:
 * - deep brand gradient so the page ends on the brand, not on empty canvas;
 * - a four-column desktop grid that collapses to a single readable column on
 *   a 360 px phone (no horizontal scroll, no cramped 2-up link lists);
 * - every link and contact row is a ≥44 px touch target on coarse pointers;
 * - contact details are real, actionable links (mailto/tel), not plain text.
 *
 * It is a presentational client component (no state, no effects) — it opts
 * into the client only so its copy can be localised via `useTranslation()`.
 * Station/brand names, contact details and the technology list stay verbatim.
 */

"use client";

import Link from "next/link";
import { Mail, Phone, Linkedin, Sparkles, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BrandGlyph } from "@/components/shell/BrandGlyph";
import {
  CREATOR,
  CREATOR_TEL_HREF,
  FOOTER_NAV,
  TECH_STACK,
} from "@/lib/siteInfo";
import { cn } from "@/lib/utils";

export function AppFooter({ className }: { className?: string }) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "relative overflow-hidden bg-brand-sheen text-slab-muted",
        className,
      )}
    >
      {/* Soft accent bloom — depth without a second background image. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-pill bg-brand-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-pill bg-accent-400/10 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* ------------------------------------------------ mission */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2.5">
              <BrandGlyph />
              <span className="text-h2 leading-tight text-white">
                FuelFinder
                <span className="ml-1 text-caption font-semibold text-accent-300">
                  AI
                </span>
              </span>
            </div>

            <p className="mt-4 max-w-sm text-body-sm leading-relaxed text-slab-muted/90">
              {t("footer.mission")}
            </p>

            <p className="mt-4 inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1.5 text-caption font-semibold text-accent-200 ring-1 ring-inset ring-white/15">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("footer.tagline")}
            </p>
          </div>

          {/* --------------------------------------------- navigation */}
          {FOOTER_NAV.map((section) => (
            <nav
              key={section.group}
              aria-label={section.group}
              className="lg:col-span-2"
            >
              <h2 className="text-label uppercase tracking-wide text-slab-muted">
                {section.group}
              </h2>
              <ul className="mt-3 space-y-0.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="-mx-2 flex min-h-touch items-center rounded-md px-2 text-body-sm text-slab-muted transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slab lg:min-h-0 lg:py-1.5 pointer-coarse:min-h-touch"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* ------------------------------------------------ creator */}
          <div className="lg:col-span-4">
            <h2 className="text-label uppercase tracking-wide text-slab-muted">
              {t("footer.builtBy")}
            </h2>
            <p className="mt-3 text-h3 text-white">{CREATOR.name}</p>
            <p className="mt-0.5 text-caption text-slab-muted">{CREATOR.role}</p>

            <ul className="mt-3 space-y-0.5">
              <li>
                <a
                  href={`mailto:${CREATOR.email}`}
                  className="-mx-2 flex min-h-touch items-center gap-2.5 rounded-md px-2 text-body-sm text-slab-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slab"
                >
                  <Mail className="h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
                  <span className="truncate">{CREATOR.email}</span>
                </a>
              </li>
              <li>
                <a
                  href={CREATOR_TEL_HREF}
                  className="-mx-2 flex min-h-touch items-center gap-2.5 rounded-md px-2 text-body-sm text-slab-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slab"
                >
                  <Phone className="h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
                  <span>{CREATOR.phone}</span>
                </a>
              </li>
              <li>
                <a
                  href={CREATOR.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mx-2 flex min-h-touch items-center gap-2.5 rounded-md px-2 text-body-sm text-slab-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slab"
                >
                  <Linkedin className="h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
                  <span className="truncate">{t("footer.linkedin")}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                  <span className="sr-only">{t("footer.opensInNewTab")}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* ------------------------------------------------ tech stack */}
        <div className="mt-10 border-t border-white/10 pt-6">
          <h2 className="text-label uppercase tracking-wide text-slab-muted">
            {t("footer.technology")}
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
            {TECH_STACK.flatMap((group) => group.items).map((item) => (
              <span
                key={item.name}
                title={item.role}
                className="rounded-pill bg-white/[0.07] px-2.5 py-1 text-caption font-medium text-slab-muted ring-1 ring-inset ring-white/10"
              >
                {item.name}
              </span>
            ))}
          </div>
        </div>

        {/* --------------------------------------------------- legal */}
        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-slab-muted">
            {t("footer.copyright", { year })}
          </p>
          <p className="max-w-md text-caption text-slab-muted sm:text-right">
            {t("footer.disclaimer")}
          </p>
        </div>
      </div>
    </footer>
  );
}
