# Report-Photo Storage Durability Migration Report

Status: **Implemented** (PR #46)
Scope: backend photo storage only — no UI, schema, or public API changes.

## 1. Root cause

`POST /api/v1/reports/{report_id}/verify` returned `404 "Stored image not found"`
in production for reports that clearly had a photo.

Report photos were written to a **local `/media` directory** on Render's
ephemeral filesystem. Render wipes that disk on every restart and redeploy. The
database kept the original `photo_url` (e.g. `/media/<uuid>.jpg`), but the file
behind it had vanished. When verification called `storage.read_image()`, the
file was missing → `404`. The image itself was fine — the *durability* of where
it was stored was the problem.

## 2. Design decisions

### 2.1 URL-vs-key addressing
We keep addressing by **URL** end-to-end. `save()` returns a public URL that is
stored in the existing `photo_url` column (unchanged, `String(512)`); `read_image()`
and `delete()` dispatch on that URL. We deliberately did **not** introduce a
separate storage key — it would have required a new DB column/migration and new
public API fields for no benefit.

### 2.2 Local + Supabase dispatch (backward compatible)
`ImageStorage` gained an optional Supabase configuration. The dispatch is:

* URL starts with `url_prefix` (`/media/...`) → **local disk**, exactly as before.
* Everything else (absolute `https://` public URL or bare storage path) →
  **Supabase Storage**.
* When Supabase is *not* configured, `save()` writes to local disk and all
  behavior is byte-for-byte identical to the original backend.

Legacy reports keep their `/media/...` URLs and read from local disk unchanged.
Only **new** uploads move to Supabase when the service role key is configured.

### 2.3 Public-bucket ensure (`_ensure_bucket`)
Before the first upload the bucket is provisioned once per process:

* `POST /storage/v1/bucket {"id","name","public":true}` → `200/201` → done.
* `400/409` (already exists) → confirm via `GET /storage/v1/bucket/{id}` → proceed.
* Anything else / network error → `503`.

Using a **public** bucket means the existing frontend `resolveMediaUrl` (which
passes absolute URLs through unchanged) renders Supabase photos with **zero
frontend change**.

### 2.4 Outage-vs-404 behavior
The critical distinction for observability:

* **Missing object** (real `404`) → `FileNotFoundError` → HTTP `404` "Stored
  image not found".
* **Storage outage** (network error, timeout, `401/403/5xx`) →
  `StorageUnavailableError` → HTTP `503` "Photo storage is temporarily
  unavailable."

This means a storage outage is never misread as "the image is gone" (which was
the original silent failure).

### 2.5 Sync-vs-async (threadpool offload)
`ImageStorage` stays **synchronous** (simple, unit-testable). Because `read_image`,
`save`, and `delete` can now perform blocking HTTP round-trips, the FastAPI
handlers wrap every call in `starlette.concurrency.run_in_threadpool` so the
async event loop is never blocked by storage I/O.

## 3. Storage behavior matrix

| Scenario | `save` | `read_image` | `delete` |
|---|---|---|---|
| Supabase configured, upload OK | uploads to bucket, returns public `https://` URL | `GET` object → `(bytes, mime)` | `DELETE` object (best-effort) |
| Supabase configured, upload fails | `HTTPException` **503** (never falls back to ephemeral disk) | — | — |
| Supabase configured, object missing | — | `FileNotFoundError` → **404** | — |
| Supabase configured, outage / 5xx | — | `StorageUnavailableError` → **503** | swallowed (best-effort) |
| Supabase unconfigured | local `/media` (unchanged) | local `/media` (unchanged); non-`/media` URL → `FileNotFoundError` | local unlink (no-op if gone) |
| Legacy `/media/<name>` URL | — | local disk, unchanged | local unlink |
| Upload rejected (bad MIME/type/size/empty) | `400` / `413` (unchanged) | — | — |

## 4. Activation steps on Render

1. **Create the bucket (optional)** — the backend auto-creates a **public**
   `report-photos` bucket on first upload (`_ensure_bucket`). To create it
   manually: Supabase Dashboard → Storage → New bucket → `report-photos`,
   Public.
2. **Get the service role key** — Supabase Dashboard → Settings → API →
   `service_role` key. It bypasses RLS, so **no RLS/policy changes are needed**.
3. **Set env vars on Render** (server-side secret):
   * `SUPABASE_STORAGE_BUCKET=report-photos`
   * `SUPABASE_SERVICE_ROLE_KEY=<service_role key>` — **never** in a
     `NEXT_PUBLIC_*` variable.
   * `SUPABASE_STORAGE_TIMEOUT_SECONDS=30` (optional, default 30).

### Safe rollout
Deploy the **code first with `SUPABASE_SERVICE_ROLE_KEY` empty**. Behavior is
unchanged (uploads stay on local disk, legacy reads still work). Once the
deploy is healthy, add the secret and redeploy/restart — new uploads then go to
Supabase. Because the code ships first, there is no window where uploads could
fail.

## 5. Test plan

Backend (pytest, no network — `httpx` is mocked):

* legacy `/media` read works even when Supabase is configured
* `save` uploads to Supabase + returns public URL (assert auth header + content)
* `save` falls back to local when Supabase unconfigured
* `read_image` on full Supabase URL and bare storage path
* Supabase `404` → `FileNotFoundError`; network error/`5xx` → `StorageUnavailableError`
* Supabase unconfigured non-local URL → `FileNotFoundError`
* `delete` dispatches to Supabase remove
* `_ensure_bucket` creates public bucket / confirms existing / fails with `503`
* `save` Supabase failure → `503`, writes nothing locally
* verify endpoint: report photo stored in Supabase → fetched → Gemini invoked → verified
* verify endpoint: Supabase read outage → `503`, never `404`

Frontend: `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`
(run to confirm the `resolveMediaUrl` passthrough still holds and nothing else
regressed).

## 6. Residual risks

* **Supabase availability** — the fix moves the failure surface from Render's
  disk to Supabase's object storage. Outages now surface as `503` (correctly,
  per design) rather than a misleading `404`.
* **Legacy `/media` photos already lost** are **not recovered** — the fix
  prevents *new* losses; previously-wiped photos still 404. A backfill would
  require the original files (not available on the ephemeral disk).
* **Bucket provisioning latency** — first upload pays a bucket-create round
  trip. Mitigated by creating the bucket manually up front (step 4.1) and by
  once-per-process caching.
* **Service-role key exposure** — strictly server-side; must never be added to
  a `NEXT_PUBLIC_*` var. RLS is bypassed by design; the key must be kept in
  Render's secret store.
* **Timeout tuning** — a slow storage backend could make verification slower.
  `SUPABASE_STORAGE_TIMEOUT_SECONDS` bounds it (default 30s).
