# UI QA & accessibility audit — PR #40 follow-up

Date: 2026-08-17 · Scope: frontend only (no backend, API or schema changes).

This is the record of the production QA pass run on top of the design-spec
implementation. It exists because "the tests pass" is not evidence that a UI
is correct: jsdom has no layout engine, so the component suite can prove
structure and behaviour but never geometry, colour or contrast.

---

## 1. Method

Two independent layers:

| Layer | Tool | What it can prove |
| --- | --- | --- |
| Structure & behaviour | `vitest` + Testing Library (jsdom) | what is mounted, what a tap does, what the store receives |
| Geometry, colour, contrast | `frontend/scripts/ui-audit.mjs` — **real headless Chromium** driven by `puppeteer-core` | computed boxes, overflow, overlap, snap heights, computed type, WCAG ratios of every rendered text node, console errors |

The browser harness runs against a **production build** (`next build && next
start`) with the station API, the reports API, favourites, `/auth/me` and map
tiles stubbed at the network layer, so results are deterministic and offline.
It exercises hostile data on purpose: a 68-character station name, a long
address and a four-digit price.

Run it:

```bash
npm run build && npm run start                 # terminal 1
node scripts/ui-audit.mjs --json report.json   # terminal 2
```

It needs a Chromium build (`CHROME_PATH=…`, or `puppeteer-core` +
`@sparticuz/chromium` installed locally). Without one it prints a notice and
exits 0 — it is a QA tool, never a build dependency.

To include the authenticated screens (Report Price, signed-in Account) build
with a stub Supabase config and set `AUDIT_SUPABASE_STUB=1`; the harness seeds
a local session so no network auth is involved.

---

## 2. Results

```
Browser audit (production build)      161 / 161 checks passed
  + authenticated pass                 15 / 15  additional checks passed
Component tests (vitest)              544 / 544 passed  (46 files)
Lint (next lint)                      PASS
Typecheck (tsc --noEmit)              PASS
Production build (next build)         PASS
```

Viewports measured: **320×640, 360×800, 375×812, 390×844, 414×896, 430×932,
1024×768, 1280×720, 1366×768, 1440×900, 1920×1080** — in both themes.

Representative measurements (production build, touch emulation on):

| Viewport | doc scrollWidth | visible map | collapsed sheet | chrome above map |
| --- | --- | --- | --- | --- |
| 320×640 | 320 (= viewport) | 236 px (37 %) | 121 px | 219 px |
| 375×812 | 375 | 300 px (37 %) | 217 px | 231 px |
| 390×844 | 390 | 318 px (38 %) | 231 px | 231 px |
| 430×932 | 430 | 369 px (40 %) | 268 px | 231 px |
| 1440×900 | 1440 | 980 × 844 map beside a 460 px rail | n/a (hidden) | n/a |

Bottom sheet snaps measured at **42 % / 68 % / 92 %** of the map surface
(34 % collapsed on ≤700 px-tall viewports), with the map controls above the
sheet at every snap, nothing behind the bottom nav, and the page itself never
scrolling.

---

## 3. Defects found and fixed

### 3.1 Every sized button lost its foreground colour (critical)

`tailwind-merge` classifies `text-*` as a colour unless it recognises the
value as a font size. It does not know this project's custom scale, so
`text-body-sm` / `text-h3` were treated as colours and evicted the colour that
came before them in `cn()`:

```
cn("bg-slab text-slab-fg", "h-11 rounded-md px-4 text-body-sm")
  → "bg-slab h-11 rounded-md px-4 text-body-sm"   // no foreground at all
```

Measured effect in the browser: "Browse all" rendered near-black ink on dark
green at **2.08:1**; "Near me" in dark mode was **2.15:1**. The source looked
correct, which is exactly why only a real browser caught it.

Fix: `extendTailwindMerge` in `src/lib/utils.ts` declares the type scale as
font sizes. Guarded by `src/lib/utils.test.ts` and `src/components/ui/button.test.tsx`
(every variant × every size).

### 3.2 Contrast

| Element | Before | After | Change |
| --- | --- | --- | --- |
| Filled primary buttons / selected filter chips (light) | 3.11:1 | **5.25:1** | `--action` steps from `#16A765` to brand-700 `#0D7C4A`, still white labels |
| Filled primary (dark) | 3.11:1 | **5.52:1** | fill stays the spec `#16A765`; the label swaps to near-black green `#052014` |
| "AI" in the wordmark | 3.88:1 | **5.25:1** | `text-brand-600` → `text-brand-700` |
| Muted captions on the canvas | 4.35:1 | **5.02:1** | `--ink-500` `#687680` → `#626F79` |
| Required-field marker, destructive hovers | 4.23:1 | **5.84:1** | `text-danger` → `text-danger-strong` for TEXT (the `#E53935` token remains the fill/border colour) |
| Input placeholders | 2.70:1 | **5.40:1** | `placeholder:text-ink-400` → `placeholder:text-ink-500` |
| Leaflet attribution | 4.48:1 | **4.92:1** | inherited from the `ink-500` change |

`#16A765` is unchanged as the brand green: it is `brand-500`, and it is what
map pins, icons, borders, tints, focus rings and the dark-mode fill use — all
non-text or large-text roles where the applicable bar is 3:1.

### 3.3 Layout

* **Phantom 22 px of horizontal overflow at 320 px.** The compact favourites
  toggle used an `sr-only` `<span>`; an absolutely-positioned box inside a
  horizontally-scrolled rail is laid out against the page, so
  `documentElement.scrollWidth` measured 342 on a 320 px screen. Replaced with
  `aria-label` (same information to assistive tech, no box).
* **Map not dominant on short phones.** At 320×640 the chrome (231 px of
  44 px touch targets) exceeded the visible map (200 px). Rather than shrink
  touch targets below the accessible minimum, a `shorty:` height breakpoint
  (≤700 px) gives the map ~8 % back by collapsing the sheet to 34 % and
  tightening the control stack. Result: 236 px of map (37 %) vs 219 px chrome.

### 3.4 Cleanup

Dead imports (`MessageSquare`, `Button`, `SHEET_SNAP_PERCENT` in `page.tsx`),
a dead constant (`QUICK_FUELS`), an unused type (`QueryValue`) and two unused
mutation parameters removed. `tsc --noUnusedLocals --noUnusedParameters` is
clean for application code.

---

## 4. Verified, not changed

* Directions still open the real Google Maps URL built from the station's own
  coordinates (asserted in the browser: `…/maps/dir/?api=1&destination=10.5207…`).
* Report Price still posts one multipart request; the photo input keeps
  `accept="image/jpeg,image/png,image/webp"`, the preview/remove controls and
  the "submit only via the Submit button" state machine.
* Account data is the authenticated user's (greeting, email, verified badge);
  Sign Out stays destructive red (`#C12825` on the danger tint).
* Theme choice persists across reloads in both directions, with the
  pre-hydration script still preventing a flash.
* Loading, empty, API-error and location-denied states all render inside the
  design system, keep the map mounted, and always offer a way forward.
* Groq: `openai/gpt-oss-20b` and the AI backend are untouched.

---

## 5. Known issues / intentional exceptions

1. **`#16A765` + white is 3.11:1.** Kept as a non-text brand colour only (see
   3.2). Any surface that puts white text on green uses `--action`.
2. **Station Services and Opening Hours** remain conditional: the API does not
   return `services` / `opening_hours` / `is_open_now`, and this app does not
   invent station facts. The UI lights up the day the backend serves them.
3. **`Completions.create() got an unexpected keyword argument 'max_retries'`**
   is a *backend* issue and is already fixed and guarded there —
   `max_retries` is set on the Groq **client constructor**
   (`backend/app/services/ai/provider.py`, documented in its module docstring,
   with `AI_MAX_RETRIES` in config and regression tests). Nothing in this pass
   touched it, and the current Groq model migration is intact
   (`GROQ_MODEL = "openai/gpt-oss-20b"`, pinned by
   `backend/tests/test_gpt_oss_model.py`).
4. **Map tiles are raster OSM.** In dark mode they are filtered
   (`--map-tile-filter`); a native dark tile provider would look better but is
   an infrastructure decision, not a UI one.
5. The audit harness bypasses the service worker. The SW's own behaviour
   (network-first navigations, never caching `/nearby`) is covered by its
   documented strategy, not by this pass.
