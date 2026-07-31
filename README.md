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
│   │   │   └── v1/            # v1 route handlers
│   │   ├── core/              # Global configs, DB settings, security
│   │   ├── models/            # SQLAlchemy 2.0 ORM models (PostGIS spatial)
│   │   ├── schemas/           # Pydantic validation schemas
│   │   ├── services/          # AI integrations, business logic
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
| **Phase 3** | **Authentication** | **REQUIRED** | ⏳ *Next Step* | Supabase Auth, JWT verification, and User roles (Driver, Station Manager, Admin). |
| **Phase 4** | **Fuel Stations API** | **REQUIRED** | ⏳ *Pending* | CRUD, spatial nearby station search (distance based), and filters. |
| **Phase 5** | **Interactive Map UI** | **REQUIRED** | ⏳ *Pending* | Leaflet + OpenStreetMap integration, marker clustering, and location routing. |
| **Phase 6** | **Fuel Reports Engine** | **REQUIRED** | ⏳ *Pending* | User submission logs: pricing, fuel types, queue length, and picture uploads. |
| **Phase 7** | **Realtime Updates** | **HIGH VALUE** | ⏳ *Pending* | Supabase Realtime synchronization to feed instant crowd-sourced updates to the UI. |
| **Phase 8** | **AI Features** | **HIGH VALUE** | ⏳ *Pending* | Gemini queue image analysis & validation score; Groq natural language search. |
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
