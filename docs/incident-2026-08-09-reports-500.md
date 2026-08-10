# Incident Report — Production 500: `fuel_reports.ai_confidence_score` does not exist

**Date:** 2026-08-09
**Affected endpoint:** `GET /api/v1/reports?station_id={station_id}&page_size=20`
**Production host:** `https://fuel-station-finder-ai.onrender.com`
**Error (Render logs):**
```
asyncpg.exceptions.UndefinedColumnError: column fuel_reports.ai_confidence_score does not exist
```

---

## A. Root cause

The production database was never migrated past Alembic revision `0005`, but the
deployed application code expects the schema at revision `0008` (head).

- PR #13 ("Capstone feature completion … AI confidence, PWA …", merged
  2026-08-09) added three migrations to the repo:
  - `0006` — CNG fuel type (check-constraint widening + seed row)
  - `0007` — `favorites` table
  - `0008` — `fuel_reports.ai_confidence_score` (`NUMERIC(4,3)`, nullable)
- Render's `autoDeploy: true` rebuilt and deployed the new code, whose
  `FuelReport` ORM model selects `ai_confidence_score` on every report query.
- The migrations are **not** run by the Render `Dockerfile` (`CMD` is just
  `uvicorn`). Per `DEPLOYMENT.md` they must be applied manually to Supabase:
  `alembic upgrade head`. That step was skipped after PR #13 merged.
- Result: the ORM emits `SELECT … fuel_reports.ai_confidence_score …`, Postgres
  has no such column, and every reports query returns 500.

**Evidence (production, 2026-08-09):**
- `GET /api/v1/reports?page_size=20` → `500 Internal Server Error`
- `GET /api/v1/reports?station_id=be737478-…&page_size=20` → `500 Internal Server Error`
- `GET /api/v1/stations?fuel_type=CNG` → `total: 0` (migration 0006's CNG row is
  absent too — the whole PR #13 migration batch is missing in production)

**Exact reproduction on a local PostgreSQL 16 mirror** (production state = 0005,
with existing `fuel_reports` rows): identical error
`asyncpg.exceptions.UndefinedColumnError: column fuel_reports.ai_confidence_score does not exist`.

---

## B. Files changed

**No application code changes were required.**

- The `FuelReport` model already declares the column
  (`backend/app/models/fuel_report.py`):
  `ai_confidence_score: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)`
- The migration that creates it already exists
  (`backend/alembic/versions/0008_report_ai_confidence.py`):
  `op.add_column("fuel_reports", sa.Column("ai_confidence_score", sa.Numeric(4, 3), nullable=True))`

Per the task instructions ("If the model contains `ai_confidence_score` **but no
migration exists**, create a new migration"), **no new migration was created** —
the correct migration exists; production simply never applied it. The fix is
operational (see C).

This report: `docs/incident-2026-08-09-reports-500.md`.

---

## C. Migration created / applied

### Migration state (from `backend/`, venv with `requirements.txt` installed)

| Command | Result |
| :--- | :--- |
| `alembic current` (production) | Not executable from this environment — no production `DATABASE_URL` available. Production state **inferred from API evidence: `0005`** (see A). |
| `alembic current` (local mirror) | `0005` before fix → `0008 (head)` after fix |
| `alembic heads` | `0008 (head)` |
| `alembic history` | linear `0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 (head)` |

### The migration

Migration `0008` (`add ai_confidence_score to fuel_reports`) is **safe for an
existing production database with rows**:

- The column is **nullable** (`nullable=True`) — matches the ORM model exactly;
  existing rows are back-filled with `NULL`, no backfill/default migration
  strategy needed.
- No server default is added, so the ORM's "NULL until an AI verification ran"
  semantics are preserved.
- Executed SQL (offline render): `ALTER TABLE fuel_reports ADD COLUMN ai_confidence_score NUMERIC(4, 3);`
- `alembic upgrade head` also applies `0006` (CNG) and `0007` (favorites), both
  missing in production and both idempotent-safe (`0006` uses a guarded upsert;
  `0007` creates a new table).

### Verified locally end-to-end (PostgreSQL 16, pgserver)

1. Built a mirror of the production state: baseline schema at `0001` without
   PostGIS (local stand-in), `alembic upgrade 0005`, seeded 3 existing
   `fuel_reports` rows + stations/users.
2. Reproduced the exact 500 (same asyncpg `UndefinedColumnError`).
3. Ran `alembic upgrade head` → applied `0005 → 0006 → 0007 → 0008`.
4. `alembic current` → `0008 (head)`; re-running `alembic upgrade head` is a no-op (idempotent).
5. Backend test suite: **209 passed**.

### What production needs (one command, run from `backend/` with the production `DATABASE_URL` set)

```bash
alembic upgrade head
python -m app.scripts.seed   # idempotent — adds CNG stations so the CNG filter has data
```

⚠️ **Status:** this has **not** been executed against the production Supabase
database — this environment has no access to the production `DATABASE_URL`
(Render/Supabase credentials are not present in the sandbox, and outbound
connections to Render/Supabase are blocked). The command above is the complete,
verified remediation.

---

## D. Database verification result (local mirror, after `alembic upgrade head`)

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'fuel_reports'
ORDER BY ordinal_position;
```

| column_name | data_type | is_nullable |
| :--- | :--- | :--- |
| id | uuid | NO |
| station_id | uuid | NO |
| user_id | uuid | NO |
| fuel_type_code | character varying | NO |
| price_per_litre | numeric | YES |
| queue_length | character varying | YES |
| photo_url | character varying | YES |
| notes | text | YES |
| status | character varying | NO |
| verified_at | timestamp with time zone | YES |
| created_at | timestamp with time zone | NO |
| updated_at | timestamp with time zone | NO |
| **ai_confidence_score** | **numeric** | **YES** ← added by 0008 |

- All 3 pre-existing report rows preserved; `ai_confidence_score = NULL` on all of them.
- `favorites` table + indexes exist (0007); `CNG` row present in `fuel_types` (0006).
- ORM ↔ DB drift check (SQLAlchemy metadata vs live schema): **no drift** on any
  model table (only the PostGIS `location` column differs locally by design —
  production has real PostGIS).

---

## E. API verification result

| Request | Before fix | After fix (local mirror) |
| :--- | :--- | :--- |
| `GET /api/v1/reports?station_id=be737478-…&page_size=20` | **500** | **200** — 2 items (rejected report correctly hidden), `total: 2`, `page_size: 20` |
| `GET /api/v1/reports?page_size=20` | **500** | **200** |
| `ai_confidence_score` serialization | — | `null` for unverified rows; `0.85` round-trips as `0.85` after an update |

Production re-checked at 2026-08-09 (after the local fix): `GET /api/v1/reports?station_id=…&page_size=20`
still returns **500** — production will only return 200 once the migration is
applied against the Supabase database (section C). I am **not** claiming the
production issue is fixed; the fix is verified and ready to apply.

---

## F. Other schema mismatches discovered

**One root cause, three consequences.** Production is at `0005`; migrations
`0006`–`0008` are all missing. Apart from the reported 500, the same missing
migrations will break (or degrade) the following — all fixed by the single
`alembic upgrade head`:

1. **`GET/PUT/DELETE /api/v1/favorites`** → `relation "favorites" does not exist`
   (migration 0007 not applied). Affects the Favorites UI (hearts, "My favorites" filter).
2. **`POST /api/v1/reports/{id}/verify`** → admin Gemini verification writes
   `report.ai_confidence_score` and would hit the same missing column (migration 0008).
3. **Admin report moderation & any report list** → same missing-column 500 (they
   use `report_to_public`, which serializes `ai_confidence_score`).
4. **CNG filter / labels** → no crash, but zero CNG stations until `0006` is
   applied **and** `python -m app.scripts.seed` re-run (adds the 2 seeded CNG stations).

**No other model/schema mismatches found.** Compared across the stack:

- SQLAlchemy models (`fuel_types`, `fuel_stations`, `fuel_station_fuel_types`,
  `users`, `fuel_reports`, `favorites`) ↔ Alembic migrations `0001`–`0008`:
  consistent (column names, types, nullability, constraints, indexes, FKs, cascades).
- Pydantic schemas ↔ ORM (`FuelReportPublic.ai_confidence_score: float | None = None`
  etc.): consistent; verification round-trip tested.
- API endpoints ↔ services ↔ schemas: consistent.
- Frontend (`frontend/src/types/report.ts`, `lib/confidence.ts`) expects
  `ai_confidence_score?: number | null` — consistent with the backend payload.

### Recommended follow-up (prevention)

Render's `Dockerfile` does not run migrations at deploy time
(`CMD sh -c "uvicorn …"`), which is why a code deploy can silently land ahead of
its migrations. Recommended (optional, pending your approval):
run `alembic upgrade head &&` before `uvicorn` in the Docker `CMD` (or a Render
Pre-Deploy Command), so schema and code can never drift apart again.

---

## Production remediation runbook (for the operator — safe, verified steps)

Run from `backend/` with the production environment (the same `DATABASE_URL`
used by the Render service; on Render you can run these in a one-off shell or
locally with `DATABASE_URL` set to the Supabase **session pooler** URL):

```bash
# 1. Confirm state BEFORE touching anything (should show 0005 or earlier)
alembic current            # expected: 0005 (or less) — i.e. 0008 is pending

# 2. Apply the pending migrations (0006 CNG, 0007 favorites, 0008 ai_confidence_score)
alembic upgrade head
#    Safe for existing rows: 0008 adds a NULLABLE column with no default,
#    existing fuel_reports rows are back-filled with NULL.

# 3. Re-run the idempotent seed so the CNG fuel type + 2 CNG stations exist
python -m app.scripts.seed

# 4. Verify migration state + schema
alembic current            # expected: 0008 (head)
psql "$DATABASE_URL" -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='fuel_reports' ORDER BY ordinal_position;"
#    ai_confidence_score | numeric | YES  <-- must appear as the last column

# 5. Verify the API (any existing station_id works; fetch one from
#    GET https://fuel-station-finder-ai.onrender.com/api/v1/stations?page_size=1)
curl -i "https://fuel-station-finder-ai.onrender.com/api/v1/reports?station_id={existing_station_id}&page_size=20"
#    Expected: HTTP 200 with {"items":[...],"total":N,"page":1,"page_size":20}
#    Every item includes "ai_confidence_score": null (or a 0..1 value).

# 6. Also re-check the endpoints that the same unapplied migrations affected:
curl -i "https://fuel-station-finder-ai.onrender.com/api/v1/stations?fuel_type=CNG&page_size=100"
#    Expected: HTTP 200 with total >= 2 (CNG stations appear after step 3)
```

If anything is unexpected, stop and re-check `alembic current` vs the actual
tables (`\d fuel_reports`) before proceeding — do not run migrations twice blindly;
`alembic upgrade head` is idempotent via `alembic_version`, so a second run is a no-op.

