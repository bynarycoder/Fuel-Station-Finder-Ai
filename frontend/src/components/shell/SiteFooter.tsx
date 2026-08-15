import Link from "next/link";
import {
  ExternalLink,
  Heart,
  Info,
  Linkedin,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
} from "lucide-react";

import { BrandMark } from "./AppHeader";

/**
 * SiteFooter — the premium, shared footer for story surfaces (About, and any
 * future standalone page).
 *
 * The finder itself is a full-bleed map app (100dvh, overflow hidden) and
 * deliberately has no footer — a footer there would fight the bottom sheet
 * and bottom nav. This component exists for the pages whose job is to tell
 * the product story and answer "who built this, and with what?".
 *
 * Sections: mission statement · navigate · product (AI + reports) · creator
 * (real developer info) · technology · portfolio (reference-only, not
 * over-branded inside the app).
 */

const NAV_LINKS = [
  { href: "/", label: "Find fuel", icon: MapPin },
  { href: "/about", label: "About", icon: Info },
];

const PRODUCT_LINKS = [
  { href: "/", label: "Fuel Intelligence (Ask AI)", icon: Sparkles },
  { href: "/", label: "Community reports", icon: MessageSquare },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-brand-800/40 bg-brand-950 text-brand-100">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand + mission */}
          <div className="lg:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <BrandMark />
              <span className="text-h3 text-white">
                FuelFinder
                <span className="ml-1 text-caption font-semibold text-accent-300">AI</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-body-sm leading-relaxed text-brand-200">
              Ending the fuel hunt across Nigeria. A transparent fuel discovery
              platform that combines a real station catalogue, community price
              reports and honest AI recommendations — so drivers know where to
              refuel before they leave the house.
            </p>
            <p className="mt-4 flex items-center gap-1.5 text-caption text-brand-300">
              <Heart className="h-3.5 w-3.5 text-accent-400" aria-hidden="true" />
              Built for Nigeria, by a Nigerian developer.
            </p>
          </div>

          {/* Navigate */}
          <nav aria-label="Footer" className="lg:col-span-2">
            <h2 className="text-label uppercase tracking-wide text-brand-300">
              Navigate
            </h2>
            <ul className="mt-4 space-y-3">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="group inline-flex items-center gap-2 text-body-sm text-brand-100 transition-colors hover:text-white"
                  >
                    <Icon
                      className="h-4 w-4 text-brand-400 transition-colors group-hover:text-accent-300"
                      aria-hidden="true"
                    />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Product */}
          <div className="lg:col-span-2">
            <h2 className="text-label uppercase tracking-wide text-brand-300">
              Product
            </h2>
            <ul className="mt-4 space-y-3">
              {PRODUCT_LINKS.map(({ href, label, icon: Icon }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="group inline-flex items-center gap-2 text-body-sm text-brand-100 transition-colors hover:text-white"
                  >
                    <Icon
                      className="h-4 w-4 text-brand-400 transition-colors group-hover:text-accent-300"
                      aria-hidden="true"
                    />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Creator */}
          <div className="lg:col-span-4">
            <h2 className="text-label uppercase tracking-wide text-brand-300">
              Creator
            </h2>
            <p className="mt-4 text-body-sm font-semibold text-white">
              Abdulwahab Abdulyekeen
            </p>
            <ul className="mt-3 space-y-3">
              <li>
                <a
                  href="mailto:bynarytech1@gmail.com"
                  className="group inline-flex items-center gap-2 text-body-sm text-brand-100 transition-colors hover:text-white"
                >
                  <Mail className="h-4 w-4 text-brand-400 transition-colors group-hover:text-accent-300" aria-hidden="true" />
                  bynarytech1@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="tel:+2349044115526"
                  className="group inline-flex items-center gap-2 text-body-sm text-brand-100 transition-colors hover:text-white"
                >
                  <Phone className="h-4 w-4 text-brand-400 transition-colors group-hover:text-accent-300" aria-hidden="true" />
                  0904 411 5526
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/abdulwahab-abdulyekeen-8370363a8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 text-body-sm text-brand-100 transition-colors hover:text-white"
                >
                  <Linkedin className="h-4 w-4 text-brand-400 transition-colors group-hover:text-accent-300" aria-hidden="true" />
                  LinkedIn
                  <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                </a>
              </li>
            </ul>

            {/* Portfolio — reference only */}
            <h2 className="mt-6 text-label uppercase tracking-wide text-brand-300">
              Portfolio
            </h2>
            <ul className="mt-3 space-y-2 text-body-sm text-brand-200">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-accent-400" aria-hidden="true" />
                <span>
                  <span className="font-medium text-brand-100">JobLiberty</span> —
                  UI/UX reference project
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-accent-400" aria-hidden="true" />
                <span>
                  <span className="font-medium text-brand-100">MammoGuard</span> —
                  breast cancer prediction app
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-brand-300">
            © {new Date().getFullYear()} FuelFinder AI. Built for Nigeria.
          </p>
          <p className="text-caption text-brand-300">
            Next.js · FastAPI · Supabase · PostgreSQL/PostGIS
          </p>
        </div>
      </div>
    </footer>
  );
}
