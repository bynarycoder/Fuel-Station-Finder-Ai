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
   - `Project URL` → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `JWT secret` → `SUPABASE_JWT_SECRET`
   - **Connection strings**:
     - *Direct* (migrations/seed, sync): `postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres` → `DATABASE_URL`
     - *Pooler / Transaction* (async runtime): `postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres` → `ASYNC_DATABASE_URL`
3. **Run migrations & seed** against the Supabase DB (from `backend/` with a local venv):
   ```bash
   # set DATABASE_URL to the Supabase direct connection, then:
   alembic upgrade head        # creates tables + PostGIS + realtime publication
   python -m app.scripts.seed  # loads Nigerian fuel types & stations
   ```
   (Migration `0004` opts the tables into the `supabase_realtime` publication, enabling live updates.)
4. Create your **Admin** user: sign up via the `/admin` page once the frontend is live, then in the Supabase SQL editor promote them:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
   ```

---

## 2. Backend — Render

The repo includes a [`render.yaml`](./render.yaml) Blueprint.

1. On Render, **New → Blueprint** and point it at this repository. Render reads `render.yaml` and creates the `fuel-station-finder-api` web service (Docker runtime, `/health` health check, honours `$PORT`).
2. Fill in the prompted secret env vars (the ones marked `sync: false`):
   - `DATABASE_URL`, `ASYNC_DATABASE_URL` — from Supabase (step 1).
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`.
   - `GEMINI_API_KEY`, `GROQ_API_KEY` — optional; enable AI features.
   - `CORS_ORIGINS` — comma-separated, **must include your Vercel frontend URL**, e.g.
     `https://fuel-station-finder-ai.vercel.app`.
3. Deploy. The service is healthy when `https://<your-render-app>.onrender.com/health` returns `{"status":"ok"}`.

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
| `DATABASE_URL` | ✔ | `postgresql://postgres.[ref]:[pw]@db.[ref].supabase.co:5432/postgres` |
| `ASYNC_DATABASE_URL` | ✔ | `postgresql+asyncpg://...@...pooler.supabase.com:6543/postgres` |
| `SUPABASE_URL` | ✔ | `https://[ref].supabase.co` |
| `SUPABASE_ANON_KEY` | ✔ | `eyJhbGci...` |
| `SUPABASE_JWT_SECRET` | ✔ | (Supabase JWT secret) |
| `SUPABASE_JWT_AUDIENCE` | – | `authenticated` |
| `CORS_ORIGINS` | ✔ | `https://fuel-station-finder-ai.vercel.app` |
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
