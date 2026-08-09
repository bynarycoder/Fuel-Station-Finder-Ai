# Fuel Station Finder AI — Capstone Feature Matrix

> Living audit document. Section 1 = state at start of the feature-completion pass.
> Section 2 = final state (updated after implementation).

## 1. Current state (start of pass)

| FEATURE | CURRENT STATUS | EXISTING FILES | BACKEND SUPPORT | FRONTEND SUPPORT | WHAT IS MISSING |
|---|---|---|---|---|---|
| Interactive map (Leaflet/OSM) | ✅ Implemented | `MapView.tsx`, `StationMap.tsx`, `icons.ts` | n/a | Markers, clusters, popups | Radius circle, closest-station highlight |
| Station markers + clustering | ✅ Implemented | `MapView.tsx` + `react-leaflet-cluster` | n/a | ✅ | — |
| Station list (browse) | ✅ Implemented | `StationList.tsx`, `useStations.ts` | `GET /stations` | ✅ | — |
| Nearest stations (Near Me) | ✅ Implemented (fixed in prior pass) | `useGeolocation.ts`, `StationFilters.tsx`, `lib/geo.ts` | `GET /stations/nearby` (PostGIS, 200) | Status machine, threshold, single watcher | Closest-card price/queue/freshness |
| Radius search | ✅ Implemented | `useMapStore` `RADIUS_OPTIONS` | `radius_meters` param | ✅ | Radius visualization |
| Fuel filters | ✅ Implemented | `StationFilters.tsx`, `FUEL_TYPE_CODES` | `fuel_type` param | ✅ | Debounce on text inputs |
| PMS / AGO / DPK / LPG | ✅ Implemented | `fuel_type.py`, `seed.py`, types | Enum + table + seed | Filters, form, detail | — |
| **CNG** | 🔴 Missing | — | Fuel type missing (enum, constraint, seed) | No filter/form/label | Everything end-to-end |
| Price reporting | ✅ Implemented | `ReportPriceForm.tsx`, `reports.py` | `POST /reports` (multipart, auth) | ✅ submitting/success/validation/api-error | Post-success feed refresh (invalidation exists) |
| Queue length | ✅ Implemented | model enum, form select, labels | ✅ | ✅ | — |
| Photo reporting | ✅ Implemented | storage.py, form, feed | ✅ | ✅ | Lazy image loading |
| Realtime reports | ✅ Implemented | `useReportRealtime.ts` | Supabase Realtime + polling fallback | ✅ | — |
| Authentication | ✅ Implemented | `useAuth.ts`, `lib/auth.ts`, `deps.py` | Supabase JWT (ES256/JWKS) backend-side | ✅ | — |
| Station details | 🟡 Partial | `StationDetail.tsx` | `GET /stations/{id}`, `GET /reports?station_id=` | Distance, fuels, prices, queue, confidence hint | Phone, price update time, full "Not available" handling, per-fuel price history, confidence % |
| Directions | ✅ Implemented | `format.ts` `directionsUrl()` | n/a | Google Maps deep link (list + card + detail + popup) | Prominent "Navigate to this station" label (partially there) |
| Favorites | 🔴 Missing (placeholder heart) | `StationDetail.tsx` (static Heart icon) | No table/endpoints | Placeholder only | Table + RLS + API + UI + filter |
| Recent searches | 🔴 Missing | — | — | — | localStorage hook + UI |
| Price history | 🟡 Partial | `StationDetail.tsx` recent list | `GET /reports?station_id=` | Recent reports list | Per-fuel series, trend, sparkline, update time |
| AI verification | 🟡 Partial | `gemini.py`, `POST /reports/{id}/verify` | Endpoint exists (admin-only) | Not wired into admin UI | Admin "Verify with AI" button + result display |
| Confidence score | 🔴 Missing (not persisted) | `VerificationResultPublic.score` | Score returned but NOT stored | — | `ai_confidence_score` column + UI labels |
| Admin dashboard | ✅ Implemented | `admin/page.tsx`, `admin.py` | ✅ analytics/users/moderation | ✅ | AI verify button |
| Moderation (verify/reject) | ✅ Implemented | admin UI + `PATCH /admin/reports/{id}/status` | ✅ | ✅ | — |
| PWA / offline | 🔴 Missing | — | — | — | Manifest, SW, offline fallback, cache, offline label |
| Responsive/mobile | ✅ Implemented | Tailwind grid, slide-overs | n/a | ✅ | Verify no horizontal overflow |
| Natural-language search | ✅ Implemented | `nl_search.py`, `GET /stations/search` | Groq | API-level (no dedicated UI) | Note in audit |
| Search debounce | 🔴 Missing | — | — | Query fires per keystroke | Debounce text inputs |

## 2. Final state (feature-completion pass)

| CAPSTONE REQUIREMENT | IMPLEMENTED? | FILES | API | DATABASE | UI | TEST | NOTES |
|---|---|---|---|---|---|---|---|
| Interactive map (Leaflet/OSM) | ✅ | `MapView.tsx` | n/a | n/a | Markers, clusters, popups, radius circle, recenter | build | Manual pan never fought |
| Station markers + clustering | ✅ | `MapView.tsx` | n/a | n/a | ✅ | build | `react-leaflet-cluster` |
| Nearest stations (Near Me) | ✅ | `lib/geo.ts`, `useGeolocation.ts`, `StationFilters.tsx` | `GET /stations/nearby` (unchanged) | PostGIS `ST_Distance` | Status machine, movement threshold, single watcher | 48 vitest incl. 10 geolocation scenarios | Fixed in prior pass, regression-tested here |
| Radius search | ✅ | `StationFilters.tsx`, `MapView.tsx` | `radius_meters` param | ✅ | Radius selector + map circle | vitest | — |
| Fuel filters | ✅ | `StationFilters.tsx` | `fuel_type` param | ✅ | Chips incl. CNG | vitest | Text inputs debounced (400 ms) |
| PMS / AGO / DPK / LPG | ✅ | `fuel_type.py`, `seed.py` | ✅ | ✅ | ✅ | pytest | Unchanged |
| **CNG** | ✅ (new) | `fuel_type.py`, `seed.py`, `0006_add_cng_fuel_type.py` | enum + validation | `ck_fuel_types_code_domain` widened + seed row | Filter chip, report form, detail grid, closest card | `test_cng.py` | 2 seeded stations offer CNG |
| Price reporting | ✅ | `ReportPriceForm.tsx` | `POST /reports` | `fuel_reports` | submitting/success/validation/API-error | pytest | Post-success invalidation of detail + feed |
| Queue length | ✅ | model + form + labels | ✅ | ✅ | ✅ | pytest | — |
| Photo reporting | ✅ | `storage.py`, `ReportPriceForm.tsx` | multipart upload | local media | Feed + detail photos (lazy) | pytest | — |
| Realtime reports | ✅ | `useReportRealtime.ts` | Supabase Realtime | publication + grants | Instant feed + 30 s polling fallback | — | Unchanged |
| Authentication | ✅ | `useAuth.ts`, `lib/auth.ts`, `deps.py` | Supabase JWT backend-side | JIT users | Sign in/up/out, session restore | pytest | Unchanged |
| Station details | ✅ (enhanced) | `StationDetail.tsx` | `GET /stations/{id}` + reports | — | Phone, "Not available", prices, queue, AI %, photo, favorite, price history | vitest (helpers) | — |
| Directions | ✅ | `lib/format.ts` | n/a | n/a | "Navigate to this station" CTA everywhere + Google Maps deep link | `format.test.ts` | Origin = user location when known |
| Favorites | ✅ (new) | `favorites.py` (model/service/API), `0007_favorites.py`, `rls_favorites.sql`, `useFavorites.ts` | `GET/PUT/DELETE /favorites` | `favorites` table + unique + RLS | Hearts on cards/detail, "My favorites" filter, sign-in prompt | `test_favorites_api.py` | User-scoped; no cross-user access |
| Recent searches | ✅ (new) | `useRecentSearches.ts`, `StationFilters.tsx` | n/a | n/a (localStorage) | Chips + clear | `useRecentSearches.test.tsx` | No sensitive data stored |
| Price history | ✅ (new) | `lib/priceHistory.ts`, `StationDetail.tsx` | existing reports | — | Per-fuel series, trend, SVG sparkline | `priceHistory.test.ts` | Derived from real reports only |
| AI verification | ✅ (new UI) | `admin/page.tsx`, `useAdmin.ts` | `POST /reports/{id}/verify` (admin-only, existed) | — | "Verify with AI" button, score, attributes, auto-promote | pytest (RBAC) | Backend unchanged except score persistence |
| Confidence score | ✅ (new) | `0008_report_ai_confidence.py`, `schemas/report.py`, `lib/confidence.ts` | `ai_confidence_score` in report payloads | new column | AI % + High/Medium/Low badges (detail, feed rows, admin) | `confidence.test.ts`, `test_ai_confidence.py` | Uses actual backend score |
| Admin dashboard | ✅ | `admin/page.tsx` | `GET /admin/*` | — | Analytics, moderation, users | pytest | Unchanged + AI button |
| Moderation | ✅ | admin + `PATCH /admin/reports/{id}/status` | admin-gated | status enum | Verify/Reject | pytest | — |
| PWA / offline | ✅ (new) | `manifest.webmanifest`, `sw.js`, icons, `/offline`, `PwaRegister.tsx`, `OfflineBanner.tsx` | — | — | Offline banner, cached station catalogue, offline page | build | Only public station GETs cached; auth requests never cached |
| Responsive/mobile | ✅ | header/filters/admin wrap | — | — | 375→1440 px reviewed, no horizontal overflow | build | — |
| Natural-language search | ✅ (API) | `nl_search.py` | `GET /stations/search` (Groq) | — | No dedicated UI (out of scope) | pytest | Noted as remaining gap |
| Security | ✅ | — | — | RLS file | anon key only | pytest | No secrets; admin gated; JWT backend-side |

### Remaining gaps (noted, not blocking)
1. Natural-language search has no dedicated frontend UI (endpoint + tests exist).
2. "Availability" reporting is conveyed via station fuel_types + price/queue reports — no separate boolean column (schema decision, no invented data).
3. AI verification requires a Gemini API key on the backend (`GEMINI_API_KEY`); without it the admin button returns 503 with a clear message.

