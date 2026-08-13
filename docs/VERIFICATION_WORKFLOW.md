# VERIFICATION WORKFLOW

The complete image/report verification pipeline: submission → pending →
under review → approved/rejected → visible effect, plus the security model
around it.

## State machine

```
                 (admin marks "Under review")
PENDING ─────────────────────────────► UNDER_REVIEW
   │                                        │
   │  (AI photo score ≥ 90% auto-promotes   │
   │   — Gemini, optional)                  │
   ▼                                        ▼
VERIFIED (approved)                  REJECTED
   • stamps verified_at               • requires rejection_reason
   • becomes public                    • submitter sees the reason
```

Stored per report (migration 0010):

| Column | Purpose |
|---|---|
| `status` | pending / under_review / verified / rejected |
| `submitted_by` (`user_id`) | who reported (existed) |
| `submitted_at` (`created_at`) | when (existed) |
| `reviewed_by` | admin/moderator who decided (stamped from the authenticated JWT — never client-supplied) |
| `reviewed_at` | when the decision was made |
| `rejection_reason` | public-safe; shown to the submitter |
| `reviewer_notes` | moderation-only; exposed only via admin endpoints |
| `verified_at` | when approved |
| `photo_url` | storage reference (existed) |
| `ai_confidence_score` | Gemini score when run (existed) |

Reports are **immutable evidence**: approve/reject never rewrites the
submitted price/notes/photo; re-reviewing a rejected report clears the
rejection data so a corrected submission can be approved.

## API

| Endpoint | Who | What |
|---|---|---|
| `POST /api/v1/reports` | any authenticated user | multipart submit (photo optional) → status `pending` |
| `GET /api/v1/reports` | public | feed; **rejected hidden** |
| `GET /api/v1/reports/mine` | the submitter | own reports, **all** statuses + rejection reason |
| `POST /api/v1/reports/{id}/verify` | Admin | Gemini photo score (persists `ai_confidence_score`; ≥90% auto-promotes) |
| `GET /api/v1/admin/reports` | Admin | every report incl. rejected, reviewer fields |
| `PATCH /api/v1/admin/reports/{id}/status` | Admin | `{status, rejection_reason?, reviewer_notes?}` |

Rejection without a reason → HTTP 400 (backend-enforced). Unauthorized users
get 401/403 before any data access.

## Approval effects

- The report becomes visible as **verified** in the community feed, the
  station detail panel and price history.
- Fuel availability/price shown for a station is derived from its reports
  (verified and pending both contribute; the UI labels them), so an approved
  price report immediately improves what drivers see. Station-level fields
  are never overwritten by a report — current state stays derived, history is
  preserved.

## Image workflow & storage

1. User attaches a photo (JPEG/PNG/WebP, ≤ 5 MiB) in the report form.
2. Backend validates: declared MIME → size cap → **magic-byte content
   sniffing** → empty-file check. Renamed executables and type-confused files
   are rejected with useful errors.
3. `ImageStorage` writes the file to `MEDIA_DIR` under a random name and
   stores `photo_url` on the report (created in `pending`).
4. Moderators inspect the photo in the admin dashboard (thumbnail + open in
   new tab) and approve/reject.
5. `photo_url` is the storage reference throughout; it survives the workflow
   untouched (tested).

### Supabase Storage

Not currently used — images live on the backend's `/media` mount (public by
design: they are public evidence). If you switch to Supabase Storage:

- Create a bucket (e.g. `report-photos`). Decide **public evidence** vs
  **private**: for private, set the bucket to private and issue **signed
  URLs** server-side (`supabase.storage.from('report-photos').createSignedUrl(...)`)
  when serialising `photo_url`.
- Policies: `authenticated` may INSERT only their own uploads
  (`storage.objects` with `bucket_id='report-photos'` and `owner = auth.uid()`);
  SELECT public or owner; DELETE admin/service-role only.
- **Never** put `SUPABASE_SERVICE_ROLE_KEY` (or any `NEXT_PUBLIC_*_SERVICE_ROLE_KEY`)
  in frontend code. The frontend may only use `NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Auth/Realtime.

## RLS (`backend/supabase/rls_all.sql`)

Apply once from the Supabase SQL editor. The backend connects with the
privileged (service-role/direct) connection and enforces application
authorization itself; RLS protects the tables if they are ever touched via
PostgREST/Realtime with client keys:

| Table | anon | authenticated |
|---|---|---|
| `fuel_stations` | SELECT active only | SELECT active only (no writes) |
| `fuel_reports` | SELECT non-rejected | SELECT non-rejected or own; INSERT own rows with `status='pending'`; UPDATE own **pending** rows only, never to verified/rejected; no DELETE |
| `users` | — | SELECT own row only |
| `favorites` | — | own rows only (insert/delete) |

## Admin/moderator permissions

- Role lives in `users.role` and is checked by the backend (`require_roles`)
  on every admin route — the frontend `isAdmin` flag is presentation-only.
- Promoting a user to admin: `PATCH /api/v1/admin/users/{id}` with
  `{"role": "admin"}` (an existing admin does this), or a SQL update on
  `users.role` in the backend database.
- The admin dashboard (`/admin`) requires Supabase sign-in + role `admin`;
  otherwise it shows "You need an Admin account".

## UI for the submitter ("My reports")

The community feed's "My reports" toggle lists the user's own submissions:

- **Pending verification** — "Your report is awaiting verification."
- **Under review** — blue pill.
- **Verified** — green pill + confirmation message.
- **Rejected** — red pill + "Not accepted: {rejection_reason}".

Reviewer identity is never shown to the submitter; `reviewer_notes` never
leaves admin endpoints.

## Tests covering this workflow

- `backend/tests/test_report_review_workflow.py` (12 tests): pending creation,
  driver/anonymous approval rejection (403/401), admin under-review, admin
  approval + public effect, rejection without reason → 400, rejection with
  reason + submitter visibility via `/reports/mine`, re-review clears
  rejection data, rejected → public 404, submission fields never rewritten.
- `backend/tests/test_reports_mine.py` (5 tests): auth, per-user isolation,
  all statuses + reason, pagination scoping.
- `backend/tests/test_storage.py` (12 tests): magic-byte sniffing, empty
  uploads, type-confusion rejection, oversized uploads.
- `backend/tests/test_migrations_0009_0010.py` (11 tests): additive DDL,
  single head, downgrade safety.
- `frontend/src/components/reports/MyReports.test.tsx` (7 tests): pending /
  verified / rejected + reason, loading, error, empty.
- `frontend/src/components/stations/StationProvenanceBadge.test.tsx` (7 tests).
