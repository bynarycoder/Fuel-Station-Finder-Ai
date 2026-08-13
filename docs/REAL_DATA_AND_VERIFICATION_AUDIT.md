# REAL DATA & VERIFICATION AUDIT

**Project:** Fuel Station Finder AI — 3MTT Capstone
**Date:** 2026-08-13
**Status:** Implemented & tested (backend 499 tests, frontend 125 tests, production build ✓)

---

## A. Current architecture

```
Frontend (Next.js 15 + React Query + Zustand + Leaflet)
   │  fetch wrapper (services/api.ts) — Bearer token from Supabase session
   ▼
FastAPI (backend/app) — /api/v1
   ├── stations      → services/stations.py        → SQLAlchemy async
   ├── reports       → services/reports.py         → fuel_reports
   ├── admin         → services/admin.py           → moderation/analytics
   ├── favorites     → services/favorites.py
   ├── station_import→ services/station_import.py  → NEW (Phase 3)
   └── auth          → Supabase JWT (ES256/JWKS) → JIT users row
   ▼
PostgreSQL + PostGIS (Supabase) — geography(POINT, 4326) with GiST index
   ▼
Supabase Storage  →  NOT used: report photos are served from the backend's
                     local /media mount (swappable ImageStorage service)
```

Auth: Supabase Auth is the identity provider; the backend verifies JWTs itself
(ES256 via JWKS) and mirrors identities into a local `users` table with
application roles (`driver`, `station_manager`, `admin`).

## B. Existing station source

`backend/app/scripts/seed_data/`:
- `lagos_fct.py` — the original **18** records (15 Lagos + 3 FCT), kept verbatim.
- `nationwide.py` — **158** synthetic records, all named with a `(Demo)` suffix.
- `stations.py` — concatenates the two → **176** total.

## C. The 176 seeded stations

| Metric | Count |
|---|---|
| Total | **176** |
| By state (top) | Kaduna 15, Lagos 15, FCT 11, Oyo 8, Delta 7, Anambra 6, Enugu 6, Rivers 6 |
| All 36 states + FCT covered | Yes (37/37) |
| Demo-suffixed rows | 158 |
| Original seed rows (no suffix) | 18 |

## D. Demo/seed data or externally verified?

**Seed/demo.** The nationwide records are explicitly synthetic in the source
(`nationwide.py`: "DEMO DATA — NOT VERIFIED"); the original 18 are seed rows
with approximate coordinates. **Before this audit the schema had no way to
express this** — every row looked identical in the API. Now (migration 0009)
every row carries `data_source = 'seed'` and
`verification_status = 'unverified'`.

> The current nationwide catalogue is seeded/demo data and is **not** an
> authoritative live registry. No external provider is connected.

## E. Database schema (after this change)

```
fuel_stations
  id uuid PK · name · brand · address · city · state · phone
  location geography(POINT,4326) + GiST index
  is_active bool
  data_source        VARCHAR(20) CHECK  → seed|official|government|partner|community|imported|other   [NEW]
  verification_status VARCHAR(20) CHECK → unverified|pending|verified|rejected                          [NEW]
  verified_at · last_verified_at · source_id                                                            [NEW]
  created_at · updated_at
  UNIQUE(name, city)

fuel_reports
  id · station_id FK · user_id FK · fuel_type_code FK
  price_per_litre · queue_length · photo_url · notes
  status VARCHAR(20) CHECK → pending|under_review|verified|rejected   [under_review NEW]
  verified_at · ai_confidence_score
  reviewed_by FK(users, SET NULL) · reviewed_at · rejection_reason · reviewer_notes   [NEW]

fuel_types / fuel_station_fuel_types / users / favorites — unchanged
```

Migrations: `0009_station_provenance.py`, `0010_report_review_workflow.py`
(additive only; no station/report rows deleted).

## F. Image storage architecture

- `services/storage.py` `ImageStorage`: local-disk storage under `MEDIA_DIR`,
  served by FastAPI's `/media` static mount. Swappable for Supabase Storage —
  only this module + `get_image_storage()` need to change.
- **Phase 9 validation added:** declared MIME must be JPEG/PNG/WebP; size cap
  (default 5 MiB); **magic-byte content sniffing** (renamed executables and
  type-confused files are rejected); empty/corrupt uploads rejected.
- Supabase Storage is **not used**; no bucket config exists. If a bucket is
  later introduced, policies must follow `docs/VERIFICATION_WORKFLOW.md`
  (private bucket + signed URLs; never service-role keys client-side).

## G. Verification architecture (before → after)

**Before:** `PENDING → VERIFIED | REJECTED` with no reviewer, no reason, and
no way for the submitter to see the outcome (rejected reports were a public
404). Approval only stamped `verified_at`.

**After (complete state machine):**

```
PENDING ──► UNDER_REVIEW ──► APPROVED (verified)
   │            │                └─ stamps reviewed_by/reviewed_at/verified_at
   └────────────┴────────► REJECTED
                            └─ requires rejection_reason (backend-enforced)
                               stamps reviewed_by/reviewed_at
```

- `PATCH /admin/reports/{id}/status` (Admin-only, enforced server-side) now
  takes `{status, rejection_reason?, reviewer_notes?}`; the reviewer identity
  is stamped from the **authenticated admin** (never client-supplied).
- `GET /reports/mine` (authenticated) returns the submitter's own reports in
  **every** status, including rejected + the rejection reason.
- Reports stay immutable: approval/rejection never rewrites submission data;
  current state is derived from the report row.
- **Approval has real effect:** the report becomes public as `verified`
  (visible in feeds/detail); price/queue data shown in the UI derives from
  verified + pending reports on the station.

## H. Get Directions behavior (before → after)

**Before:** `directionsUrl()` already built
`https://www.google.com/maps/dir/?api=1&destination=lat,lon&travelmode=driving`
and was wired into the station list, closest card, detail panel and map popup.
Coordinates were correct (lat/lon order).

**After (hardening):** `directionsUrl` returns `null` instead of ever emitting
`destination=undefined,undefined` or out-of-range/reversed coordinates; the
four call sites render the link only when a URL exists; origin (user location)
is included only when valid. URL params are safely encoded via
`URLSearchParams`. New unit tests prove station A → station A, no lat/lon
reversal, no undefined coordinates, correct generation.

## I. Current API endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/stations` | public | list/filter/paginate (page_size ≤ 100) |
| GET | `/api/v1/stations/nearby` | public | PostGIS ST_DWithin, `Cache-Control: no-store` |
| GET | `/api/v1/stations/search` | public | NL search (Groq) |
| GET | `/api/v1/stations/{id}` | public | detail |
| POST | `/api/v1/stations` | admin/manager | create |
| PATCH | `/api/v1/stations/{id}` | admin/manager | update |
| DELETE | `/api/v1/stations/{id}` | admin/manager | delete |
| **POST** | **`/api/v1/stations/import`** | **admin/manager** | **NEW — idempotent real-data import** |
| POST | `/api/v1/reports` | user | multipart (photo) |
| GET | `/api/v1/reports` | public | feed (hides rejected) |
| **GET** | **`/api/v1/reports/mine`** | **user** | **NEW — own reports, all statuses + reason** |
| GET | `/api/v1/reports/{id}` | public | rejected → 404 |
| POST | `/api/v1/reports/{id}/verify` | admin | Gemini photo score |
| GET/PUT/DELETE | `/api/v1/favorites` | user | |
| GET | `/api/v1/admin/analytics` | admin | |
| GET | `/api/v1/admin/reports` | admin | **now returns reviewer fields** |
| PATCH | `/api/v1/admin/reports/{id}/status` | admin | **now stores reviewer + reason** |
| GET/PATCH | `/api/v1/admin/users` | admin | |
| GET | `/api/v1/auth/me` | user | |

## J. Current frontend consumers

- `useStationsQuery` — browse (fetchAllStations walks all pages) / nearby.
- `useStationReports`, `useReports` + `useReportRealtime` (Supabase Realtime
  invalidation with 30 s polling fallback).
- `StationList`, `StationDetail`, `MapView` popups — stations + Directions.
- `ReportPriceForm` — multipart submission, loading/success/error states.
- `MyReports` (NEW) — submitter status tracking with rejection reason.
- `ReportsFeed` — community feed; "My reports" toggle (NEW).
- `admin/page.tsx` — analytics, moderation (NEW: under-review action, reject
  with reason, evidence photo preview, rejection display), users.

## K. Broken / incomplete flows found

1. **No station provenance** — impossible to distinguish seed data from real
   data; API and UI implied every station was equally authoritative. → Fixed.
2. **Verification dead-ended after PENDING** — no reviewer identity, no
   rejection reason, no submitter visibility. → Fixed (state machine + /mine).
3. **Admin approve/reject could not carry a reason**; rejected reports were
   invisible to the submitter (public 404 with no explanation). → Fixed.
4. **Image upload trusted the client's declared type** — renamed executables
   could be stored. → Fixed (magic-byte sniffing + empty-file rejection).
5. **No real-data ingestion path** — the only way to add genuine stations was
   hand-editing seed files. → Fixed (`station_import` + staff endpoint).
6. **Directions URL edge cases** — `undefined`/invalid coordinates could
   produce a malformed navigation URL. → Fixed (null + guarded rendering).
7. **No tests for the 176-station catalogue through the data/service path**
   (frontend pagination tests existed; backend proof was only dataset-level).
   → Added (`test_catalogue_availability.py`).

**Working correctly already:** Nearby/PostGIS geo (ST_MakePoint lon/lat +
ST_DWithin geography, no default-city fallback, phone-safe geolocation with
fatal-vs-transient state machine, movement threshold, `no-store`), browse
pagination walking, CORS, JWT auth with JIT users, admin RBAC, AI photo
scoring persistence, PWA caching rules (never caches nearby/search), Supabase
Realtime wiring, favorites + RLS, CNG support.

## L. Security concerns (audited)

- No `service_role` / Supabase secret keys anywhere in frontend code, env
  files or git history (scanned). Frontend uses only anon-key client config.
- Admin authorization is enforced server-side via `require_roles(ADMIN)`
  (JWT → users.role); no client `isAdmin` flag is trusted.
- **NEW** `backend/supabase/rls_all.sql`: RLS policies for `fuel_stations`
  (public SELECT only — no client writes), `fuel_reports` (public SELECT
  non-rejected; authenticated INSERT own pending rows only; UPDATE own pending
  rows only, and never to `verified`/`rejected`), `users` (self SELECT only),
  `favorites` (user-scoped). The backend's service-role/direct connection
  bypasses RLS and enforces application authorization on top.
- Image validation prevents arbitrary file uploads (content sniffing, size
  cap, no trust in filename/declared type).
- JWKS cached with TTL; token expiry/audience/issuer verified; disabled
  accounts rejected.
- **Remaining:** `/media` is public by design (evidence is public); if photos
  must be private, switch to Supabase Storage + signed URLs (documented).

## M. Recommended changes — implemented

Everything in sections E–K above; the minimum coherent set was chosen to keep
the existing architecture intact (no new frontend framework, no admin
rewrite, no bucket migration).

---

## Station classification (Phase 19 — honest labels)

| Class | Count | API fields | UI badge |
|---|---|---|---|
| SEEDED / DEMO | 176 | `data_source=seed`, `verification_status=unverified` | "Unverified Demo Data" |
| REAL + VERIFIED | 0 | — | — |
| REAL + UNVERIFIED | 0 (until an import runs) | `data_source=imported/official/...` | "Unverified" / source label |
| COMMUNITY-SUBMITTED | fuel reports (not stations) | `fuel_reports.status` | Pending/Under review/Verified/Rejected |

**The current nationwide catalogue is seeded/demo data and is not an
authoritative live registry.** Real data can be ingested through
`POST /api/v1/stations/import` (see `docs/DATA_PROVENANCE.md`).

## Test results (complete suites)

- Backend: **499 passed, 1 skipped** (PostGIS-gated live-API walk; runnable
  with `POSTGIS_TEST_URL`). New: import validation/upsert (25), import API
  RBAC (9), review workflow (12), /reports/mine (5), provenance (9), storage
  sniffing (12), migrations 0009/0010 (11), catalogue availability (6+1).
- Frontend: **125 passed** (vitest). New: provenance badge (7), My Reports
  (7), extended directions (7).
- `npm run build` (production): passes.
- `alembic upgrade head --sql`: renders clean additive DDL; `alembic heads`:
  single head `0010`.
