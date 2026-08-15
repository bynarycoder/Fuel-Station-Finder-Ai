import Link from "next/link";
import {
  ArrowRight,
  Check,
  Cpu,
  Database,
  Layers,
  MapPin,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  TrendingUp,
} from "lucide-react";

import { BrandMark } from "@/components/shell/AppHeader";
import { Badge } from "@/components/ui/Badge";

/**
 * About — the project story, capstone compliance and delivery roadmap.
 *
 * Rebuilt on the design system so it reads as part of the same product as the
 * finder (same header, same type scale, same card language) instead of a
 * separate marketing page.
 */
export default function AboutPage() {
  const capstoneRequirements = [
    {
      name: "Solve the problem: drivers hunt for fuel",
      met: true,
      desc: "Sourcing verified queue and price data to end fuel-hunting.",
    },
    {
      name: "Interactive map",
      met: true,
      desc: "Live OpenStreetMap + Leaflet map with marker clustering, nearby search and directions.",
    },
    {
      name: "Fuel station list",
      met: true,
      desc: "Paginated list with filters and distance-based nearby search.",
    },
    {
      name: "Filters",
      met: true,
      desc: "Filter by fuel type, brand, city and station name search.",
    },
    {
      name: "Fuel price reports",
      met: true,
      desc: "Crowd-sourced pricing logs and price history by fuel product.",
    },
    {
      name: "Reporting system",
      met: true,
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
    { number: 8, name: "AI queue & fraud verification", desc: "Gemini visual queue analyzer and Groq natural search." },
    { number: 9, name: "Admin dashboard", desc: "Report review, spam moderation, and metrics analytics." },
    { number: 10, name: "Production deployment", desc: "Vercel + Render + Supabase multi-cloud setup." },
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

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="sticky top-0 z-header flex h-16 items-center justify-between gap-3 border-b border-brand-800/40 bg-brand-900 px-4 text-white sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate text-h3 text-white">
              FuelFinder
              <span className="ml-1 text-caption font-semibold text-accent-300">AI</span>
            </span>
            <span className="hidden truncate text-caption text-brand-200 sm:block">
              3MTT capstone · Nigerian mobility product
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
              Capstone ready
            </Badge>
            <h1 className="mt-4 text-display text-white sm:text-[2.25rem] sm:leading-[2.65rem]">
              Ending the fuel hunt across Nigeria
            </h1>
            <p className="mt-3 text-body leading-relaxed text-brand-100">
              Every day, millions of Nigerian motorists waste hours hunting for
              fuel. FuelFinder AI combines a real station catalogue, crowd-sourced
              price reports and AI-assisted verification so drivers know where to
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

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Tech stack */}
            <Card
              icon={Cpu}
              title="Production tech stack"
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

      <footer className="mt-8 border-t border-hairline bg-surface py-8 text-center">
        <p className="text-caption text-ink-500">
          © 2026 FuelFinder AI. Created as a 3MTT Software Development capstone
          project.
        </p>
        <p className="mt-1 text-caption text-ink-500">
          Built with Next.js, FastAPI, Supabase and PostgreSQL/PostGIS.
        </p>
      </footer>
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
