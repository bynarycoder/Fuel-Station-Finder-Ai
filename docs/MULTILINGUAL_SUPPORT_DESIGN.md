# Multilingual Support Design Review

**Languages:** English (default), Hausa (`ha`), Yoruba (`yo`), Igbo (`ig`)  
**Phase:** 1 — Architecture review only. **No implementation in this document.**  
**Hard constraint:** No existing functionality may stop working, regress, or change behavior.

---

## Current-state findings

### Frontend

- Next.js 15 App Router (`frontend/src/app/`), React 19, no i18n library today.
- Single root layout hard-codes `<html lang="en">` and English metadata (`layout.tsx`).
- All UI copy is inline English in components (header, nav, forms, admin, AI panel, empty/error states).
- Theme preference already uses `localStorage` (`fuelfinder-theme`) with a pre-hydration script. Language can follow the same pattern.
- Client-heavy pages (`"use client"`) dominate; this is **not** a locale-routed multi-page site (`/en/...`).
- Tests (Vitest + Testing Library) assert English strings throughout.

### Groq

Three English-only prompt surfaces:

| Feature | File | Output |
|---|---|---|
| Chat | `backend/app/services/ai/chat.py` | Natural language; prompt says “plain, friendly English” |
| Intent / NL search | `recommend.py`, `nl_search.py` | Strict JSON (language-independent) |
| Explanation | `recommend.py` `_EXPLANATION_PROMPT` | JSON `{"answer": "..."}` in English |
| Routing | `classify_query()` | English regex only (`near me`, `hello`, `petrol`, …) |
| Fallback templates | `fallback_answer`, `build_deterministic_answer`, `build_station_reason` | Hard-coded English |

APIs: `POST /api/v1/ai/chat`, `POST /api/v1/ai/recommend`. Request bodies have **no** language field.

### Gemini

- Image-only verification (`analyze_queue_image`). Prompt is English; output is **strict JSON** (`score`, `is_plausible`, `summary`, `detected_attributes`).
- Report **notes** are stored as free text and are **not** sent to Gemini today.
- Auto-verify (background after `POST /reports`) and admin `POST /reports/{id}/verify` share one pipeline.
- `VERIFICATION_THRESHOLD = 0.7` must not change.

### APIs / schema

- Reports: multipart `POST /reports` (`station_id`, `fuel_type_code`, `price_per_litre`, `queue_length`, `notes`, `photo`). No language field.
- Users table: `id`, `email`, `full_name`, `role`, `is_active` — **no locale column**.
- Reports table: no `language` / `locale` column. Notes are opaque text.
- Existing tests lock request/response shapes.

### Deployment

- Frontend: Vercel (`frontend/vercel.json`).
- Backend: Render (see `DEPLOYMENT.md`).
- No locale CDN/routing today. Adding path-based locales (`/ha/...`) would break bookmarks and Vercel rewrites — **do not do this**.

---

## 1. Recommended i18n framework

### Recommendation: **react-i18next** (not next-intl)

**Why this stack, given this repo:**

1. **Client-first UI.** Almost all copy lives in client components. `react-i18next` + `i18next` works without App Router locale segments.
2. **Default English with zero URL change.** Existing users keep `/`, `/about`, `/admin`. Language is `localStorage` + optional `Accept-Language`, default `en`.
3. **Smaller blast radius than next-intl.** `next-intl` wants `[locale]` routing, middleware, and `generateStaticParams`. That would change every URL, every test that renders pages, and Vercel routing — a compatibility risk we cannot accept.
4. **Same persistence pattern as theme.** `ThemeProvider` already solved hydration + `localStorage`. A `LocaleProvider` can sit next to it without a new routing layer.
5. **ICU / interpolation** for prices, distances, and counts (`{{km}} km`, `₦{{price}}`) without rewriting `format.ts` on day one.
6. **Tests stay simple.** `I18nextProvider` + English resources means existing string assertions stay green if default locale is `en` and keys’ English values match today’s copy.

**Rejected alternatives**

| Option | Why not |
|---|---|
| **next-intl** | Locale-prefixed routes; middleware; layout rewrite; high regression risk |
| **next-i18next (Pages)** | Wrong router generation |
| **Custom JSON + context only** | Reinvents pluralization, interpolation, missing-key fallback |

**Implementation shape (when approved):**

- `i18next` + `react-i18next` + `i18next-browser-languagedetector` (order: `localStorage` → `navigator` → `en`).
- Resources bundled (no extra network hop on first paint).
- Fallback: `fallbackLng: 'en'`. Missing keys always show English, never empty chrome.
- `<html lang>` updated client-side (`en` | `ha` | `yo` | `ig`) after mount; server HTML stays `lang="en"` so SSR/SEO and first paint match today’s behavior.

---

## 2. File-by-file impact report

### Must change for UI (copy extraction + language switcher)

```text
frontend/package.json                          # add i18next, react-i18next
frontend/src/app/layout.tsx                    # optional: keep lang="en" (default)
frontend/src/app/providers.tsx                 # wrap LocaleProvider
frontend/src/app/page.tsx                      # chrome strings
frontend/src/app/about/page.tsx
frontend/src/app/admin/page.tsx
frontend/src/app/offline/page.tsx
frontend/src/components/OfflineBanner.tsx
frontend/src/components/account/AccountPanel.tsx
frontend/src/components/ai/FuelIntelligence.tsx
frontend/src/components/auth/SignInModal.tsx
frontend/src/components/location/LocationPicker.tsx
frontend/src/components/map/MapControls.tsx
frontend/src/components/map/MapView.tsx
frontend/src/components/map/StationMap.tsx
frontend/src/components/reports/MyReports.tsx
frontend/src/components/reports/ReportPriceForm.tsx
frontend/src/components/reports/ReportsFeed.tsx
frontend/src/components/search/SearchBar.tsx
frontend/src/components/shell/AppFooter.tsx
frontend/src/components/shell/AppHeader.tsx
frontend/src/components/shell/MobileBottomNav.tsx
frontend/src/components/stations/FuelFilterChips.tsx
frontend/src/components/stations/LocationPrimer.tsx
frontend/src/components/stations/LocationStatusBanner.tsx
frontend/src/components/stations/StationCard.tsx
frontend/src/components/stations/StationDetail.tsx
frontend/src/components/stations/StationFilters.tsx
frontend/src/components/stations/StationList.tsx
frontend/src/components/stations/StationProvenanceBadge.tsx
frontend/src/components/stations/facts.tsx
frontend/src/components/theme/ThemeSelector.tsx
frontend/src/components/ui/RelativeTime.tsx    # locale-aware time if we touch it
frontend/src/components/ui/states.tsx
frontend/src/lib/format.ts                     # optional locale for numbers (keep ₦ format)
frontend/src/lib/siteInfo.ts
frontend/src/lib/stationSummary.ts
frontend/public/manifest.webmanifest           # name/description stay EN by default
```

### New frontend files (additive)

```text
frontend/src/i18n/config.ts
frontend/src/i18n/locales/en.json
frontend/src/i18n/locales/ha.json
frontend/src/i18n/locales/yo.json
frontend/src/i18n/locales/ig.json
frontend/src/components/i18n/LocaleProvider.tsx
frontend/src/components/i18n/LanguageSelector.tsx
frontend/src/i18n/config.test.ts
```

### Frontend tests (update only if English copy moves; keep assertions on EN default)

```text
frontend/src/app/about/page.test.tsx
frontend/src/app/page.*.test.tsx
frontend/src/app/providers.test.tsx
frontend/src/components/OfflineBanner.test.tsx
frontend/src/components/ai/FuelIntelligence*.test.tsx
frontend/src/components/location/LocationPicker.test.tsx
frontend/src/components/reports/MyReports.test.tsx
frontend/src/components/reports/ReportPriceForm*.test.tsx
frontend/src/components/search/SearchBar.test.tsx
frontend/src/components/stations/*.test.tsx
frontend/src/components/ui/*.test.tsx
frontend/vitest.setup.ts                      # wrap default I18nextProvider (en)
```

### Backend — AI language (optional request field; prompts)

```text
backend/app/schemas/ai.py                     # optional locale on chat/recommend
backend/app/api/v1/ai.py                      # pass locale through
backend/app/services/ai/chat.py               # prompt + classify_query + fallbacks
backend/app/services/ai/recommend.py          # intent glossary + explanation language
backend/app/services/ai/nl_search.py          # multilingual synonym hint in prompt
backend/app/services/ai/gemini.py             # notes language hint ONLY; JSON shape unchanged
```

### Backend — optional, non-breaking API/schema

```text
backend/app/schemas/report.py                 # optional locale on public model (default omit)
backend/app/api/v1/reports.py                 # optional Form locale; ignore if absent
backend/app/models/fuel_report.py             # ONLY if we add nullable locale column
backend/alembic/versions/0011_report_locale.py  # nullable, no backfill required
```

**Do not touch (behavior must stay identical):**

```text
backend/app/services/reports.py               # verification thresholds, persistence
backend/app/services/storage.py
backend/app/services/stations.py
backend/app/core/security.py
backend/app/api/v1/auth.py
backend/app/api/v1/admin.py                   # except UI-facing admin strings on frontend
Render / Vercel config, docker-compose, Supabase
```

### Backend tests to extend (not rewrite)

```text
backend/tests/test_ai_api.py
backend/tests/test_ai_recommend_api.py
backend/tests/test_groq_chat.py
backend/tests/test_nl_search.py
backend/tests/test_recommend.py
backend/tests/test_gemini.py
backend/tests/test_gemini_verify_api.py
backend/tests/test_reports_api.py
```

---

## 3. Translation architecture

Flat-ish namespaces, one file per language. English values **must equal current UI copy** so default behavior is bitwise-identical for testers.

```text
frontend/src/i18n/locales/
  en.json
  ha.json
  yo.json
  ig.json
```

### Structure (illustrative)

```json
{
  "meta": {
    "languageName": "English",
    "nativeName": "English"
  },
  "nav": {
    "signIn": "Sign in",
    "signUp": "Sign up",
    "createAccount": "Create account",
    "about": "About",
    "openMenu": "Open menu",
    "accountSignedIn": "Account — signed in as {{email}}",
    "subtitle": "Find fuel across Nigeria"
  },
  "search": {
    "placeholder": "Search stations or ask Fuel AI…",
    "nearMe": "Near me",
    "empty": "No stations match these filters."
  },
  "filters": {
    "allFuels": "All fuels",
    "verifiedOnly": "Verified only"
  },
  "report": {
    "title": "Report a price",
    "price": "Price per litre",
    "queue": "Queue length",
    "notes": "Notes (optional)",
    "submit": "Submit report",
    "required": "This field is required",
    "success": "Report submitted",
    "pending": "Pending review"
  },
  "status": {
    "pending": "pending",
    "under_review": "under review",
    "verified": "verified",
    "rejected": "rejected"
  },
  "admin": {
    "title": "Admin",
    "verifyWithAi": "Verify with AI",
    "approve": "Approve",
    "reject": "Reject"
  },
  "ai": {
    "ask": "Ask Fuel AI",
    "thinking": "Thinking…",
    "needsLocation": "I need your location to find stations near you."
  },
  "errors": {
    "generic": "Something went wrong. Please try again.",
    "offline": "You are offline."
  },
  "empty": {
    "noReports": "No reports yet."
  },
  "language": {
    "label": "Language",
    "en": "English",
    "ha": "Hausa",
    "yo": "Yorùbá",
    "ig": "Igbo"
  }
}
```

**Rules**

- Keys are stable English identifiers; never rename keys in a hotfix.
- Interpolation only for dynamic values (`{{email}}`, `{{km}}`, `{{price}}`).
- **Do not translate** station names, brands, fuel codes (`PMS`, `AGO`), or user-authored notes.
- Number/currency: keep `₦` and current `format.ts` for EN; later optionally `Intl` per locale without changing stored numbers.
- Crowdsourced `notes` and Gemini `summary` stay in the language they were written; UI chrome around them is translated.

**Preference storage**

```text
localStorage key: fuelfinder-locale
values: "en" | "ha" | "yo" | "ig"
default if missing: "en"
```

No login required. No migration. Existing users never see a language modal.

---

## 4. Groq strategy

### Language source of truth

Priority (first match wins):

1. Explicit optional API field `locale` (`en` | `ha` | `yo` | `ig`).
2. Else treat as **English** (today’s behavior).

**Do not** auto-detect language for routing in v1 if it would change `classify_query` outcomes for English users. Detection is only a *hint inside the LLM prompt* after the user has selected a UI language.

### Optional field (backward compatible)

```python
# AIRecommendRequest / AIChatRequest
locale: str | None = Field(default=None, pattern="^(en|ha|yo|ig)$")
```

Omitted / `null` → English prompts and English fallbacks. Existing clients unchanged.

### A. Intent extraction (JSON — language-neutral output)

Add glossary; **do not change JSON keys**.

```text
# Append to _INTENT_PROMPT / nl_search _SYSTEM_PROMPT

The user may write in English, Hausa, Yoruba, or Igbo.
Always return the SAME JSON schema. Field values for fuel_type, sort_preference,
and queue_length MUST stay the English enum codes (PMS, AGO, DPK, LPG, CNG,
distance, price, none, short, ...). Never put Hausa/Yoruba/Igbo words in those fields.

Synonyms (non-exhaustive):
- petrol / PMS / mai / epo rọba / mmanụ ụgbọala → PMS
- diesel / AGO → AGO
- kerosene / DPK / kananzir → DPK
- gas / cooking gas / LPG → LPG
- cheapest / mafi arha / tí ó pọ̀jù / kacha ọnụ ala → sort_preference "price"
- nearest / kusa da ni / nítòsí mi / nso m → sort_preference "distance"
```

### B. Chat (natural language)

Change only the language sentence when `locale` is set:

```text
# Current
Answer the user's message in plain, friendly English.

# When locale == "ha"
Answer the user's message in plain, friendly Hausa (Hausa Latin script).
If you are unsure of a technical term, keep the English product term
(Fuel Intelligence, PMS, verified) and explain it briefly in Hausa.

# yo / ig analogously.
# When locale is None or "en": KEEP THE CURRENT SENTENCE VERBATIM.
```

### C. Explanation

```text
# Current
Explain to the user, in 2-3 short friendly sentences, ...

# When locale in {ha, yo, ig}
Explain to the user in {language}, in 2-3 short friendly sentences, ...
JSON keys stay English: {"answer": "<text in the user's language>"}.
Station names, prices (₦), and verification_status values stay as supplied.
```

### D. `classify_query` (routing)

**Risk:** English-only regex will send Hausa “ina tasha kusa da ni?” to **conversation** instead of **search**.

**Mitigation (additive patterns only):**

```text
# Additional STRONG_FINDER (examples — to be reviewed by a native speaker)
kusa da ni | kusa da | mafi kusa
nítòsí | nitosi mi | ibi to sunmo
nso m | ebe dị nso | kacha nso

# Additional DOMAIN
mai | fetur | epo | mmanụ | ọdụ mmanụ | tasha
```

**Compatibility:** New patterns are OR’d onto existing English regex. English phrases still match first. Add unit tests that **existing English fixtures still return the same mode**.

### E. Deterministic fallbacks

When Groq is down, answers stay honest. Ship a small map:

```text
FALLBACKS[locale]["help"]
FALLBACKS[locale]["needs_location"]
FALLBACKS[locale]["no_match"]
```

`en` strings **must be character-identical** to current `_FALLBACK_ANSWER` and `needs_location` / `build_deterministic_answer` English.

`reason` on each recommendation is currently English templates. For v1, either:

- keep English reasons (safest for tests), or
- translate templates with the same facts (no LLM). Prefer translated templates **only** if tests assert structure not exact English.

### F. Response language control

The model is told the target language in the system prompt. We do **not** post-translate with a second model (latency + hallucination). Cache key for recommendations should include `locale` so EN/HA answers are not mixed:

```text
cache_key = (query.strip(), locale or "en", round(lat, 3), round(lon, 3))
```

Omitting locale keeps today’s key shape if we default `locale` to `"en"` **inside** the key only.

---

## 5. Gemini strategy

### What Gemini does today

- Input: **image bytes + English instruction**.
- Output: structured JSON used for scoring and auto-promote.
- Report `notes` are **not** in the prompt.

### Hausa / Yoruba / Igbo reports

- **Photos:** language-independent. Same `analyze_queue_image` path.
- **Notes:** stored as-is. Search remains substring/filter on existing fields (station, fuel, status) — no FTS migration.
- **Verification:** one pipeline. No second model, no translation step before verify.

### Prompt modification (additive, English instructions)

Keep JSON schema identical. Optionally mention that any visible pump text or user context may be in Nigerian languages:

```text
# Append to _VERIFICATION_PROMPT — do not remove or reorder existing rules

Signage or handwritten text in the photo may be in English, Hausa, Yoruba, or Igbo.
That must not lower the score. Judge the photo, not the language of text in it.
`summary` and `detected_attributes` remain short English (moderator language)
so admin tools and existing tests stay stable.
```

**Do not** ask Gemini to return summaries in the user’s language in v1 — that would break admin consistency and snapshot tests.

### Structured output

Unchanged:

```json
{
  "score": 0.0,
  "is_plausible": false,
  "summary": "...",
  "detected_attributes": []
}
```

Unchanged: `VERIFICATION_THRESHOLD`, `persist_verification_score`, background auto-verify, admin retry.

### Optional `locale` on `POST /reports`

```text
locale: Form optional, max 8 chars, ignored if missing
```

If persisted: **nullable column**, no backfill. Existing rows stay `NULL` (= English / unknown). Never required. Never used to branch verification.

---

## 6. Risk assessment

| Risk | Type | Mitigation |
|---|---|---|
| English UI strings change while extracting keys | Technical / tests | `en.json` copied from current source; Vitest setup forces `lng: 'en'`; snapshot/text tests stay green |
| next-intl / locale URLs break Vercel and bookmarks | Deployment | Do not use path locales |
| `classify_query` treats HA/YO/IG search as chat | AI | Additive regex + Groq still extracts intent if routed to recommend; tests for EN fixtures first |
| Groq answers English despite `locale=ha` | AI | System prompt first line; spot-check eval set; fallbacks are native |
| Intent JSON polluted with native words (`"fuel_type": "mai"`) | AI | Existing validators drop unknown codes; prompt forbids it; tests with mixed-language queries |
| Recommendation cache serves EN answer to HA user | Technical | Include locale in cache key |
| Gemini summary language change breaks admin | AI | Force English summary in prompt |
| Extra prompt tokens / latency | Performance | Few dozen words; no second LLM; resources bundled on FE |
| Bundle size of 4 JSON files | Performance | Keep chrome-only strings (~5–15 KB gzipped total); no translating station catalogue |
| Incomplete / poor HA/YO/IG translations | Product | Native review before ship; missing keys fall back to EN |
| Alembic locale column locks table | Deployment | Nullable add only; no rewrite; skip column entirely in v1 if possible |
| Tests asserting exact English AI fallbacks | Tests | EN fallbacks frozen; new tests for other locales isolated |
| XSS via translated strings | Technical | i18n default escape; no `dangerouslySetInnerHTML` for t() |
| PWA manifest / SEO stay English | Product | Acceptable; `lang` on html updates after hydrate |

---

## 7. Testing plan

### Existing suite (must stay green)

```text
cd frontend && npm test
cd backend && pytest
```

- Frontend: wrap tests with i18n `lng: 'en'` in `vitest.setup.ts` so `t('nav.signIn')` === `"Sign in"`.
- Backend: all current chat/recommend/gemini/report tests run **without** `locale` and must match today’s strings and status codes.

### English still works

- Load app with empty `localStorage` → English chrome, `html lang="en"`.
- Submit report, search, sign-in, admin approve — same as today.
- `POST /ai/recommend` without `locale` → English answer + same ranking.

### Hausa / Yoruba / Igbo UI

- Select language → chrome (nav, buttons, validation, empty, errors, admin) switches.
- Reload → preference persists.
- Switch back to English → identical to original copy.
- Station names / user notes remain untranslated.

### Groq four languages

| Case | Expect |
|---|---|
| EN “cheapest petrol near me” | `mode=recommendation`, same intent as today |
| HA/YO/IG equivalent + `locale` | Intent enums still `PMS` / `price`; `answer` in that language |
| EN greeting | `mode=conversation`, English |
| HA greeting + `locale=ha` | conversation, Hausa |
| Missing Groq | locale-specific fallback; `answer_source=fallback` |
| No locale | English fallback text **byte-identical** to current |

### Automatic Gemini verification

- Photo report, no locale: background verify, threshold 0.7, statuses unchanged.
- Photo report + `locale=yo`: same pipeline, same JSON parse, same promote/hold.
- Gemini down: report stays pending; no 500.

### Manual admin verification

- `POST /reports/{id}/verify` body/response unchanged.
- Admin UI labels translated; API errors can stay English in v1 (operators).

### Admin dashboard

- Queue, filters, verify/approve/reject still call the same endpoints.
- Existing reports readable; notes shown raw.

### Compatibility contract tests (add)

```text
POST /reports           # no locale field → 201
GET /reports
POST /reports/{id}/verify
POST /api/v1/ai/chat    # {message} only
POST /api/v1/ai/recommend  # {query, lat, lon} only
```

Unknown extra JSON fields: FastAPI/Pydantic v2 default ignore or configure `extra='ignore'` (already typical) so old servers and new clients stay compatible.

---

## Recommended rollout (after this review is approved)

1. **UI i18n only** (EN json = current copy + language selector defaulting to EN). Ship if tests green — users see no change.
2. **Add HA/YO/IG chrome translations** behind the selector.
3. **Optional `locale` on AI endpoints** + prompt appendices + cache key.
4. **Additive `classify_query` patterns** with frozen EN tests.
5. **Gemini prompt appendix** (image language-agnostic). Skip DB column unless product needs it.

No step changes verification, storage, auth, or ranking weights.

---

## Success criteria checklist

| Criterion | How we know |
|---|---|
| Existing users see no regression | Default EN, no modal, same URLs |
| Existing reports work | No destructive migration; notes untouched |
| APIs compatible | Optional fields only |
| Auto Gemini verify works | Same function, same threshold |
| Manual admin verify works | Same endpoint |
| Groq four languages | Prompt + tests + locale field |
| UI four languages | Four JSON files + selector |
| Test suite green | CI unchanged commands |
| No feature breaks | Phased rollout; EN frozen strings |

---

## Decision needed before implementation

1. Confirm **react-i18next** + no URL locales.
2. Confirm **no DB migration in v1** (locale only on client + optional AI body).
3. Confirm Gemini summaries stay **English** for moderators.
4. Native-speaker review of `ha.json` / `yo.json` / `ig.json` and routing synonyms.

**No code has been implemented as part of this review.**
