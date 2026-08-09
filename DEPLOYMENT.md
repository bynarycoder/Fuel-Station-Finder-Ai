# 🚀 Deployment Guide — Fuel Station Finder AI

A 3-cloud production architecture:

| Layer | Host | Notes |
| :--- | :--- | :--- |
| **Frontend** | Vercel | Next.js 15 (React 19). Auto-detected. |
| **Backend** | Render | FastAPI in Docker (`render.yaml` Blueprint). |
| **Database / Auth / Realtime** | Supabase | Managed PostgreSQL **+ PostGIS**, Auth (JWT), Realtime. |

This guide is **pre-deploy only** — it assumes the code in this repo and walks through wiring up the three hosts. Real credentials are entered in each host's dashboard (never committed).

---

## 1. Database & Auth — Supabase

1. Create a project at [supabase.com](https://supabase.com) (pick a region close to your users). Supabase ships **PostGIS** enabled.
2. From **Project Settings → API** and **Database**, collect:
   - `Project URL` → `SUPABASE_URL` (for this deployment: `https://atkikyfishwziuvyyeob.supabase.co`)
   - `anon` public key → `SUPABASE_ANON_KEY`
   - The backend verifies the project's asymmetric ES256 access tokens with the public JWKS endpoint; do **not** use the anon key as a signing secret.
   - **Connection strings**:
     - *Session pooler (IPv4)* — required when the host (e.g. Render) cannot reach Supabase's IPv6 direct address. Use port **5432** (session mode) for sync/migrations and port **6543** (transaction mode) for the async runtime:
       - `DATABASE_URL` (sync: migrations/seed): `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`
       - `ASYNC_DATABASE_URL` (async runtime): `postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
     - *Direct* (only from an IPv6-capable host): `postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres`
3. **Run migrations & seed** against the Supabase DB (from `backend/` with a local venv):
   ```bash
   # set DATABASE_URL to the Supabase direct connection, then:
   alembic upgrade head        # creates tables + PostGIS + realtime publication
   python -m app.scripts.seed  # loads Nigerian fuel types & stations
   ```
   (Migration `0004` opts the tables into the `supabase_realtime` publication, enabling live updates; migration `0005` grants `SELECT` on those tables to the `anon`/`authenticated` roles so Supabase Realtime can stream them.)
4. **Apply the feature-completion migrations** (CNG fuel type, favorites, AI confidence):
   ```bash
   alembic upgrade head
   python -m app.scripts.seed   # idempotent — adds the CNG fuel type + stations
   ```
   Migrations `0006` (CNG), `0007` (`favorites` table) and `0008`
   (`fuel_reports.ai_confidence_score`) run automatically as part of
   `alembic upgrade head`.
5. **Enable RLS for favorites** (Supabase SQL editor): run
   `backend/supabase/rls_favorites.sql`. It creates the `favorites` table
   (idempotent — skip if migration 0007 already created it), enables Row Level
   Security, and adds per-user policies so users can only see/manage their own
   favorites. The backend's `service_role` connection bypasses RLS by design.
6. Create your **Admin** user: open the frontend map, click **Sign in → Sign up**, register your account (new accounts are created as **drivers** — sign-up never grants admin), then in the Supabase SQL editor promote them:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
   ```
   > The local `users` row is JIT-provisioned by the backend on the first authenticated request, so sign in once after registering before running the `UPDATE`. If email confirmation is enabled on the Supabase project, confirm the email first.

---

## 2. Backend — Render

The repo includes a [`render.yaml`](./render.yaml) Blueprint.

1. On Render, **New → Blueprint** and point it at this repository. Render reads `render.yaml` and creates the `fuel-station-finder-api` web service (Docker runtime, `/health` health check, honours `$PORT`).
2. Configure the Render environment variables:
   - `DATABASE_URL`, `ASYNC_DATABASE_URL` — from Supabase (step 1).
   - `SUPABASE_URL` — `https://atkikyfishwziuvyyeob.supabase.co`.
   - `SUPABASE_ANON_KEY` — the Supabase anon key (it is not used as a JWT signing key).
   - `SUPABASE_JWT_ALGORITHM` — exactly `ES256`.
   - `SUPABASE_JWT_AUDIENCE` — exactly `authenticated`.
   - `SUPABASE_JWT_ISSUER` — `https://atkikyfishwziuvyyeob.supabase.co/auth/v1`.
   - `SUPABASE_JWKS_URL` — `https://atkikyfishwziuvyyeob.supabase.co/auth/v1/.well-known/jwks.json`.
   - `SUPABASE_JWKS_CACHE_TTL_SECONDS` — `300` (optional; the default is five minutes).
   - `GEMINI_API_KEY`, `GROQ_API_KEY` — optional; enable AI features.
   - `CORS_ORIGINS` — comma-separated, **must include your Vercel frontend URL**, e.g.
     `https://fuel-station-finder-omega.vercel.app`.

   `SUPABASE_JWT_SECRET` is not required for this ES256 deployment. Remove or
   clear the old legacy secret if it is still present; it is never used by the
   ES256 verifier.
3. Deploy. The service is healthy when `https://<your-render-app>.onrender.com/health` returns `{"status":"ok"}`.
4. Verify authentication from the production frontend after deployment:
   - Sign in at `https://fuel-station-finder-omega.vercel.app`.
   - In the browser Network panel, find `GET https://fuel-station-finder-ai.onrender.com/api/v1/auth/me`.
   - Confirm it has `Authorization: Bearer <access token>` and returns `200` with the local profile.
   - Confirm the UI changes from `Sign in | Create Account` to the authenticated email and `Sign out`.
   - If it returns `401`, check Render logs for `algorithm`, `kid`, `category`, and `issuer_valid` without sharing the token. Confirm the token's `kid` exists in the live JWKS response and that the issuer/audience variables exactly match the values above.

> **Photo storage note:** uploaded report photos are written to the container's local `media/` directory, which is **ephemeral** on Render (lost on redeploy). For durability, mount a Render **Disk** at `media/` or swap `ImageStorage` for Supabase Storage — the storage layer is intentionally isolated for this.

---

## 3. Frontend — Vercel

1. On Vercel, **Add New → Project** and import the repo.
2. Set **Root Directory** to `frontend/` (Vercel auto-detects Next.js; `vercel.json` is included).
3. Add **Environment Variables** (all `NEXT_PUBLIC_*` are baked in at build time):
   - `NEXT_PUBLIC_API_URL` → your Render backend, e.g. `https://fuel-station-finder-api.onrender.com/api/v1`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Visit the Vercel URL to verify the map loads stations.

---

## 4. Post-deploy checklist

- [ ] Backend `/health` is `ok` on Render.
- [ ] Frontend loads stations from the deployed backend (check the browser network tab).
- [ ] `CORS_ORIGINS` on the backend includes the Vercel origin (no CORS errors).
- [ ] Sign in at `/admin` with an admin account → analytics/moderation render.
- [ ] (Optional) Set `GEMINI_API_KEY`/`GROQ_API_KEY` and test AI verification & NL search.
- [ ] (Optional) Configure durable media storage (Render Disk or Supabase Storage).

---

## 5. Environment variable reference

**Backend (Render)**
| Variable | Required | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | ✔ | `postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:5432/postgres` (IPv4 session pooler; use direct only from an IPv6 host) |
| `ASYNC_DATABASE_URL` | ✔ | `postgresql+asyncpg://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres` (transaction pooler; prepared-statement cache is disabled in code) |
| `SUPABASE_URL` | ✔ | `https://atkikyfishwziuvyyeob.supabase.co` |
| `SUPABASE_ANON_KEY` | ✔ | `eyJhbGci...` (not a signing secret) |
| `SUPABASE_JWT_ALGORITHM` | ✔ | `ES256` |
| `SUPABASE_JWT_AUDIENCE` | ✔ | `authenticated` |
| `SUPABASE_JWT_ISSUER` | ✔ | `https://atkikyfishwziuvyyeob.supabase.co/auth/v1` |
| `SUPABASE_JWKS_URL` | ✔ | `https://atkikyfishwziuvyyeob.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWKS_CACHE_TTL_SECONDS` | – | `300` |
| `CORS_ORIGINS` | ✔ | `https://fuel-station-finder-omega.vercel.app` |
| `GEMINI_API_KEY` | – | (Google AI Studio) |
| `GROQ_API_KEY` | – | (Groq console) |
| `GEMINI_MODEL` / `GROQ_MODEL` | – | defaults: `gemini-1.5-flash` / `llama-3.1-8b-instant` |
| `MEDIA_DIR` / `MEDIA_URL` | – | defaults: `media` / `/media` |

**Frontend (Vercel)**
| Variable | Required | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | ✔ | `https://<render-app>.onrender.com/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | for auth/realtime | `https://[ref].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for auth/realtime | `eyJhbGci...` |

---

## 6. Demo script (for the capstone video)

A ~3-minute walk-through:

1. **Landing & map** (`/`): show the OpenStreetMap with clustered Nigerian station markers; click a marker → popup with fuels + *Get directions*.
2. **Near me**: click *Near me* (geolocation) → map recentres, nearest stations listed with distances.
3. **Filters**: filter by fuel type / brand; open the **Live reports** panel → shows the community feed with a *Live*/*Polling* badge (Supabase Realtime).
4. **Submit a report** (signed in): post a price + photo → it appears instantly in the feed (realtime).
5. **AI**: as admin, run *Verify* on a report photo (Gemini validation score) and try a **natural-language search** ("short petrol near Ikeja") via Groq.
6. **Admin dashboard** (`/admin`): analytics cards, moderate the report (Verify/Reject), manage a user.
7. **Stack recap**: mention Supabase (DB/Auth/Realtime), Render (API), Vercel (UI), PostGIS spatial search, and the AI layer.
