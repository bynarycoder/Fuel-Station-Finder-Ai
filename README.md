# Fuel Station Finder AI 🇳🇬⛽

**A Production-Ready, AI-Powered Fuel Station Tracking Startup & 3MTT Capstone Project**

---

## 🚦 3MTT COMPLIANCE RULES
Whenever making technical decisions:
1. **Ensure the implementation satisfies the official 3MTT capstone requirements.**
2. **TypeScript is allowed** because it compiles to JavaScript and belongs to the JavaScript ecosystem.
3. If a technology choice conflicts with the capstone requirements, **choose the option that best satisfies the official requirements.**
4. If there are multiple valid approaches, **explain the trade-offs and recommend the most maintainable solution.**
*Never sacrifice simplicity or successful submission for unnecessary complexity.*

---

## 🏆 CAPSTONE SUCCESS RULE
Before implementing any new feature, we classify it as:
* **REQUIRED** (mandatory for the official 3MTT capstone)
* **HIGH VALUE** (significantly improves judging score)
* **OPTIONAL** (future startup feature)

*We must always complete every **REQUIRED** feature before implementing **HIGH VALUE** features, and complete **HIGH VALUE** features before **OPTIONAL** ones. If an **OPTIONAL** feature could delay submission or reduce project stability, we will postpone it.*

---

## 🛠 Tech Stack

Our stack combines performance, modern developer tooling, and robust curriculum alignment:

### Frontend
- **Framework:** Next.js 15 (Stable)
- **Library:** React 19 (Stable)
- **Language:** TypeScript (Preferred over JavaScript for type-safety, maintainability, and clean API models while remaining fully compatible with the JS ecosystem)
- **Styling:** Tailwind CSS & shadcn/ui
- **Interactive Maps:** Leaflet & OpenStreetMap (`react-leaflet`)
- **Remote State Cache:** React Query (`@tanstack/react-query`)
- **Global State Store:** Zustand
- **Icons:** Lucide React

### Backend
- **Language:** Python 3.12+
- **Framework:** FastAPI
- **ORM:** SQLAlchemy 2.0 (Modern declarative styles)
- **Migration Tool:** Alembic
- **Validation Engine:** Pydantic v2
- **Testing:** Pytest & HTTPX client

### Database & Security
- **Database:** PostgreSQL (via Supabase Managed Cloud)
- **Spatial Queries Extension:** PostGIS (for fast, accurate nearby geodesic distance calculations)
- **User Authentication:** Supabase Auth
- **Realtime Channel:** Supabase Realtime (live price/queue reports streaming)

### Artificial Intelligence (AI)
- **Verification Engine:** Google Gemini (visual analysis of fuel queue images and automated report verification)
- **Natural Language Parsing:** Groq (for semantic, free-form queries, e.g., *"Which station has short queues near Ikeja?"*)

### Deployment & CI/CD
- **Dev Containerization:** Docker & Docker Compose
- **Pipeline:** GitHub Actions CI workflow (linting, tests, static typing checks)
- **Hosting:** Vercel (Frontend), Render (Backend), Supabase (Database/Auth)

---

## 🏗 Directory Structure (Monorepo)

The repository uses a clean monorepo architecture, splitting concerns into fully isolated `frontend` and `backend` layers:

```
Fuel-Station-Finder-Ai/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI automation pipeline
├── backend/
│   ├── alembic/               # Alembic DB migration scripts
│   │   ├── versions/          # Versioned migration files
│   │   └── env.py             # Migration runtime configuration
│   ├── alembic.ini            # Alembic configuration
│   ├── app/
│   │   ├── api/               # API route definitions
│   │   │   ├── deps.py        # Authentication & authorization dependencies
│   │   │   └── v1/            # v1 route handlers (auth, ...)
│   │   ├── core/              # Configs, DB sessions, security/JWT verification
│   │   ├── models/            # SQLAlchemy 2.0 ORM models (PostGIS spatial)
│   │   ├── schemas/           # Pydantic validation & response schemas
│   │   ├── services/          # Business logic & data access (stations, ...)
│   │   ├── scripts/           # CLI data tooling (e.g. database seeding)
│   │   └── main.py            # FastAPI main entrypoint
│   ├── tests/                 # Complete backend testing suites
│   ├── .env.example           # Backend config template
│   ├── Dockerfile             # Multi-stage Python 3.12 production Docker build
│   └── requirements.txt       # Python dependencies declaration
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js App Router (pages & layout)
│   │   ├── components/        # Shared and ui components
│   │   ├── hooks/             # Reusable custom React hooks
│   │   ├── lib/               # Utility functions (shadcn, etc.)
│   │   ├── store/             # Zustand state management
│   │   ├── types/             # Frontend typescript interfaces
│   │   └── services/          # Client-side API request clients
│   ├── .env.example           # Frontend config template
│   ├── Dockerfile             # Next.js 15 production runner Docker build
│   └── package.json           # Node.js dependencies configuration
├── docker-compose.yml         # Local Postgres + PostGIS dev environment
└── README.md                  # This documentation
```

---

## 🚦 Roadmap & Core Requirements Checklist (By Priority)

We construct our project incrementally, strictly executing REQUIRED features first.

### 📋 Phase-by-Phase Roadmap & Classifications

| Phase | Module | Classification | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | **Project Setup** | **REQUIRED** | ✔ **Completed** | Monorepo configuration, Next.js 15 & React 19 upgrade, Python 3.12 Docker environments, and GitHub Actions CI. |
| **Phase 2** | **Database Schema** | **REQUIRED** | ✔ **Completed** | PostgreSQL schema, PostGIS spatial mapping, SQLAlchemy 2.0 models, Alembic migrations, and seed data for Nigerian stations (Mobil, NNPC, Conoil, etc.). |
| **Phase 3** | **Authentication** | **REQUIRED** | ✔ **Completed** | Supabase Auth, HS256 JWT verification, just-in-time user provisioning, and User roles (Driver, Station Manager, Admin) with role-based access control. |
| **Phase 4** | **Fuel Stations API** | **REQUIRED** | ✔ **Completed** | CRUD, PostGIS spatial nearby station search (distance-based, nearest-first), and catalog filters. |
| **Phase 5** | **Interactive Map UI** | **REQUIRED** | ✔ **Completed** | Leaflet + OpenStreetMap, marker clustering, nearby search & directions, and user geolocation. |
| **Phase 6** | **Fuel Reports Engine** | **REQUIRED** | ✔ **Completed** | Crowd-sourced report submissions: pricing, fuel type, queue length, photo uploads, and verification status. |
| **Phase 7** | **Realtime Updates** | **HIGH VALUE** | ✔ **Completed** | Supabase Realtime (`postgres_changes`) feeds instant crowd-sourced report updates to the UI, with a polling fallback. |
| **Phase 8** | **AI Features** | **HIGH VALUE** | ⏳ *Next Step* | Gemini queue image analysis & validation score; Groq natural language search. |
| **Phase 9** | **Admin Dashboard** | **HIGH VALUE** | ⏳ *Pending* | Verification manager, moderation panel, user flags, and analytics. |
| **Phase 10**| **Cloud Deployment** | **REQUIRED** | ⏳ *Pending* | Deploy frontend (Vercel), backend (Render), database (Supabase), and prepare README + Demo Video. |

---

## 🗄 Phase 2 — Database Schema Overview

The spatial data layer is built on **PostgreSQL + PostGIS**, modelled with **SQLAlchemy 2.0** (typed `Mapped` columns) and migrated with **Alembic**.

### Core Entities

| Table | Purpose |
| :--- | :--- |
| `fuel_types` | Reference catalogue of Nigerian petroleum products: **PMS** (Petrol), **AGO** (Diesel), **DPK** (Kerosene), **LPG** (Cooking Gas). Natural primary key = product code, guarded by a `CHECK` constraint. |
| `fuel_stations` | The spatial core. Each station's location is a PostGIS **`geography(POINT, 4326)`** column backed by a **GiST** index for fast "stations near me" queries (metre-accurate on the sphere). De-duplicated by a `UNIQUE(name, city)` business key. |
| `fuel_station_fuel_types` | Many-to-many catalogue of which products each station offers (composite PK, cascading foreign keys). |

### Design Notes
- **PostGIS `geography` over `geometry`**: distance / `ST_DWithin` math is performed on the sphere in metres — exactly what proximity search needs, with no manual projection.
- **Phase discipline**: time-series metrics (live price, queue length, availability) belong to the Fuel Reports engine (Phase 6) and are intentionally not modelled here yet, keeping the schema lean.
- Every table carries auditable `created_at` / `updated_at` timestamps via a shared `TimestampMixin`.

### Seed Data
`backend/app/scripts/seed.py` loads **4 fuel types** and **18 representative stations** across **Lagos** and the **FCT (Abuja)** from real brands — Mobil, NNPC, Conoil, TotalEnergies, Oando, MRS, NIPCO, Forte Oil, Bovas and AA Rano — with neighbourhood-level coordinates. The script is idempotent (re-runnable) and can be reset with `--reset`.

---

## 🔐 Phase 3 — Authentication Overview

Authentication is **delegated to Supabase Auth** — it owns signup, login, password hashing and session issuance, so the backend never stores or handles credentials. The backend's job is to **verify Supabase-issued JWTs** and attach the caller's identity and application role to each request.

### How a protected request flows
1. The frontend signs in with Supabase and receives an access token (HS256-signed with the project's JWT secret).
2. It sends that token as `Authorization: Bearer <token>` to the backend.
3. `app/core/security.py` verifies signature, expiry, and (optionally) audience via `python-jose`.
4. `app/api/deps.py::get_current_user` decodes the token and **just-in-time provisions** a local `User` row (creating it on first sighting, refreshing email/name thereafter) — so the `users` table always mirrors Supabase identities without a separate sync job.
5. Endpoints declare their access needs with `require_roles(UserRole.ADMIN, ...)` for **role-based access control**.

### Application roles
| Role | Value | Capabilities |
| :--- | :--- | :--- |
| Driver | `driver` | Default. Search stations, view prices/queues, submit reports. |
| Station Manager | `station_manager` | Manage assigned stations; official pricing/availability; moderate their reports. |
| Admin | `admin` | Full access: verify/moderate reports, manage users & roles, curate stations. |

> Supabase's own JWT `role` claim (`anon`/`authenticated`/`service_role`, used for Row Level Security) is **distinct** from these application roles, which live in the local `users.role` column.

### API surface (v1)
| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/auth/me` | ✔ user | Returns the caller's profile; JIT-provisions the local user. |
| `GET` | `/api/v1/auth/roles` | public | Lists application roles for the frontend sign-up flow. |

### Configuration
Set `SUPABASE_JWT_SECRET` (required) and optionally `SUPABASE_JWT_ALGORITHM` (`HS256` default) and `SUPABASE_JWT_AUDIENCE` (set to `authenticated` to additionally require genuine user-session tokens). See `backend/.env.example`.

---

## ⛽ Phase 4 — Fuel Stations API Overview

A REST API over the Phase 2 schema: catalogue browsing with filters, a PostGIS **nearby search** (distance-based, nearest-first), and staff-only CRUD. Logic lives in a dedicated service layer (`app/services/stations.py`) whose spatial query *builders* are pure functions returning SQLAlchemy `Select` objects.

### Endpoints (v1)
| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/stations` | public | Paginated catalogue with filters: `q` (name), `brand`, `city`, `state`, `fuel_type`, `is_active`. |
| `GET` | `/api/v1/stations/nearby` | public | **Spatial search**: `latitude`/`longitude`/`radius_meters` (+ optional `fuel_type`/`limit`). Returns stations within the radius, nearest first, each with `distance_meters`. |
| `GET` | `/api/v1/stations/{id}` | public | Single station with its fuel types. |
| `POST` | `/api/v1/stations` | Admin / Station Manager | Create a station (+ optional `fuel_type_codes`). |
| `PATCH` | `/api/v1/stations/{id}` | Admin / Station Manager | Partial update (including partial lat/lon and fuel-type reassignment). |
| `DELETE` | `/api/v1/stations/{id}` | Admin / Station Manager | Delete (cascades fuel-type links). |

### Spatial design
The nearby search uses `ST_DWithin(location, <point>::geography, radius_meters)` — which leverages the GiST index on the `geography` column for an efficient radius filter — and `ST_Distance(...)` to compute and order results in metres. Coordinates are exchanged as plain `latitude`/`longitude` floats and converted to/from `geography` in the service layer.

> Fine-grained, per-station scoping for Station Managers (so a manager only edits their own stations) arrives with the admin/assignment work in a later phase.

---

## 🗺️ Phase 5 — Interactive Map UI Overview

A full map experience (Next.js App Router, React 19, TypeScript) at the app root `/`, backed by the Phase 4 API. The Phase 1 landing page moved to `/about`.

### Capabilities
- **Leaflet + OpenStreetMap** base map with **marker clustering** (`react-leaflet-cluster`), themed emerald `divIcon` pins (no broken default marker images).
- **Near-me search** — a *Near me* button uses the browser Geolocation API, switches to the PostGIS `/stations/nearby` endpoint, recentres the map and lists stations nearest-first with distances.
- **Location routing** — every station (in its popup and list row) offers *Get directions*, a turn-by-turn Google Maps deep link using the user's location as the origin.
- **Filters** — name search, brand, city and fuel-type chips; *Browse all* vs *Near me* modes with an adjustable radius.
- List/map are kept in sync: selecting a station flies the map to it; clicking a marker selects it in the list.

### Architecture
- **React Query** for remote state (catalogue + nearby queries, with `placeholderData`), **Zustand** for UI state (mode, filters, user location, selected station) — matching the documented stack.
- The map is **SSR-safe**: Leaflet needs `window`, so `MapView` is lazy-imported via `next/dynamic` with `ssr: false` from a Client-Component wrapper.
- Dependencies upgraded to the **React 19**-compatible line: `react-leaflet@5`, `@react-leaflet/core@3`, `react-leaflet-cluster@4` (Phase 1 had pinned `react-leaflet@4`, which requires React 18 and is incompatible with this project's React 19).

### Validation
`npm run build` (type-checks + static generation) and `npm run lint` both pass. The map loads live data when the backend is running (`NEXT_PUBLIC_API_URL`).

---

## 🧾 Phase 6 — Fuel Reports Engine Overview

Crowd-sourced station reports — the data that makes the finder useful. Any authenticated user submits pricing, queue length, fuel type and an optional photo; reports start `pending` and are verified/rejected in later phases.

### Endpoints (v1)
| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/reports` | any user | Submit a report (multipart: form fields + optional `photo`). |
| `GET` | `/api/v1/reports` | any user | Paginated list with filters (`station_id`, `fuel_type`, `status`); rejected reports hidden from non-admins. |
| `GET` | `/api/v1/reports/{id}` | any user | Single report (rejected hidden from non-admins). |

### Submission model
A `FuelReport` records `fuel_type_code`, optional `price_per_litre` (₦/L), optional `queue_length` (`none`/`short`/`medium`/`long`), optional `notes`, and an optional `photo_url`. The API requires at least a price, a queue reading, or a photo.

### Photo uploads
`POST /reports` accepts an optional `photo` (JPEG/PNG/WebP, size-capped) via a swappable `ImageStorage` service that validates type/size and writes to local disk; files are served via a static mount (`/media`). A failed report creation cleans up the orphan upload. The storage layer is isolated so it can be swapped for Supabase Storage / object storage without touching the reports API.

### Verification lifecycle
`status` (`pending`/`verified`/`rejected`) is captured from day one; status transitions and AI/admin verification arrive in Phases 8 & 9.

---

## ⚡ Phase 7 — Realtime Updates Overview

Crowd-sourced reports now reach the UI instantly via **Supabase Realtime**, with graceful degradation when Supabase isn't configured.

### How it works
- **Backend** (`alembic/versions/0004_enable_realtime.py`): an idempotent, Supabase-aware migration that opts `fuel_reports` (and `fuel_stations`) into the `supabase_realtime` publication — the mechanism Supabase uses for `postgres_changes`. On vanilla Postgres (the local docker DB) it's a safe no-op.
- **Frontend**:
  - `lib/supabase.ts` — a lazy, config-guarded Supabase client (returns `null` when `NEXT_PUBLIC_SUPABASE_*` env vars are absent).
  - `hooks/useReportRealtime.ts` — subscribes to `postgres_changes` on `fuel_reports` and **invalidates the React Query cache** on any insert/update, so the feed refreshes the moment a report lands.
  - `components/reports/ReportsFeed.tsx` — a live "Community reports" panel (opened from the header) showing the public feed, with a Live/Connecting/Polling badge.
  - **Fallback**: when Supabase isn't configured (local dev), the hook is a no-op and `useReports` polls every 30s, so the UI stays fresh without realtime infrastructure.

### Note
Report *reads* are now **public** (community feed) and always exclude rejected reports; submission still requires authentication. This lets the live feed work without a login.

---

## 🚀 Local Setup & Getting Started

### Prerequisites
- [Docker & Docker Compose](https://www.docker.com/)
- [Node.js v22+](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/)

---

### Step 1: Start the Local PostgreSQL + PostGIS Database
To boot up the spatial database container:
```bash
docker-compose up -d db
```
This boots up Postgres on port `5432` with PostGIS extensions ready.

---

### Step 2: Configure Environment Variables

1. **Backend:**
   Copy the backend template and adjust values:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. **Frontend:**
   Copy the frontend template:
   ```bash
   cp frontend/.env.example frontend/.env
   ```

---

### Step 3: Apply Database Migrations & Seed Data

With the database running (Step 1) and environment configured (Step 2), create the schema and load the starter Nigerian station catalogue.

From the `backend/` directory, inside your virtual environment:

```bash
cd backend

# 1. Apply all migrations (creates tables, the PostGIS extension & spatial indexes)
alembic upgrade head

# 2. Seed the fuel-type catalogue and representative Nigerian stations
python -m app.scripts.seed
```

- The initial migration (`0001_initial_schema`) enables the `postgis` extension and creates the `fuel_types`, `fuel_stations` (with a `geography(POINT, 4326)` column + GiST index) and `fuel_station_fuel_types` tables.
- The seed script is **idempotent** — re-running it updates rows in place instead of duplicating. Pass `--reset` to wipe and re-insert during development.
- Preview the exact SQL without touching the database with `alembic upgrade head --sql`.

---

### Step 4: Run FastAPI Backend Locally

We recommend setting up a virtual environment:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- **API URL:** `http://localhost:8000`
- **Interactive OpenAPI Documentation:** `http://localhost:8000/docs`

---

### Step 5: Run Next.js Frontend Locally

```bash
cd frontend
npm install
npm run dev
```
- **Frontend App URL:** `http://localhost:3000`

---

## 🧪 Testing the Setup

### Run Backend Tests
Ensure you are in the `/backend` directory:
```bash
pip install pytest
pytest
```
*Expected Output:*
All tests inside `backend/tests/` should pass successfully.

### Run Frontend Static Type Verification & Build
Ensure you are in the `/frontend` directory:
```bash
npm run build
```
*Expected Output:*
Next.js should output a successful static compiled page build.

---

## 🤝 3MTT Capstone Code Quality Commitment
We write clean, sustainable, modular software. We respect SOLID design principles, prevent the use of mocked or fake solutions, write extensive types/interfaces, and guarantee that the capstone requirements are completely built, integrated, and validated before adding secondary capabilities.
