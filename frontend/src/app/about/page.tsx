import Link from "next/link";
import {
  ArrowRight,
  Check,
  Compass,
  Cpu,
  Database,
  Droplets,
  Layers,
  Linkedin,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Radar,
  Route,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { BrandMark } from "@/components/shell/AppHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { Badge } from "@/components/ui/Badge";

/**
 * About — the full product story.
 *
 * Ordered as a story: what it is → the problem → the mission → how it works →
 * how the AI thinks → how trust is earned → why Nigeria → the technology →
 * who built it.
 *
 * JobLiberty and MammoGuard appear ONLY as portfolio references (creator
 * section + footer), never as in-app branding — this product has its own
 * identity.
 */
export default function AboutPage() {
  const steps = [
    {
      icon: MapPin,
      title: "Locate",
      desc: "Share your real GPS position (or pick a place manually). We never invent coordinates.",
    },
    {
      icon: Radar,
      title: "Discover",
      desc: "Metre-accurate PostGIS search finds stations within your chosen radius.",
    },
    {
      icon: Search,
      title: "Compare",
      desc: "Filter by fuel type, brand and city; see reported prices and distances side by side.",
    },
    {
      icon: ShieldCheck,
      title: "Trust",
      desc: "Every station shows its data source and verification status as separate facts.",
    },
    {
      icon: Sparkles,
      title: "Ask AI",
      desc: "Fuel Intelligence recommends a station and explains why — using only real data.",
    },
    {
      icon: MessageSquare,
      title: "Report",
      desc: "Share the price you just saw, with optional proof, to help the next driver.",
    },
  ];

  const trustPillars = [
    {
      icon: Database,
      title: "Imported data",
      desc: "A seeded catalogue of Nigerian stations from structured sources, with provenance preserved on every record.",
    },
    {
      icon: Users,
      title: "Community reports",
      desc: "Drivers submit live prices, queues and availability. Reports are timestamped and tied to a station and fuel type.",
    },
    {
      icon: ShieldCheck,
      title: "Verification system",
      desc: "AI-assisted fraud checks and human review flag suspicious reports before they shape recommendations.",
    },
    {
      icon: Compass,
      title: "Known limitations",
      desc: "Coverage is strongest in major cities; remote areas may be sparse. Prices are always reported, never guaranteed.",
    },
  ];

  const stack = [
    {
      icon: Smartphone,
      title: "Next.js App Router",
      desc: "React 19 + TypeScript. Leaflet/OpenStreetMap with clustering, React Query for remote caching, Zustand for app state.",
    },
    {
      icon: Server,
      title: "FastAPI & SQLAlchemy 2",
      desc: "Async, high-performance API. Pydantic v2 schemas, SQLAlchemy 2.0 ORM with native async, Alembic migrations.",
    },
    {
      icon: ShieldCheck,
      title: "Supabase Auth & Realtime",
      desc: "JWT-verified authentication with application roles (Driver, Station Manager, Admin).",
    },
    {
      icon: Database,
      title: "PostgreSQL & PostGIS",
      desc: "Geography columns and GiST indexes power metre-accurate nearby station search.",
    },
  ];

  const capstoneRequirements = [
    {
      name: "Solve the problem: drivers hunt for fuel",
      desc: "Sourcing verified queue and price data to end fuel-hunting.",
    },
    {
      name: "Interactive map",
      desc: "Live OpenStreetMap + Leaflet map with marker clustering, nearby search and directions.",
    },
    {
      name: "Fuel station list",
      desc: "Paginated list with filters and distance-based nearby search.",
    },
    {
      name: "Filters",
      desc: "Filter by fuel type, brand, city and station name search.",
    },
    {
      name: "Fuel price reports",
      desc: "Crowd-sourced pricing logs and price history by fuel product.",
    },
    {
      name: "Reporting system",
      desc: "Active submission form for live station updates with AI fraud verification.",
    },
  ];

  const phases = [
    { number: 1, name: "Project setup", desc: "Monorepo, Docker, CI/CD Actions, and core dependencies." },
    { number: 2, name: "Database & models", desc: "PostgreSQL schema, PostGIS, SQLAlchemy models, and Alembic migrations." },
    { number: 3, name: "Authentication", desc: "Supabase Auth, JWT verification, and roles." },
    { number: 4, name: "Fuel stations API", desc: "CRUD endpoints, nearby spatial search, and filters." },
    { number: 5, name: "Interactive map UI", desc: "Leaflet, marker clustering, routing, and user geolocation." },
    { number: 6, name: "Fuel reports engine", desc: "User report submission, queue times, and photo uploads." },
    { number: 7, name: "Realtime updates", desc: "Supabase Realtime syncing for instant dashboard refreshes." },
    { number: 8, name: "AI queue & fraud verification", desc: "Visual queue analyzer and natural-language search." },
    { number: 9, name: "Admin dashboard", desc: "Report review, spam moderation, and metrics analytics." },
    { number: 10, name: "Production deployment", desc: "Vercel + Render + Supabase multi-cloud setup." },
  ];

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="sticky top-0 z-header flex h-16 items-center justify-between gap-3 border-b border-brand-800/40 bg-brand-900 px-4 text-white sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300">
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate text-h3 text-white">
              FuelFinder
              <span className="ml-1 text-caption font-semibold text-accent-300">AI</span>
            </span>
            <span className="hidden truncate text-caption text-brand-200 sm:block">
              Find fuel smarter. Drive with confidence.
            </span>
          </span>
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-accent-400 px-3.5 text-body-sm font-semibold text-brand-950 transition-colors hover:bg-accent-300"
        >
          Open the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl bg-brand-sheen p-6 text-white shadow-e2 sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -right-10 opacity-[0.07]"
          >
            <MapPin className="h-72 w-72" />
          </div>
          <div className="relative max-w-2xl">
            <Badge tone="solid-accent" size="md">
              Fuel Station Finder
            </Badge>
            <h1 className="mt-4 text-display text-white sm:text-[2.25rem] sm:leading-[2.65rem]">
              Find fuel smarter. Drive with confidence.
            </h1>
            <p className="mt-3 text-body leading-relaxed text-brand-100">
              Every day, millions of Nigerian motorists waste hours hunting for
              fuel. FuelFinder AI combines a real station catalogue, crowd-sourced
              price reports and honest AI recommendations so drivers know where to
              refuel before they leave the house.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-lg bg-accent-400 px-5 text-body-sm font-semibold text-brand-950 shadow-e1 transition-colors hover:bg-accent-300"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" /> Find fuel near you
            </Link>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/15 pt-5">
              {[
                { Icon: Server, label: "FastAPI backend" },
                { Icon: Smartphone, label: "Next.js 15 frontend" },
                { Icon: Layers, label: "PostGIS spatial search" },
              ].map(({ Icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 text-caption font-medium text-brand-100"
                >
                  <Icon className="h-4 w-4 text-accent-300" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Problem → Mission */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card icon={Droplets} title="The problem" subtitle="Fuel access and price uncertainty in Nigeria">
            <p className="text-body-sm leading-relaxed text-ink-600">
              Fuel scarcity and volatile prices are a daily reality across
              Nigeria. Drivers drive from station to station — burning fuel to
              find fuel — often paying whatever a station charges because they
              have no way to compare ahead of time. The result is wasted time,
              wasted money and long queues at the few stations that actually
              have product.
            </p>
          </Card>
          <Card icon={Route} title="Our mission" subtitle="A transparent fuel discovery system">
            <p className="text-body-sm leading-relaxed text-ink-600">
              FuelFinder AI exists to make fuel discovery transparent. We give
              every driver a live map of stations, community-reported prices and
              queues, and an AI layer that reasons over real data to recommend
              where to go next — so the decision is informed, not a gamble.
            </p>
          </Card>
        </div>

        {/* How it works */}
        <section className="mt-8">
          <h2 className="text-h2 text-ink-900">How it works</h2>
          <p className="mt-1 text-body-sm text-ink-500">
            From your location to a confident refuel, in six steps.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className="rounded-xl border border-hairline bg-surface p-4 shadow-e1"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-caption font-bold text-brand-700">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="mt-3 text-h3 text-ink-900">{title}</h3>
                <p className="mt-1 text-caption leading-relaxed text-ink-600">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Fuel Intelligence */}
        <section className="mt-8">
          <Card
            icon={Sparkles}
            title="Fuel Intelligence"
            subtitle="The AI layer — an intelligence system, not a chatbot"
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-body-sm leading-relaxed text-ink-600">
                  Fuel Intelligence turns a natural request — &ldquo;cheapest
                  petrol near me&rdquo;, &ldquo;closest CNG&rdquo; — into a
                  designed recommendation. The AI parses your intent, the nearby
                  station API retrieves real candidates, deterministic ranking
                  picks the winners, and the AI explains each result using only
                  the facts returned.
                </p>
                <p className="text-body-sm leading-relaxed text-ink-600">
                  Every answer shows <em>why</em> a station was chosen — price,
                  distance, availability — and carries the same provenance badge
                  as anywhere else in the app, so an imported or unverified
                  station stays labelled exactly as it is.
                </p>
              </div>
              <ul className="space-y-3">
                {[
                  "Requires your real location — never answers without one",
                  "Never invents prices, availability or verification status",
                  "Fallback answers are labelled as such, transparently",
                  "Recommendation + reasoning + transparency, every time",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-success-soft text-success-strong">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-body-sm text-ink-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>

        {/* Data & Trust */}
        <section className="mt-8">
          <Card
            icon={ShieldCheck}
            title="Data & trust"
            subtitle="How a recommendation earns your confidence"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {trustPillars.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-xl border border-hairline bg-ink-50/60 p-4"
                >
                  <h3 className="flex items-center gap-2 text-h3 text-ink-900">
                    <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    {title}
                  </h3>
                  <p className="mt-1.5 text-caption leading-relaxed text-ink-600">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg border border-warning-border bg-warning-soft px-3.5 py-3 text-caption leading-relaxed text-warning-strong">
              Data source and verification status are <strong>never merged</strong>.
              A station imported from a public source and a station verified by
              community reports are labelled distinctly, everywhere in the app.
            </p>
          </Card>
        </section>

        {/* Built for Nigeria */}
        <section className="mt-8 overflow-hidden rounded-2xl border border-brand-200 bg-surface shadow-e1">
          <div className="grid lg:grid-cols-2">
            <div className="p-6 sm:p-8">
              <Badge tone="brand">Built for Nigeria</Badge>
              <h2 className="mt-3 text-h2 text-ink-900">
                Real-world context, not a template
              </h2>
              <p className="mt-3 text-body-sm leading-relaxed text-ink-600">
                This product is designed for how fuel actually works here:
                mobile-first for metered data and small screens, a system font
                stack that renders beautifully on Android and iOS with zero
                network cost, offline caching for when the network drops, and
                pricing in naira (₦).
              </p>
              <p className="mt-3 text-body-sm leading-relaxed text-ink-600">
                Naira sign support, realistic queues, and accuracy that respects
                real GPS conditions — not the assumptions of a western fuel
                market — are first-class concerns, not afterthoughts.
              </p>
            </div>
            <div className="relative hidden min-h-[240px] lg:block">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-brand-sheen"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              <MapPin
                className="absolute bottom-8 right-8 h-24 w-24 text-accent-400"
                aria-hidden="true"
              />
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Tech stack */}
            <Card
              icon={Cpu}
              title="Technology"
              subtitle="How the product is actually built"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {stack.map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-hairline bg-ink-50/60 p-4"
                  >
                    <h3 className="flex items-center gap-2 text-h3 text-ink-900">
                      <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      {title}
                    </h3>
                    <p className="mt-1.5 text-caption leading-relaxed text-ink-600">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Integrity */}
            <Card
              icon={Settings}
              title="Engineering integrity"
              subtitle="What keeps the data honest"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    n: 1,
                    title: "Provenance never merged",
                    desc: "Data source and verification status stay separate fields, everywhere.",
                  },
                  {
                    n: 2,
                    title: "Tested",
                    desc: "Backend pytest suite plus a frontend vitest suite and type-safe builds.",
                  },
                  {
                    n: 3,
                    title: "No invented data",
                    desc: "Prices come only from real reports; locations only from accepted GPS fixes.",
                  },
                ].map((item) => (
                  <div
                    key={item.n}
                    className="rounded-xl border border-hairline bg-ink-50/60 p-4 text-center"
                  >
                    <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-pill bg-brand-100 text-body-sm font-bold text-brand-800">
                      {item.n}
                    </span>
                    <h3 className="text-body-sm font-semibold text-ink-800">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-caption text-ink-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Creator */}
            <Card icon={Settings} title="Creator" subtitle="Who built FuelFinder AI">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-brand-800 text-h3 font-bold text-white">
                  A
                </span>
                <div className="min-w-0">
                  <h3 className="text-h3 text-ink-900">Abdulwahab Abdulyekeen</h3>
                  <p className="text-caption text-ink-500">
                    Full-stack developer · Nigeria
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a
                    href="mailto:bynarytech1@gmail.com"
                    className="flex items-center gap-2.5 text-body-sm text-ink-700 transition-colors hover:text-brand-700"
                  >
                    <Mail className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    bynarytech1@gmail.com
                  </a>
                </li>
                <li>
                  <a
                    href="tel:+2349044115526"
                    className="flex items-center gap-2.5 text-body-sm text-ink-700 transition-colors hover:text-brand-700"
                  >
                    <Phone className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    0904 411 5526
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.linkedin.com/in/abdulwahab-abdulyekeen-8370363a8"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-body-sm text-ink-700 transition-colors hover:text-brand-700"
                  >
                    <Linkedin className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    LinkedIn profile
                  </a>
                </li>
              </ul>
            </Card>

            {/* Portfolio */}
            <Card icon={Layers} title="Portfolio" subtitle="Other work, for reference">
              <ul className="space-y-3">
                <li className="rounded-xl border border-hairline bg-ink-50/60 p-4">
                  <h3 className="text-h3 text-ink-900">JobLiberty</h3>
                  <p className="mt-1 text-caption leading-relaxed text-ink-600">
                    UI/UX reference project — the visual polish and product
                    design system benchmark for this app.
                  </p>
                </li>
                <li className="rounded-xl border border-hairline bg-ink-50/60 p-4">
                  <h3 className="text-h3 text-ink-900">MammoGuard</h3>
                  <p className="mt-1 text-caption leading-relaxed text-ink-600">
                    Breast cancer prediction application — an applied
                    machine-learning product.
                  </p>
                </li>
              </ul>
            </Card>

            {/* Capstone compliance */}
            <Card
              icon={ShieldCheck}
              title="Capstone compliance"
              subtitle="Official 3MTT requirements"
            >
              <ul className="space-y-3">
                {capstoneRequirements.map((req) => (
                  <li key={req.name} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-success-soft text-success-strong">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body-sm font-semibold text-ink-800">
                        {req.name}
                      </span>
                      <span className="mt-0.5 block text-caption text-ink-500">
                        {req.desc}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Roadmap */}
            <Card
              icon={TrendingUp}
              title="Delivery roadmap"
              subtitle="Ten shipped phases"
            >
              <ol className="relative space-y-4 border-l-2 border-hairline pl-5">
                {phases.map((phase) => (
                  <li key={phase.number} className="relative">
                    <span
                      className="absolute -left-[27px] top-1 h-3 w-3 rounded-pill border-2 border-brand-600 bg-brand-600"
                      aria-hidden="true"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-caption font-bold text-brand-700">
                        Phase {phase.number}
                      </span>
                      <Badge tone="success">Shipped</Badge>
                    </div>
                    <h3 className="mt-0.5 text-body-sm font-semibold text-ink-900">
                      {phase.name}
                    </h3>
                    <p className="mt-0.5 text-caption text-ink-500">{phase.desc}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Cpu;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1 sm:p-6">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-h2 text-ink-900">
          <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-caption text-ink-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
