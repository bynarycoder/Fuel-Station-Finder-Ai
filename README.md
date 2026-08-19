# FuelFinder AI

FuelFinder AI is a smart fuel-station discovery platform built for Nigerian
drivers. It combines an interactive map, real-time location, community price
and availability reports, and an AI assistant to help drivers find the right
fuel — Petrol, Diesel, Kerosene, Cooking Gas or autogas (CNG) — quickly and
confidently.

**Live application:** <https://fuel-station-finder-omega.vercel.app>

---

## Overview

Finding fuel in Nigeria can be frustrating. Station information is scattered,
prices change daily, queues and product shortages are common, and there is no
single, trustworthy place to see what is available where. Drivers waste time
and fuel driving from station to station.

FuelFinder AI solves this by bringing together, in one mobile-first
experience:

- an **interactive map** of fuel stations across Nigeria;
- **nearby discovery** using the device's GPS (or a manually chosen location);
- **search and filtering** by name, area, brand, city and fuel type;
- **station details** with prices, distance, reports, contact info and
  directions;
- **community reporting** so drivers can share prices, queue lengths and
  availability, optionally with a photo;
- an **AI assistant ("Fuel Intelligence")** that answers natural-language
  questions and recommends stations from the real catalogue;
- **authentication, accounts and favourites** powered by Supabase.

The result is a living, community-improved map of where fuel actually is.

---

## Features

### Map & discovery
- **Interactive Leaflet map** with custom station markers, marker clustering,
  the user's location, and a "closest station" highlight when nearby.
- **Near me / geolocation** with a single location owner in the app state,
  manual location picking, and clear status/error messaging.
- **One map at every screen size** — the map stays mounted across tab changes
  and window resizes (no duplicate Leaflet instances).
- **Map controls**: zoom in/out, recentre on my location, floating
  Near-me / Browse-all actions.

### Search & filtering
- Free-text **station search** (name, brand, city, area).
- **Fuel-type filter chips**: Petrol (PMS), Diesel (AGO), Kerosene (DPK),
  Cooking Gas (LPG) and Compressed Natural Gas (CNG).
- Brand, city and query filters, plus an adjustable **search radius**.
- **Natural-language search** routed through Fuel Intelligence.
- Recent searches with quick-apply chips.

### Stations & details
- Station cards with brand, name, area, distance, price summary, availability
  and data-provenance information.
- **Station detail** view: identity, summary, **Get Directions** (opens the
  device maps app), Report price, contact details, coordinates, status, and
  recent community reports.
- A dedicated **Stations** screen for focused browsing (map stays mounted).

### Accounts, favourites & community
- **Supabase Authentication** — email/password sign-in and sign-up, session
  restoration, cross-tab auth state.
- **Account panel** with profile, theme control, saved stations and "my
  reports".
- **Favourite stations** (saved per user).
- **Community price/availability reports**, including price per litre, queue
  length, notes and **photo uploads**.
- **Photo uploads are stored in Supabase Storage** (the `report-photos`
  bucket), so images persist across backend restarts and redeploys.
- A public **community reports feed** and a station-level report history.
- **AI confidence / verification** signals on reports and an admin review
  workflow (pending / under review / verified / rejected).

### AI Assistant — Fuel Intelligence
- Conversational assistant for general questions about the app.
- Natural-language **station recommendations**: intent extraction runs against
  the real database (the database, not the model, ranks stations).
- Answers are labelled by source (`groq` vs deterministic `fallback`) so
  AI-generated text is never presented as fact when the model is unavailable.
- Multimodal **Gemini**-powered report-photo verification for admins.
- All AI API keys are kept **server-side**; the browser only sends the query
  and the user's coordinates.

### Interface, accessibility & offline
- **Responsive, mobile-first** design with a bottom navigation on phones and a
  split results-rail + map layout on laptops/desktops.
- Five always-available destinations with **refresh-safe, shareable URLs**:
  `/map`, `/stations`, `/ai`, `/report` and `/account`.
- **Light/dark theme** with no-flash first paint and a manual toggle.
- **Multilingual** interface: English, Hausa, Yoruba and Igbo (powered by
  i18next).
- Accessible dialogs (focus trap, Escape, scrim close, labelled titles),
  keyboard-operable bottom sheet, zoom allowed (WCAG 1.4.4), and skip links.
- **PWA**: installable, with a network-first service worker that keeps the
  public station catalogue browsable offline and clearly labels stale data.

### Administration
- An `/admin` dashboard (gated by Supabase auth + an `admin` role) with
  analytics, report moderation/verification and user management.

---

## Screenshots

_Screenshots can be added here. Drop image files into `docs/screenshots/` and
reference them below, for example:_

```md
![Map view on mobile](docs/screenshots/map-mobile.png)
![Station detail](docs/screenshots/station-detail.png)
![Fuel Intelligence](docs/screenshots/fuel-intelligence.png)
```

No screenshot URLs are hard-coded in this README.

---

## Technology Stack

### Frontend
- **[Next.js 15](https://nextjs.org/)** (App Router) with **React 19**
- **TypeScript** end-to-end
- **Tailwind CSS** with a custom design-token theme (the UI is hand-built with
  Tailwind and Radix-style primitives — it does **not** depend on shadcn/ui)
- **Leaflet** + **react-leaflet** + **react-leaflet-cluster** for mapping
- **Zustand** for client/map state
- **TanStack Query** for server state
- **i18next / react-i18next** for internationalisation (en, ha, yo, ig)
- **Supabase JS** for Auth and Storage
- **Vitest** + **Testing Library** for unit/component tests

### Backend
- **Python 3** + **FastAPI**
- **SQLAlchemy 2** (async) with **Alembic** migrations
- **PostgreSQL** with the **PostGIS** extension for geospatial queries
- **GeoAlchemy2** / **asyncpg** / **psycopg2**
- **PyJWT** for asymmetric (ES256/JWKS) Supabase token verification
- **httpx** for outbound calls (AI, geocoding, object storage)
- **pytest** for the backend test suite

### External services
- **Supabase** — PostgreSQL database, Authentication, and Storage
- **GroqCloud** hosting the **`openai/gpt-oss-20b`** model for Fuel
  Intelligence (conversation, intent extraction, recommendations)
- **Google Gemini** — **`gemini-3.5-flash-lite`** — for multimodal
  report-photo verification
- **OpenStreetMap Nominatim** — proxied server-side for location
  search/geocoding (no API key in the browser)
- **Vercel** — frontend hosting
- **Render** — backend hosting (Docker, auto-deploy, migrations on boot)
- **Docker** / **docker-compose** for containerised local development

---

## System Architecture

```
┌──────────────────────────────┐
│   Browser / PWA (Next.js)    │
│  Map · Search · AI · Report  │
│  Zustand · React Query       │
└───────────────┬──────────────┘
                │ HTTPS / JSON (NEXT_PUBLIC_API_URL)
                ▼
┌──────────────────────────────┐
│   FastAPI backend (Render)   │
│  /api/v1 stations · reports  │
│  · auth · favorites · ai     │
│  · admin · geocode           │
└───────┬───────────┬──────────┘
        │           │
        ▼           ▼
┌──────────────┐ ┌──────────────────────┐
│  PostgreSQL  │ │  Supabase Auth +     │
│  + PostGIS   │◄┤  Storage (photos)    │
│ (Supabase DB)│ └──────────────────────┘
└──────────────┘
        │
        ├──► GroqCloud (openai/gpt-oss-20b)  — Fuel Intelligence
        ├──► Google Gemini (gemini-3.5-flash-lite) — photo verification
        └──► OpenStreetMap Nominatim — location search/geocoding
```

The frontend is a single Next.js application. The five in-app destinations
(Map, Stations, AI, Report, Account) are tabs of one stateful shell and have
refresh-safe URLs (`/map`, `/stations`, …) served via Next.js rewrites, so the
map is never remounted when switching tabs.

The backend is a versioned REST API under `/api/v1`. It owns all database
access, verifies Supabase JWTs (ES256 via JWKS), holds all AI/Storage
secrets, and returns JSON to the client.

---

## Supabase

Supabase provides three core services:

- **PostgreSQL database** — the station, report, user and favourites data,
  with PostGIS enabling location-based ("near me") queries.
- **Authentication** — email/password auth and session management. The backend
  verifies Supabase's asymmetric **ES256** access tokens against the project's
  public JWKS endpoint; protected routes require a valid user (and an `admin`
  role for `/admin`).
- **Storage** — user-uploaded **report photos** are stored in a public
  `report-photos` bucket. The backend uploads using the **server-only service
  role key**; images are served by public URL and survive Render restarts.

Supabase Row-Level-Security policies for favourites live in
[`backend/supabase/`](backend/supabase).

> **Never** commit the `SUPABASE_SERVICE_ROLE_KEY` or any `service_role`
> credential. It bypasses RLS and must stay server-side. Only the
> `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` belong in the
> frontend.

---

## Project Structure

```
Fuel-Station-Finder-Ai/
├── frontend/                  # Next.js 15 + React 19 application
│   ├── src/
│   │   ├── app/               # App Router: /, /about, /admin, /offline
│   │   ├── components/        # UI: map, stations, reports, ai, account, shell
│   │   ├── hooks/             # useAuth, useStations, useFavorites, useGeolocation…
│   │   ├── lib/               # API client, geo, auth, format, upload, utils
│   │   ├── services/          # Backend API wrappers
│   │   ├── store/             # Zustand map/location/filter store
│   │   ├── i18n/              # en / ha / yo / ig translations
│   │   ├── types/             # Shared TypeScript domain types
│   │   └── test/              # Test helpers (viewport, geo mock)
│   ├── public/                # Icons, PWA manifest, service worker
│   ├── next.config.mjs        # Rewrites for /map, /stations, /ai, /report, /account
│   └── package.json
├── backend/                   # FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── api/v1/            # Routers: stations, reports, auth, ai, admin…
│   │   ├── core/              # Config, database, security (JWT/JWKS)
│   │   ├── models/            # SQLAlchemy ORM models
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic incl. services/ai/* and storage
│   │   └── scripts/           # Station import / seeding
│   ├── alembic/versions/      # Database migrations (run automatically on boot)
│   ├── supabase/              # RLS policies
│   ├── tests/                 # Pytest suite
│   ├── Dockerfile
│   └── requirements.txt
├── docs/                      # Design, data, multilingual and QA documentation
├── scripts/                   # Repo-level helper scripts
├── docker-compose.yml         # Local PostGIS + backend + frontend
├── render.yaml                # Render blueprint for the backend
└── README.md
```

---

## Environment Variables

Only variable **names** are documented here. Use the provided `.env.example`
files and supply real values in untracked `.env` files or your host's secret
management. **Never commit secrets.**

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the FastAPI backend, e.g. `https://fuel-station-finder-ai.onrender.com/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anonymous key |

See [`frontend/.env.example`](frontend/.env.example).

### Backend (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `PROJECT_NAME`, `ENVIRONMENT`, `PORT` | App identity/runtime |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |
| `DATABASE_URL` | Sync PostgreSQL/PostGIS connection (migrations) |
| `ASYNC_DATABASE_URL` | Async connection (runtime, asyncpg) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase project coordinates |
| `SUPABASE_JWT_ALGORITHM`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`, `SUPABASE_JWKS_CACHE_TTL_SECONDS` | Asymmetric JWT verification |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket for report photos (default `report-photos`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** key for Storage uploads (bypasses RLS) |
| `SUPABASE_STORAGE_TIMEOUT_SECONDS` | Storage request timeout |
| `GROQ_API_KEY`, `GROQ_MODEL` | Fuel Intelligence LLM (model `openai/gpt-oss-20b`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Photo-verification model (e.g. `gemini-3.5-flash-lite`) |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_RETRIES`, `AI_RECOMMEND_CACHE_TTL_SECONDS` | AI resilience/caching |
| `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT`, `NOMINATIM_REFERER`, `NOMINATIM_TIMEOUT_SECONDS`, `NOMINATIM_SEARCH_LIMIT` | Server-side geocoding |
| `MEDIA_DIR`, `MEDIA_URL`, `MAX_UPLOAD_BYTES` | Local-media fallback (5 MiB default) |

See [`backend/.env.example`](backend/.env.example).

---

## Installation

### Prerequisites
- Node.js 20+ and npm
- Python 3.11+
- Docker & Docker Compose (recommended for the database)
- A Supabase project (PostgreSQL + PostGIS, Auth enabled)

### 1. Clone the repository

```bash
git clone https://github.com/bynarycoder/Fuel-Station-Finder-Ai.git
cd Fuel-Station-Finder-Ai
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in NEXT_PUBLIC_* values
```

### 3. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # then fill in the values
```

### 4. Database

The easiest path is Docker Compose, which starts PostGIS for you:

```bash
docker compose up -d db
```

Then run migrations (they also run automatically in the container entrypoint):

```bash
cd backend
alembic upgrade head
```

Point `DATABASE_URL` / `ASYNC_DATABASE_URL` at your Supabase (or local)
PostgreSQL+PostGIS database.

### 5. Optional: import/seed stations

The backend includes OSM import and seed scripts under
[`backend/app/scripts/`](backend/app/scripts) — see their module docstrings.

---

## Development

Run the frontend and backend separately (hot reload):

```bash
# Backend (http://localhost:8000 — API docs at /docs)
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload

# Frontend (http://localhost:3000)
cd frontend
npm run dev
```

Or bring up the full stack with Docker:

```bash
docker compose up --build
```

### Tests

```bash
# Frontend
cd frontend && npm test

# Backend
cd backend && pytest
```

### Type checking / linting

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

---

## Deployment

Production architecture:

- **Frontend → Vercel** (`next build` / `next start`). Set the
  `NEXT_PUBLIC_*` variables in the Vercel project.
- **Backend → Render** via the [`render.yaml`](render.yaml) blueprint (Docker,
  free plan, auto-deploy, health check at `/health`). The container runs
  `alembic upgrade head` before starting uvicorn.
- **Database / Auth / Storage → Supabase** (PostgreSQL + PostGIS, Auth, and
  the `report-photos` Storage bucket).

**Live URL:** <https://fuel-station-finder-omega.vercel.app>

The five app destinations are refresh-safe in production thanks to Next.js
rewrites in [`frontend/next.config.mjs`](frontend/next.config.mjs), so a hard
refresh on `/map`, `/stations`, `/ai`, `/report` or `/account` stays on that
destination.

---

## API

The backend is versioned under `/api/v1` (interactive docs at `/docs`). Major
areas:

| Area | Endpoints (examples) |
| --- | --- |
| Stations | `GET /stations` (list/filter), `GET /stations/{id}`, `GET /stations/nearby`, `GET /stations/search`, station import admin routes |
| Reports | `POST /reports` (authenticated, multipart photo), `GET /reports` (public feed), `GET /reports/{id}`, station reports, photo verification |
| Auth | `GET /auth/me` (current Supabase user) |
| Favorites | `GET/PUT/DELETE /favorites` (authenticated) |
| AI | `POST /ai/chat`, `POST /ai/recommend` |
| Geocoding | `GET /geocode/search`, `GET /geocode/reverse` (Nominatim proxy) |
| Admin | `GET /admin/...` analytics, reports, users; report verification & status updates (admin role) |

General: `GET /` (service info) and `GET /health` (Render health check).

---

## AI Assistant

Fuel Intelligence helps drivers in two ways:

1. **Conversation & questions** (`POST /api/v1/ai/chat`) — answers general
   questions about the app using the **`openai/gpt-oss-20b`** model served by
   GroqCloud.
2. **Station recommendations** (`POST /api/v1/ai/recommend`) — extracts intent
   from a natural-language request and asks the database for matching nearby
   stations. The model writes explanations; **the database performs the
   ranking**, so prices and availability stay factual.

In addition, **Google Gemini (`gemini-3.5-flash-lite`)** performs multimodal
verification of uploaded report photos for admins.

When an AI provider is unavailable, the backend degrades gracefully to a
deterministic intent parser/template answer and labels the response
`answer_source: "fallback"` — it never fails the user's request or invents
station data.

**Credentials stay server-side.** The browser never holds `GROQ_API_KEY` or
`GEMINI_API_KEY`; it sends only the message/query and the user's coordinates.

---

## Security

- **Secrets in environment variables.** No API keys, JWT secrets, database
  passwords or service-role keys are committed.
- **Server-side API keys** for Groq, Gemini, Supabase Storage and geocoding.
- **Supabase Auth** with asymmetric **ES256** JWT verification against the
  project's JWKS endpoint; protected routes require a valid token, and admin
  routes require the `admin` role.
- **Supabase Storage** uploads use the server-only service-role key; the
  public bucket serves images by URL.
- **Upload validation** — accepted image types and a 5 MiB size limit
  (`MAX_UPLOAD_BYTES`); the backend surfaces actionable validation errors.
- **CORS** is restricted to configured origins (`CORS_ORIGINS`).
- **Location isolation** — placeholder data from a previous location is never
  presented as current or used to crown a "closest" station.
- The service worker never caches location-specific `/nearby` or `/search`
  responses or authenticated requests.

---

## Nigerian Context / Impact

Fuel availability, pricing and queue times change frequently across Nigeria,
and reliable, up-to-date information is hard to come by. FuelFinder AI is
built specifically for this reality:

- Covers the products drivers actually buy — **Petrol (PMS), Diesel (AGO),
  Kerosene (DPK), Cooking Gas (LPG) and CNG**.
- Works on low-end Android phones over metered mobile data (system fonts,
  lightweight bundles, offline catalogue caching, installable PWA).
- Speaks to drivers in **English, Hausa, Yoruba and Igbo**.
- Turns every driver's report into shared, community-verified intelligence —
  fewer wasted trips, less fuel burnt searching for fuel, and clearer signals
  about where product is actually available.

---

## Future Improvements

The following are **planned/future ideas**, not current features:

- Larger, continuously refreshed station dataset with broader geographic
  coverage beyond the seed catalogue.
- Stricter real-time fuel-availability signals and push/expiry for stale
  reports.
- Push notifications for saved stations or favourite fuel types.
- Stronger community verification, reputation and anti-abuse tooling.
- Advanced analytics on price trends and availability over time.
- A native mobile application.

---

## Project Status

**Status: Completed / Production**

FuelFinder AI is deployed and functional at
<https://fuel-station-finder-omega.vercel.app>, with the backend running on
Render and data/auth/storage on Supabase.

---

## Author

**Abdulwahab Abdulyekeen**
**3MTT NextGen Fellow**
**FuelFinder AI**

---

## License

No license file is currently included in this repository. All rights are
retained by the author unless a license is added explicitly.
