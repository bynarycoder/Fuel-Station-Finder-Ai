import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Brain,
  ClipboardList,
  Compass,
  Database,
  Flag,
  Fuel,
  Gauge,
  Layers,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Linkedin,
  Scale,
  Search,
  ShieldCheck,
  Signal,
  Sparkles,
  TriangleAlert,
  Wallet,
  Wifi,
} from "lucide-react";

import { AppFooter } from "@/components/shell/AppFooter";
import { BrandGlyph } from "@/components/shell/BrandGlyph";
import { Badge } from "@/components/ui/Badge";
import {
  CREATOR,
  CREATOR_TEL_HREF,
  PORTFOLIO,
  TECH_STACK,
} from "@/lib/siteInfo";

export const metadata: Metadata = {
  title: "About — FuelFinder AI",
  description:
    "Why FuelFinder AI exists, how it finds fuel near you, where its data comes from, and who built it.",
};

/**
 * About — the trust page.
 *
 * A user who has just been told "this station has petrol at ₦1,020" wants to
 * know who says so and how sure they are. So this page is organised around
 * that question: the problem, the mission, the mechanism, the intelligence
 * layer, and — most importantly — an honest account of the data's limits.
 *
 * Server component: static content, zero client JS.
 */
export default function AboutPage() {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <SiteHeader />

      <main id="main" className="flex-1">
        <Hero />

        <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:space-y-14 sm:px-6 sm:py-16 lg:px-8">
          <Problem />
          <Mission />
          <HowItWorks />
          <FuelIntelligenceSection />
          <DataAndTrust />
          <BuiltForNigeria />
          <Technology />
          <Creator />
          <Portfolio />
          <ClosingCta />
        </div>
      </main>

      <AppFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-header flex h-12 items-center justify-between gap-2 bg-slab px-3 shadow-e2 sm:h-14 sm:px-6">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slab"
      >
        <BrandGlyph className="h-8 w-8" />
        <span>
          <span className="block whitespace-nowrap text-body font-bold leading-tight text-white sm:text-h3">
            FuelFinder
            <span className="ml-1 text-brand-200">AI</span>
          </span>
          <span className="hidden text-caption text-slab-muted sm:block">
            Fuel intelligence for Nigerian drivers
          </span>
        </span>
      </Link>
      <Link
        href="/"
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-accent-400 px-2.5 text-caption font-semibold text-brand-950 transition-colors hover:bg-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slab sm:h-10 sm:gap-1.5 sm:px-3.5 sm:text-body-sm"
      >
        Open the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </header>
  );
}

/* -------------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-sheen">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-pill bg-brand-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-10 opacity-[0.06]"
      >
        <Fuel className="h-80 w-80 text-white" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-3xl">
          <Badge tone="solid-accent" size="md">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Nigerian fuel intelligence
          </Badge>

          <h1 className="mt-5 text-display text-white sm:text-[2.5rem] sm:leading-[3rem]">
            Find fuel smarter.
            <br />
            <span className="text-accent-300">Drive with confidence.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-body leading-relaxed text-slab-muted sm:text-[1.0625rem] sm:leading-7">
            FuelFinder AI turns scattered rumours about who has fuel into
            something you can act on: a live map of stations near you, prices
            reported by other drivers, and an AI layer that explains its
            recommendation instead of just asserting one.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent-400 px-5 text-body-sm font-semibold text-brand-950 shadow-e1 transition-colors hover:bg-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slab"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Find fuel near you
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 text-body-sm font-semibold text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slab"
            >
              See how it works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- problem */

const PROBLEM_POINTS = [
  {
    Icon: Wallet,
    title: "Fuel spent finding fuel",
    body: "Driving station to station during a scarcity burns the very thing you are looking for — and the queue you join may already be dry.",
  },
  {
    Icon: MessageSquare,
    title: "Information travels by rumour",
    body: "Prices and availability move through WhatsApp groups and word of mouth. By the time news reaches you it is hours old and unverifiable.",
  },
  {
    Icon: Scale,
    title: "Prices vary street by street",
    body: "The same litre can differ by hundreds of naira across a single city, and there is no easy way to compare before committing to a trip.",
  },
] as const;

function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Fuel hunting is expensive, and the information is broken"
      lead="Nigerian drivers routinely lose hours and litres to a market where nobody publishes what a station actually has right now."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {PROBLEM_POINTS.map(({ Icon, title, body }) => (
          <article
            key={title}
            className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-soft text-danger-strong">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-3.5 text-h3 text-ink-900">{title}</h3>
            <p className="mt-1.5 text-body-sm leading-relaxed text-ink-600">{body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------- mission */

function Mission() {
  return (
    <Section id="mission" eyebrow="Our mission" title="Make every trip to the pump a decided one">
      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-brand-50 p-6 shadow-e1 sm:p-8">
        <p className="max-w-3xl text-body leading-relaxed text-ink-800 sm:text-[1.0625rem] sm:leading-7">
          We want a driver in Kaduna, Lagos or Enugu to open one app and know —
          before starting the engine — which nearby station has the fuel they
          need, roughly what it costs, and how much to trust that answer. Not a
          guess dressed up as a fact: a recommendation with its evidence
          attached.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { Icon: Compass, label: "Decide before you drive", desc: "Know the destination, not just the direction." },
            { Icon: BadgeCheck, label: "Show the evidence", desc: "Every price carries its source and its age." },
            { Icon: Signal, label: "Work on a real phone", desc: "Fast on mid-range Android and patchy data." },
          ].map(({ Icon, label, desc }) => (
            <div key={label} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action text-action-fg">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-ink-900">{label}</p>
                <p className="mt-0.5 text-caption text-ink-600">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ how it works */

const STEPS = [
  {
    Icon: MapPin,
    title: "Location",
    body: "With your permission, the app reads your GPS position once and keeps it. Accuracy is checked before anything is shown — a vague fix is rejected rather than quietly used.",
  },
  {
    Icon: Search,
    title: "Discovery",
    body: "A PostGIS spatial query finds the stations genuinely inside your radius, sorted nearest first, and plots them on the map with clustering so a dense city stays readable.",
  },
  {
    Icon: Scale,
    title: "Comparison",
    body: "Each station card shows distance, the fuels it carries and the most recent reported price per litre, so you can weigh a cheaper station against a closer one.",
  },
  {
    Icon: ShieldCheck,
    title: "Trust",
    body: "Every station states where its record came from and whether it has been verified. Those are two separate facts and we never merge them into one reassuring badge.",
  },
  {
    Icon: Sparkles,
    title: "Intelligence",
    body: "Ask in plain English — \"cheapest petrol near me\". The AI reads the intent, the ranking is computed deterministically, and the answer explains which facts drove it.",
  },
  {
    Icon: ClipboardList,
    title: "Reporting",
    body: "Saw the price at the pump? A short guided flow — fuel type, price, optional photo — puts it in front of every other driver, and AI scoring flags suspicious submissions.",
  },
] as const;

function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="From your location to a decision, in six steps"
      lead="Each step is deliberately separate, so you can see exactly where a number came from."
    >
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map(({ Icon, title, body }, i) => (
          <li
            key={title}
            className="relative rounded-2xl border border-hairline bg-surface p-5 shadow-e1"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-sheen text-white shadow-e1">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-label uppercase tracking-wide text-ink-400">
                Step {i + 1}
              </span>
            </div>
            <h3 className="mt-3 text-h3 text-ink-900">{title}</h3>
            <p className="mt-1.5 text-body-sm leading-relaxed text-ink-600">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------- fuel intelligence */

function FuelIntelligenceSection() {
  return (
    <Section
      id="fuel-intelligence"
      eyebrow="Fuel Intelligence"
      title="An AI that reasons over facts — and admits what it doesn't know"
      lead="The intelligence layer is a guide, not an oracle. It is wired so that it cannot invent the numbers that matter."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-e1">
          <h3 className="flex items-center gap-2 text-h2 text-ink-900">
            <Brain className="h-5 w-5 text-brand-600" aria-hidden="true" />
            What it does
          </h3>
          <ul className="mt-4 space-y-3.5">
            {[
              ["Understands the question", "\"Diesel under ₦1,000\" or \"closest CNG\" becomes a structured filter — fuel type, price ceiling, distance priority."],
              ["Ranks deterministically", "Ordering is computed in code from distance, price and freshness. The model chooses the words, not the winner."],
              ["Explains the choice", "Every recommendation comes with a plain-language reason built from the same facts shown on the card."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-brand-500" aria-hidden="true" />
                <span>
                  <span className="block text-body-sm font-semibold text-ink-900">{t}</span>
                  <span className="mt-0.5 block text-caption leading-relaxed text-ink-600">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-warning-border bg-warning-soft p-6 shadow-e1">
          <h3 className="flex items-center gap-2 text-h2 text-ink-900">
            <TriangleAlert className="h-5 w-5 text-warning-strong" aria-hidden="true" />
            What it will never do
          </h3>
          <ul className="mt-4 space-y-3.5">
            {[
              ["Invent a price", "If no recent report exists, the answer says the price is unavailable. It never estimates a plausible-looking number."],
              ["Claim availability", "Fuel presence is only ever stated when a report says so. Silence is reported as silence."],
              ["Fabricate verification", "Verification status comes from the database. The model cannot upgrade a station's trustworthiness in prose."],
              ["Guess your location", "Without a real GPS fix it asks for one. There are no fallback city coordinates standing in for you."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-warning-strong" aria-hidden="true" />
                <span>
                  <span className="block text-body-sm font-semibold text-ink-900">{t}</span>
                  <span className="mt-0.5 block text-caption leading-relaxed text-ink-700">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------- data and trust */

const DATA_SOURCES = [
  {
    Icon: Database,
    title: "Imported station data",
    body: "The station catalogue is built from open geographic datasets and public records. It tells you a station exists at a location — not that it has fuel today.",
    tone: "info" as const,
  },
  {
    Icon: MessageSquare,
    title: "Community reports",
    body: "Prices, queue lengths and availability come from drivers at the pump. This is the freshest data in the product and also the most variable.",
    tone: "brand" as const,
  },
  {
    Icon: BadgeCheck,
    title: "Verification",
    body: "Reports are scored for plausibility — price anomalies, suspicious timing, duplicate submissions — and stations carry an explicit verification status.",
    tone: "success" as const,
  },
] as const;

const LIMITATIONS = [
  "A price is a snapshot of the moment it was reported, and pumps change without warning.",
  "Coverage follows our contributors: quiet areas have thinner, older data than busy corridors.",
  "An imported station record can be out of date — a station may have closed or changed brand.",
  "Verification raises confidence; it is not a guarantee, and it never means we inspected the pump.",
] as const;

function DataAndTrust() {
  return (
    <Section
      id="data-trust"
      eyebrow="Data & trust"
      title="Where the numbers come from — and where they stop"
      lead="A fuel app is only worth using if it is honest about its own uncertainty. Here is ours, in full."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {DATA_SOURCES.map(({ Icon, title, body, tone }) => (
          <article
            key={title}
            className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1"
          >
            <span
              className={
                tone === "info"
                  ? "flex h-10 w-10 items-center justify-center rounded-lg bg-info-soft text-info-strong"
                  : tone === "success"
                    ? "flex h-10 w-10 items-center justify-center rounded-lg bg-success-soft text-success-strong"
                    : "flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-800"
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-3.5 text-h3 text-ink-900">{title}</h3>
            <p className="mt-1.5 text-body-sm leading-relaxed text-ink-600">{body}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-hairline bg-ink-50 p-6">
        <h3 className="flex items-center gap-2 text-h3 text-ink-900">
          <TriangleAlert className="h-4 w-4 text-warning-strong" aria-hidden="true" />
          Known limitations
        </h3>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {LIMITATIONS.map((limit) => (
            <li key={limit} className="flex gap-2.5 text-body-sm leading-relaxed text-ink-700">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-pill bg-ink-400" aria-hidden="true" />
              {limit}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-hairline pt-4 text-caption font-medium text-ink-700">
          The rule we hold ourselves to: always confirm at the pump. This app
          narrows your search — it does not replace your eyes.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------- built for Nigeria */

const NIGERIA_POINTS = [
  {
    Icon: Wifi,
    title: "Built for real networks",
    body: "System fonts, no heavy webfonts, cached tiles and an offline page — the app stays usable when the signal drops to 3G or vanishes mid-journey.",
  },
  {
    Icon: Gauge,
    title: "Built for real phones",
    body: "Designed mobile-first from 360 px up, with 44 px touch targets and a bottom sheet you can work one-handed while parked.",
  },
  {
    Icon: Fuel,
    title: "Built for our fuel market",
    body: "PMS, AGO, DPK, LPG and CNG are all first-class, because Nigerian drivers do not all burn the same thing — and scarcity hits each differently.",
  },
  {
    Icon: Flag,
    title: "Built around scarcity",
    body: "Queue length is a field, not an afterthought. The product assumes shortages are normal and treats stale data as a risk to surface, not hide.",
  },
] as const;

function BuiltForNigeria() {
  return (
    <Section
      id="built-for-nigeria"
      eyebrow="Built for Nigeria"
      title="Designed for the conditions it will actually run in"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {NIGERIA_POINTS.map(({ Icon, title, body }) => (
          <article
            key={title}
            className="flex gap-4 rounded-2xl border border-hairline bg-surface p-5 shadow-e1"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-h3 text-ink-900">{title}</h3>
              <p className="mt-1.5 text-body-sm leading-relaxed text-ink-600">{body}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- technology */

function Technology() {
  return (
    <Section
      id="technology"
      eyebrow="Technology"
      title="A production stack, not a prototype"
      lead="Typed end to end, spatially indexed, and tested where correctness matters most."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {TECH_STACK.map((group) => (
          <div
            key={group.group}
            className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1"
          >
            <h3 className="flex items-center gap-2 text-h3 text-ink-900">
              <Layers className="h-4 w-4 text-brand-600" aria-hidden="true" />
              {group.group}
            </h3>
            <ul className="mt-3.5 space-y-2.5">
              {group.items.map((item) => (
                <li key={item.name}>
                  <span className="block text-body-sm font-semibold text-ink-800">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block text-caption text-ink-500">
                    {item.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------- creator */

function Creator() {
  const contacts = [
    { Icon: Mail, label: CREATOR.email, href: `mailto:${CREATOR.email}`, external: false },
    { Icon: Phone, label: CREATOR.phone, href: CREATOR_TEL_HREF, external: false },
    { Icon: Linkedin, label: CREATOR.linkedinLabel, href: CREATOR.linkedinUrl, external: true },
  ] as const;

  return (
    <Section id="creator" eyebrow="The creator" title="Who built this">
      <div className="overflow-hidden rounded-2xl bg-brand-sheen p-6 shadow-e2 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-h1 text-white">{CREATOR.name}</h3>
            <p className="mt-1 text-body-sm text-accent-300">{CREATOR.role}</p>
            <p className="mt-4 max-w-md text-body-sm leading-relaxed text-slab-muted">
              FuelFinder AI was designed and built end to end — the spatial
              backend, the AI layer, and an interface meant to survive a
              one-handed tap on a bumpy road. The guiding principle throughout:
              a product that handles people&apos;s money and time should never
              pretend to know more than it does.
            </p>
          </div>

          <div>
            <h4 className="text-label uppercase tracking-wide text-slab-muted">
              Get in touch
            </h4>
            <ul className="mt-3 space-y-2">
              {contacts.map(({ Icon, label, href, external }) => (
                <li key={label}>
                  <a
                    href={href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="flex min-h-touch items-center gap-3 rounded-lg bg-white/10 px-4 py-2.5 text-body-sm text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slab"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {external && (
                      <>
                        <ArrowUpRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- portfolio */

function Portfolio() {
  return (
    <Section
      id="portfolio"
      eyebrow="Portfolio"
      title="Other work"
      lead="Separate products, included for context on the design and engineering behind this one."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {PORTFOLIO.map((project) => (
          <article
            key={project.name}
            className="rounded-2xl border border-hairline bg-surface p-6 shadow-e1"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-h2 text-ink-900">{project.name}</h3>
              <Badge tone="neutral">{project.tagline}</Badge>
            </div>
            <p className="mt-3 text-body-sm leading-relaxed text-ink-600">
              {project.description}
            </p>
            <p className="mt-3 border-t border-hairline pt-3 text-caption text-ink-500">
              {project.note}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- closing CTA */

function ClosingCta() {
  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50 p-8 text-center shadow-e1">
      <h2 className="text-h1 text-ink-900">Ready to stop hunting?</h2>
      <p className="mx-auto mt-2 max-w-lg text-body-sm leading-relaxed text-ink-600">
        Open the map, share your location once, and see what is actually around
        you.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-action px-6 text-body-sm font-semibold text-white shadow-e1 transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        <MapPin className="h-4 w-4" aria-hidden="true" />
        Find fuel near you
      </Link>
    </section>
  );
}

/* ---------------------------------------------------------------- helpers */

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    // `scroll-mt` clears the sticky header when linked to by hash.
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <p className="text-label uppercase tracking-wide text-brand-700">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-2 max-w-3xl text-h1 text-ink-900 sm:text-display">
        {title}
      </h2>
      {lead && (
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-600">{lead}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}
