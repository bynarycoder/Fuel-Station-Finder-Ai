# NEAR ME PRODUCTION DEBUG REPORT

_Date: 2026-08-13 · Branch: `arena/019ffa20-fuel-station-finder-ai` · Fix commit: `19c0d47`_

## A. Deployment

| | |
|---|---|
| Frontend deployed commit | **`ea60384`** (Merge PR #18 — contains BOTH location fixes `3236a31` + `192ec56`). Vercel commit status on `main` HEAD: **success @ 2026-08-13T07:45:49Z**. Confirmed by fetching the live `https://fuel-station-finder-omega.vercel.app/sw.js` — it contains the `/nearby` cache-exclusion line that only exists in `ea60384`. |
| Backend deployed commit | Behavior-verified = current `main` (`ea60384`): the pre-fix backend (geography-cast bug) could not return correct per-city results; the live API does. `render.yaml`: `autoDeploy: true` from `main`, service `fuel-station-finder-api`. |
| Are both fixes deployed? | **YES** — both PostGIS fix (backend, live-tested) and frontend geo fix (deployed 07:45:49Z today) |
| Vercel branch | `main` (bynarycoder/Fuel-Station-Finder-Ai, root `frontend/`) |
| NEXT_PUBLIC_API_URL configured | **YES** (effectively) — `api.ts` fallback + deployed site both reach `fuel-station-finder-ai.onrender.com`; the live homepage SSR lists current DB stations. (Vercel env itself isn't readable without a token; behavior proves the wiring.) |
| API hostname | `https://fuel-station-finder-ai.onrender.com` (`/api/v1`) |
| Render API reachable | **YES** (free-tier cold starts return Render's "Application loading" interstitial for ~30–60 s after idle — note for phone testing) |

**Deployment timing (the crucial fact):** the previous location fix was merged at **07:45:08 UTC today** and Vercel finished deploying at **07:45:49 UTC**. The previous production deploy was **2026-08-12 19:20:47 UTC** (commit `96c19e8`) — which is what the phone had been running.

## B. GPS

The physical phone cannot be driven from the sandbox, but the bundle the phone ran is proven by its own error string:

- **"Location request timeout(d out)" exists ONLY in the pre-fix bundle** (`96c19e8`: `"Location request timed out. Please try again in a moment."`). That string does not exist anywhere in the deployed `ea60384` codebase (new message: *"We couldn't get your location in time…"*). → **The phone was running the OLD frontend code.**
- Old code request: **single attempt**, `enableHighAccuracy:false, timeout:20000, maximumAge:60000` — there was **no attempt 2** in the bundle the phone ran. In `ea60384`, attempt 2 (`enableHighAccuracy:false, timeout:15000, maximumAge:300000`) runs on TIMEOUT/POSITION_UNAVAILABLE; verified in source and by 14 hook tests.
- Browser error code on the phone: **not capturable remotely** — the new build now logs it per attempt: `[GEO] attempt 1: error {code, name: PERMISSION_DENIED|POSITION_UNAVAILABLE|TIMEOUT, message}` + `[GEO SUCCESS] latitude/longitude/accuracy`. On-device in production these logs are enabled with `?geo_debug=1` (chrome://inspect / Safari Web Inspector). UI already maps codes to distinct statuses (permission_denied / temporarily_unavailable / error), not a blanket "timeout".

## C. Request

- Old bundle: coordinates = the coarse low-accuracy fix. Per fix-commit forensics (`3236a31`), Nigerian cellular ISP-egress lookups commonly resolve to **Abuja** — so `GET /api/v1/stations/nearby?latitude≈9.08…&longitude≈7.47…` was sent, and the backend **correctly** returned Abuja stations for that (wrong) position. No city was hardcoded; the wrongness entered at the browser fix.
- Request wire format (verified by test `api.nearby.test.ts` + live calls): `GET /api/v1/stations/nearby?latitude=10.52…&longitude=7.43…&radius_meters=5000&limit=100` — params forwarded unchanged; backend echoes the caller's `latitude`/`longitude` back in the response body (seen live).

## D. PostGIS

Compiled the real SQLAlchemy query against the PostgreSQL dialect (not just read source):

```sql
... ST_DWithin(fuel_stations.location,
      CAST(ST_SetSRID(ST_MakePoint(%s, %s), 4326) AS geography(POINT,4326)), %s)
ORDER BY distance_meters ASC
binds: ST_MakePoint_1 = 7.4386 (LONGITUDE), ST_MakePoint_2 = 10.5207 (LATITUDE), SRID 4326, radius 5000.0
```

| | |
|---|---|
| Longitude/latitude order | `ST_MakePoint(7.4386, 10.5207)` = **X=lon, Y=lat** |
| Correct? | **YES** |

## E. Database

Sandbox cannot open a raw Postgres socket, so the equivalent read-only check was run **through the deployed backend executing that very PostGIS query against production Supabase**:

- **Kaduna direct query** (10.5207, 7.4386, 5 km): **12 stations, ALL `city=Kaduna, state=Kaduna`** — NNPC Kaduna Central (0 m), Mobil Ungwan Rimi (705 m), … **AA Rano Kawo (4424 m)**.
- **Kaduna point-check** (10.5607, 7.4386, 2 km): **AA Rano Kawo at 0.0 m**.
- **Abuja direct query** (9.0820, 7.4720, 5 km): **4 stations, ALL FCT** (NNPC Wuse 2 at 0 m …).

→ Supabase/PostGIS is **NOT** the problem.

## F. API

| Test | HTTP | Count | Cities/States | Mixed? |
|---|---|---|---|---|
| Kaduna 10.5207/7.4386 r=5000 | 200 | 12 | 100% Kaduna/Kaduna | **NO** |
| Abuja 9.0820/7.4720 r=5000 | 200 | 4 | 100% FCT | **NO** |

Backend `/nearby` also sets `Cache-Control: no-store` (code-verified in the deployed commit; header not capturable from this sandbox's fetch tooling).

## G. Frontend

- Stations received (old bundle): Abuja — **correct for the wrong (IP-resolved Abuja) position the old single low-accuracy request produced.**
- Stations displayed: Abuja — compounded by the **old service worker caching `/stations/nearby` responses** (pre-`3236a31`) so results could replay, and by `keepPreviousData` briefly showing prior results as "nearby".
- Old cached data possible on the phone? **YES — and worse than API caching:** the old SW served the **app shell itself cache-first** (precached `/` HTML) and the fix deploy did **not** bump `CACHE_VERSION` (`fsf-v1`), so installed devices kept executing the **old JavaScript bundle indefinitely** — the primary reason both symptoms persisted "after the fix".

## H. Root Cause

**PRIMARY: the phone never ran the fixed frontend.** (1) The location fix only reached production at **07:45:49 UTC today** — minutes before the failing test; and (2) the PWA service worker serves the app shell **cache-first** with an **unbumped cache version**, so even after the deploy the device kept executing the pre-fix bundle: single-attempt low-accuracy request → phone's location resolved to the ISP egress in **Abuja** → API correctly answered **Abuja** for that position; when no network fix arrived within 20 s, the old bundle printed its old "Location request timed out" string. Backend/DB/PostGIS were already correct in production (proven above).

**SECONDARY:**
1. Old SW cached `/stations/nearby` responses (cross-city replay risk) — fixed in `3236a31` but old cache entries survived because the cache version wasn't bumped (purged now by `fsf-v2`).
2. `keepPreviousData` let another location's results pose temporarily as nearby results (now skeleton-gated).
3. Render free-tier cold start (~30–60 s "Application loading" interstitial after idle) — can look like a hang/timeout during testing.
4. Cosmetic: `/health` reports `"environment":"development"` — Render dashboard env var predates `render.yaml`; unrelated.

## I. Fix

Commit `19c0d47` on `arena/019ffa20-fuel-station-finder-ai` (pushed). Smallest scope; **no seed data, no reseed, no migrations touched.**

1. **`frontend/public/sw.js`** — `CACHE_VERSION` `fsf-v1`→`fsf-v2` (activate purges every old cache: stale shell **and** stale nearby responses); navigations are **network-first** (HTML no longer precached/served stale); `/_next/static/*` stays cache-first (content-hashed, immutable); `/stations/nearby` + `/search` stay network-only.
2. **`frontend/src/lib/geo.ts`** — `geoCodeName` (1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT, 0=UNSUPPORTED); `geoDebugEnabled()` (dev default, on-device opt-in via `?geo_debug=1`); **`getSimulatedPosition()`** — test-only `?geo=lat,lon[,acc]` override, range-validated, inert unless explicitly in the URL.
3. **`frontend/src/hooks/useGeolocation.ts`** — structured per-attempt logs (`[GEO] attempt N: started {enableHighAccuracy,timeout,maximumAge}`, `attempt N: error {code,name,message}`, `[GEO SUCCESS] latitude=… longitude=… accuracy_m=…`); simulated fix honored in `request()`/`refresh()`; real watch skipped in simulation mode so it can't overwrite the test fix.
4. **`frontend/src/hooks/useStations.ts`** + **`frontend/src/app/page.tsx`** — expose `isPlaceholderData`; while the nearby fetch for the *current* position is in flight the UI shows a loading skeleton instead of another location's stations, and "Closest to you" is never crowned from placeholder data (LOCATION_REQUESTING / NEARBY_LOADING honesty).
5. **`backend/app/services/stations.py`** — logs retagged `[NEARBY REQUEST] latitude=… longitude=… radius_meters=…` / `[NEARBY RESULT] count=… first_station=… first_station_city=… first_station_state=… first_station_distance_m=…` (greppable in Render logs to compare phone-GPS vs request vs result).
6. **Tests** — `frontend/src/lib/geo.test.ts` (code names, override parsing/validation), `frontend/src/hooks/useGeolocation.test.tsx` (simulated fix bypasses GPS & watch; real GPS still used without the param).

## J. Verification

| Check | Result |
|---|---|
| Backend tests | **416 passed** (incl. `test_nearby_location.py` axis-order + "no Abuja hardcode" contracts) |
| Frontend tests | **101 passed** (new: 9 simulation/diagnostic tests) |
| Build | `next build` green (types + lint included) |
| Production API test | **PASS** — Kaduna→12×Kaduna (AA Rano 4.4 km), Abuja→4×FCT, AA Rano point→0.0 m; `sw.js` live = fixed content |
| Physical phone test | **PENDING (cannot run from sandbox)** — exact steps below |

### Phone verification steps (2 minutes)

1. **On the phone, close every tab of the app** (or Site settings → clear storage once) — then reopen `https://fuel-station-finder-omega.vercel.app/`. The `fsf-v2` worker purges the stale caches; every future deploy now self-propagates on next load.
2. **Pipeline proof without GPS:** open `https://fuel-station-finder-omega.vercel.app/?geo=10.5207,7.4386` → tap **Near me** → must list **Kaduna** stations ("Showing stations near you · 10.5207, 7.4386"). Then `?geo=9.082,7.472` → must list **FCT**. If these pass, FE→API→Supabase is proven on the device itself.
3. **Real GPS proof:** plain URL → **Near me**. If it fails, the console now says exactly why: `?geo_debug=1` + remote inspector (chrome://inspect / Safari) shows `[GEO] attempt 1: error code=… name=PERMISSION_DENIED|POSITION_UNAVAILABLE|TIMEOUT`. Compare `[GEO SUCCESS]` coordinates with the `[NEARBY REQUEST]`/`[NEARBY RESULT]` lines in Render logs.
4. First load after idle may take ~30–60 s (Render free-tier cold start) — wait for it; it's not the location bug.

### Deployment action required for this new commit

The session branch `arena/019ffa20-fuel-station-finder-ai` is pushed. Merge it into `main` (PR) — Vercel + Render auto-deploy (`next build` green; backend change is log-text-only). No env var changes, no redeploy of unchanged infra, **no reseed**.

## FINAL VERDICT

⚠️ **CODE FIXED — DEPLOYMENT/CACHE STILL NEEDS ACTION**

The pre-existing fixes are deployed and **proven live** (backend/DB correct for Kaduna & Abuja). The two production symptoms were reproduced-by-proxy and explained: **the phone was executing the pre-fix frontend bundle**, kept alive by the service worker's stale app-shell caching — which this commit eliminates (`fsf-v2` purge + network-first HTML), while adding the runtime diagnostics and on-device GPS simulation the audit asked for. The physical-phone confirmation (steps above) is the one remaining action and can now be executed deterministically.
