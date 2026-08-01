import Link from "next/link";
import {
  Flame,
  MapPin,
  Layers,
  Settings,
  ShieldCheck,
  Cpu,
  TrendingUp,
  Server,
  Smartphone,
  Check,
  ArrowRight,
} from "lucide-react";

export default function AboutPage() {
  const capstoneRequirements = [
    { name: "Solve the problem: Drivers hunt for fuel", met: true, desc: "Sourcing verified queue and price data to end fuel-hunting." },
    { name: "Interactive Map", met: true, desc: "Live OpenStreetMap + Leaflet map with marker clustering, nearby search & directions." },
    { name: "Fuel Station List", met: true, desc: "Paginated list with filters and distance-based nearby search." },
    { name: "Filters", met: true, desc: "Filter by fuel type, brand, city and station name search." },
    { name: "Fuel Price Reports", met: false, desc: "Unlocks in Phase 6: Crowd-sourced pricing logs." },
    { name: "Reporting System", met: false, desc: "Unlocks in Phase 6: Active submission form for live station updates." },
  ];

  const phases = [
    { number: 1, name: "Project Setup", status: "completed", desc: "Monorepo, Docker, CI/CD Actions, and core dependencies." },
    { number: 2, name: "Database & Models", status: "completed", desc: "PostgreSQL schema, PostGIS, SQLAlchemy models, and Alembic migrations." },
    { number: 3, name: "Authentication", status: "completed", desc: "Supabase Auth, JWT verification, and roles." },
    { number: 4, name: "Fuel Stations API", status: "completed", desc: "CRUD endpoints, nearby spatial search, and filters." },
    { number: 5, name: "Interactive Map UI", status: "completed", desc: "Leaflet, marker clustering, routing, and user geolocation." },
    { number: 6, name: "Fuel Reports Engine", status: "pending", desc: "User reports submission, queue times, and photo uploads." },
    { number: 7, name: "Realtime Updates", status: "pending", desc: "Supabase Realtime syncing for instant dashboard refreshes." },
    { number: 8, name: "AI Queue & Fraud Verification", status: "pending", desc: "Gemini visual queue analyzer and Groq natural search." },
    { number: 9, name: "Admin Dashboard", status: "pending", desc: "User reporting review, spam moderation, and metrics analytics." },
    { number: 10, name: "Production Deployment", status: "pending", desc: "Vercel + Render + Supabase multi-cloud setup." },
  ];

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-emerald-900 text-white shadow-md border-b-4 border-amber-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link href="/" className="flex items-center space-x-3">
            <div className="bg-amber-500 p-2.5 rounded-xl shadow-inner">
              <Flame className="h-7 w-7 text-emerald-950 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Fuel Station Finder AI</h1>
              <p className="text-xs text-emerald-200 font-medium">3MTT Capstone Project • Nigerian Tech Startup Concept</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-2 bg-emerald-950/60 border border-emerald-700/50 px-4 py-1.5 rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-xs font-semibold text-emerald-300">Phase 5: Interactive Map Completed</span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-emerald-950 hover:bg-amber-400"
            >
              Launch map <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 rounded-2xl text-white p-6 sm:p-8 shadow-lg relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-12 translate-x-12">
              <MapPin className="h-80 w-80 text-white" />
            </div>
            <span className="bg-amber-500 text-emerald-950 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
              Phase 5 • Interactive Map
            </span>
            <h2 className="text-3xl font-bold mt-4 leading-tight">
              Combating Fuel Scarcity & Station Hunts Across Nigeria
            </h2>
            <p className="text-emerald-100 text-sm mt-3 max-w-xl leading-relaxed">
              Every day, millions of Nigerian motorists waste hours hunting for fuel. Station Finder AI uses crowd-sourced reporting with Gemini-powered queue and price verification to keep drivers moving.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-emerald-950 hover:bg-amber-400"
            >
              <MapPin className="h-4 w-4" /> Open the Fuel Map
            </Link>

            <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-emerald-700/60">
              <div className="flex items-center text-xs font-medium text-emerald-200">
                <Server className="h-4 w-4 mr-1.5 text-amber-500" /> FastAPI Backend
              </div>
              <div className="flex items-center text-xs font-medium text-emerald-200">
                <Smartphone className="h-4 w-4 mr-1.5 text-amber-500" /> Next.js 15 Frontend
              </div>
              <div className="flex items-center text-xs font-medium text-emerald-200">
                <Layers className="h-4 w-4 mr-1.5 text-amber-500" /> PostGIS Spatial Search
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center mb-5">
              <Cpu className="h-5 w-5 mr-2 text-emerald-700" /> Production Tech Stack
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="border border-gray-100 p-4 rounded-xl">
                <h4 className="font-semibold text-emerald-900 mb-2">Next.js App Router (Frontend)</h4>
                <p className="text-gray-500 text-xs leading-relaxed">
                  React 19 + TypeScript. Leaflet/OpenStreetMap with marker clustering, React Query for remote caching and Zustand for application state.
                </p>
              </div>
              <div className="border border-gray-100 p-4 rounded-xl">
                <h4 className="font-semibold text-emerald-900 mb-2">FastAPI &amp; SQLAlchemy 2 (Backend)</h4>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Async, high-performance API. Pydantic v2 schemas, SQLAlchemy 2.0 ORM with native async, and Alembic migrations.
                </p>
              </div>
              <div className="border border-gray-100 p-4 rounded-xl">
                <h4 className="font-semibold text-emerald-900 mb-2">Supabase Auth &amp; Database</h4>
                <p className="text-gray-500 text-xs leading-relaxed">
                  JWT-verified authentication with application roles (Driver, Station Manager, Admin).
                </p>
              </div>
              <div className="border border-gray-100 p-4 rounded-xl">
                <h4 className="font-semibold text-emerald-900 mb-2">PostgreSQL &amp; PostGIS (Spatial)</h4>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Geography columns + GiST indexes power metre-accurate nearby station search.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
              <Settings className="h-5 w-5 mr-2 text-emerald-700" /> Engineering Integrity
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold mb-2 text-sm mx-auto">1</div>
                <h5 className="font-semibold text-sm text-gray-800">Docker Support</h5>
                <p className="text-xs text-gray-400 mt-1">Multi-stage Dockerfiles and local Postgres/PostGIS DB.</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold mb-2 text-sm mx-auto">2</div>
                <h5 className="font-semibold text-sm text-gray-800">Tested</h5>
                <p className="text-xs text-gray-400 mt-1">Backend pytest suite + frontend type-safe builds.</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold mb-2 text-sm mx-auto">3</div>
                <h5 className="font-semibold text-sm text-gray-800">Clean Architecture</h5>
                <p className="text-xs text-gray-400 mt-1">Separation of concerns across models, services, and routes.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center mb-1">
              <ShieldCheck className="h-5 w-5 mr-2 text-emerald-700" /> Capstone Compliance
            </h3>
            <p className="text-xs text-gray-400 mb-4">Official requirements outlined for 3MTT Capstone</p>
            <div className="space-y-4">
              {capstoneRequirements.map((req, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-xl hover:bg-gray-50">
                  <div className="mt-0.5">
                    {req.met ? (
                      <div className="bg-emerald-100 text-emerald-800 p-0.5 rounded-full">
                        <Check className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className={`text-sm font-semibold ${req.met ? "text-gray-800" : "text-gray-500"}`}>{req.name}</h4>
                    <p className="text-xs text-gray-400 mt-0.5">{req.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center mb-1">
              <TrendingUp className="h-5 w-5 mr-2 text-emerald-700" /> Project Roadmap
            </h3>
            <p className="text-xs text-gray-400 mb-4">Rigorous step-by-step startup construction flow</p>
            <div className="relative border-l-2 border-gray-100 pl-4 space-y-4">
              {phases.map((phase) => (
                <div key={phase.number} className="relative">
                  <div className={`absolute -left-[25px] top-1 h-3 w-3 rounded-full border-2 ${
                    phase.status === "completed" ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300"
                  }`} />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-bold ${phase.status === "completed" ? "text-emerald-700" : "text-gray-400"}`}>
                        Phase {phase.number}
                      </span>
                      {phase.status === "completed" && (
                        <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded">Success</span>
                      )}
                    </div>
                    <h4 className={`text-xs font-bold ${phase.status === "completed" ? "text-gray-900" : "text-gray-500"}`}>{phase.name}</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">{phase.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="bg-gray-100 border-t border-gray-200 py-6 mt-12 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 Fuel Station Finder AI. Created as a 3MTT Software Development Capstone Project.</p>
          <p className="mt-1 text-gray-400">Built with Next.js, FastAPI, Supabase, and PostgreSQL/PostGIS.</p>
        </div>
      </footer>
    </main>
  );
}
