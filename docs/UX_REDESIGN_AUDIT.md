# Fuel Station Finder AI — UX/UI Audit & Redesign Plan

Audit performed against the actual codebase (`frontend/src`) before any code
was changed. Every problem below was observed in real source, not assumed.

## A. What already works (must be preserved)

| Area | Where | Note |
| --- | --- | --- |
| Geolocation state machine | `lib/geo.ts`, `lib/geolocator.ts`, `store/useMapStore.ts` | Single location owner, single watcher, last-known-position never erased. **Untouched by this redesign.** |
| Provenance model | `types/station.ts`, `components/stations/StationProvenanceBadge.tsx` | `data_source` and `verification_status` are separate fields with separate labels. Kept separate. |
| Nearby correctness | `hooks/useStations.ts` | Placeholder-data guard, Haversine fallback, defensive re-sort. Kept. |
| AI honesty contract | `components/ai/FuelIntelligence.tsx`, `types/ai.ts` | Never invents price/location; labels fallback answers. Kept. |
| Test suite | 16 files / 167 tests | All accessible names and `data-testid`s relied on by tests were preserved verbatim. |

## B. UX problems found

### 1. No design system at all
`tailwind.config.ts` extended only two background gradients. Every screen
hand-picked raw Tailwind palette values (`emerald-700`, `amber-500`,
`gray-300`…). `globals.css` still contained the Next.js starter
`--foreground-rgb` gradient body. There were no tokens for radius, shadow,
type scale, motion or elevation, so nothing was reusable and nothing was
consistent.

**Solution:** a real token layer — brand/accent/ink/status color scales,
semantic surface tokens, an 8-step type scale, radius scale, three-level
elevation scale, motion tokens, all in `tailwind.config.ts` + `globals.css`.

### 2. The primary task is invisible on first load
The home page opened with a dark green header full of six competing buttons
(Fuel AI, Live reports, Admin, Sign in, Create Account, About), then a 4-input
filter card, then a list and map. Nothing said *"find fuel near you"*, and
"Near me" — the single most important action — was a small secondary button in
the middle of a flex-wrap row.

**Solution:** a hero finder surface: one sentence of intent, one unified
search field, and "Near me" as the visually dominant action.

### 3. Header overload / low-value chrome
Seven interactive elements in the header on mobile, wrapping onto three rows at
360 px, pushing the map below the fold. `Flame` icon used `animate-pulse`
permanently (motion with no meaning, no reduced-motion guard).

**Solution:** compact header (brand + account), secondary destinations moved to
a mobile bottom nav and a desktop rail. Meaningless animation removed.

### 4. Four separate search interfaces
`q`, `brand`, `city` text inputs + fuel chips + a *separate* AI question box,
plus recent-search chips. Users had to know which box to type in.

**Solution:** one `SearchBar`. Plain text still searches name/brand/city; a
natural-language query ("cheapest petrol near me") is detected and routed to
Fuel Intelligence. Brand/city remain available inside the filter sheet.

### 5. Filters were a wall of controls
A 509-line component rendering inputs, selects, chips, banners and prompts in
one always-expanded card that consumed ~45% of a 360×800 viewport before any
station was visible. No summary of what was actually filtered.

**Solution:** quick chips (Near me / Petrol / Diesel / CNG) inline, everything
else in a bottom-sheet filter panel, with removable active-filter chips.

### 6. Station cards had weak hierarchy and a dead action
Name, address, provenance, distance pill, fuel codes, a Directions link and the
text *"Click to focus"* all rendered at 10–12 px with near-equal weight. Price —
the single most decision-relevant fact — appeared **only** on the "Closest to
you" card. The list row was a `<button>` containing another `role="button"`
(favorite) and an `<a>` — invalid nesting and a keyboard trap.

**Solution:** one `StationCard` answering What / Where / What fuel / How much /
Can I trust it / Is it current, in that visual order, with a proper card
container (`<article>`) and separate, correctly-labelled controls.

### 7. Prices were fetched per-card, only for one card
`ClosestCard` called `useStationReports` on its own; nothing else showed price.

**Solution:** `useStationPrices` — a small shared hook so every visible card can
show its latest reported price from the *existing* reports endpoint, with a
skeleton while loading and an honest "No recent price" empty state.

### 8. Map fought the UI
On mobile the map was a fixed `55vh` block *below* the filter card; on desktop
it sat inside a padded grid cell. Markers were near-identical amber/green SVG
pins with emoji glyphs (⛽/👑) that render inconsistently across Android. The
only control was a text button labelled "Recenter on Me" bottom-right. Popups
duplicated the whole station card inside Leaflet.

**Solution:** map as a full-bleed surface; compact floating control stack
(locate / zoom in / zoom out); redesigned markers with real state
differentiation (available, unavailable, verified, selected, nearest, user);
popups reduced to a name + distance teaser that opens the real detail sheet.

### 9. No mobile pattern for the map
There was no bottom sheet. The list simply appeared under the map, so on a
390 px screen the user scrolled between two competing scroll areas.

**Solution:** `StationBottomSheet` with three snap points (peek / half / full),
drag + keyboard operable, so map and list share the screen.

### 10. AI looked bolted on
A gradient panel toggled by a header button, with a chat-style input, an
"Ask Fuel AI" button, four example chips and a 4-column score bar grid at 10 px.

**Solution:** Fuel Intelligence is now a first-class surface reachable from the
search bar and bottom nav, answering with a designed recommendation card
(price → distance → availability → *Why this station?*), keeping the exact same
API, honesty rules and test hooks.

### 11. Report flow was one long form
Six stacked fields in a modal, submit at the bottom, no reassurance, no
progress, generic success text.

**Solution:** a 3-step flow (Fuel & price → Conditions → Evidence & submit) with
progress, smart defaults from the station's own fuel types, a value-reminder
line, and a designed success state.

### 12. Loading / empty / error states were generic
Five grey rounded rectangles for the list, `Loader2` spinners everywhere else,
"Loading map…" plain text, error copy exposing "the backend may be waking up".

**Solution:** shared `LoadingSkeleton` (card-shaped), `EmptyState` and
`ErrorState` primitives with an action on every one; map has a designed
loading surface; AI has an intentional processing animation.

### 13. Accessibility gaps
Nested interactive elements in list rows; 24–28 px touch targets on the favorite
and close buttons; `title`-only tooltips carrying essential provenance meaning;
status conveyed by colour alone on the fuel pills; no `prefers-reduced-motion`
handling; no skip link; focus rings inconsistent (`ring-emerald-500` in Button,
nothing elsewhere).

**Solution:** 44 px minimum targets, one global focus-visible treatment,
icon + text for every status, `prefers-reduced-motion` honoured globally, skip
link, `aria-live` on result counts, semantic landmarks.

## C. Non-goals (explicitly not touched)

Backend, Supabase, PostGIS, API client contracts, Zustand location lifecycle,
station types, existing tests, provenance semantics.

---

# Implementation record

## Design system (`tailwind.config.ts` + `app/globals.css`)

| Token group | What was added |
| --- | --- |
| Colour | `brand` (deep petrol green, 50–950), `accent` (harmattan amber, 50–900), `ink` (warm neutral ramp, 50–900), semantic `success` / `warning` / `danger` / `info` each with `soft`/`border`/`DEFAULT`/`strong`, plus surface aliases `canvas` / `surface` / `elevated` / `hairline`. |
| Type | 8-step scale: `display`, `h1`, `h2`, `h3`, `body`, `body-sm`, `caption`, `label`, each with its own line-height, tracking and weight. Native system font stack (`--font-sans`) — no webfont round-trip on metered mobile data. |
| Spacing | 4 px grid plus named steps `gutter`, `gutter-lg`, `touch` (44 px), `sheet`. |
| Radius | `sm` `md` `lg` `xl` `2xl` `pill` — deliberately not "everything is a pill". |
| Elevation | Exactly three levels `e1` `e2` `e3` + `focus`. No glow, no glassmorphism. |
| Motion | `fast`/`base`/`slow` durations, `entrance`/`exit` easings, and 8 named keyframes. Globally disabled under `prefers-reduced-motion`. |
| Variants | Custom `pointer-coarse:` / `pointer-fine:` so compact desktop controls still get a 44 px hit area on touch. |

Result: **zero raw Tailwind palette values (`gray-*`, `emerald-*`, …) remain in
`src/`** — verified by grep.

## Contrast

All text pairs were computed against WCAG. `ink-500` was darkened from
`#6b7a86` to `#606e78` (4.42 → 4.93 on canvas) and every `ink-400` used for
*text* was promoted to `ink-500`; `ink-400` is now reserved for icons and
placeholders. Every text/background pair in the product now clears AA 4.5:1.

## Components

**New:** `Badge`, `states.tsx` (`Skeleton`, `StationCardSkeleton`,
`LoadingSkeleton`, `ThinkingDots`, `EmptyState`, `ErrorState`), `Sheet.tsx`
(`Modal`, `SidePanel`, `BottomSheet`, `DialogHeader`), `SearchBar`, `AppHeader`,
`MobileBottomNav`, `StationCard`, `facts.tsx` (`PriceDisplay`,
`FuelAvailabilityBadge`, `DistanceDisplay`, `FreshnessLine`),
`LocationStatusBanner`, `LocationPrimer`, `MapControls`, `useStationPrices`,
`useMediaQuery`, `lib/stationSummary.ts`, `lib/stationName.ts`.

**Rebuilt:** `button.tsx`, `StationList`, `StationFilters`, `StationDetail`,
`ReportPriceForm`, `ReportsFeed`, `MyReports`, `FuelIntelligence`, `MapView`,
`StationMap`, `icons.ts`, `StationProvenanceBadge`, `app/page.tsx`,
`app/layout.tsx`, `app/about`, `app/admin`, `app/offline`, `SignInModal`,
`OfflineBanner`, `lib/confidence.ts`.

## Bugs found and fixed during the redesign

1. **"A.A. Rano A.A. Rano"** — brand was rendered as a prefix even when the
   name already began with it (common in OSM imports). Fixed with
   `lib/stationName.ts` + 7 tests, applied at all 8 render sites.
2. **Nested interactive elements** — list rows were a `<button>` containing a
   `role="button"` favourite and an `<a>`. Invalid HTML and a keyboard trap;
   the new card makes them siblings.
3. **Duplicate AI dialog** — a question typed on desktop opened both the inline
   panel and the mobile sheet (hidden by `lg:hidden`, but still a mounted
   dialog with its own focus trap). Resolved with `useMediaQuery`.
4. **Sub-44 px touch targets** on card actions, chips and the search clear
   button. Fixed at the primitive level with the `pointer-coarse:` variant.
5. **No focus management** in the old overlay helpers — Escape did nothing,
   Tab escaped the dialog, focus never returned to the trigger.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **217 passed / 21 files** (was 167 / 16 — 50 added, 0 removed) |
| `npx tsc --noEmit` | clean |
| `npm run lint` | no warnings or errors |
| `npm run build` | success — home 36.1 kB / 227 kB First Load JS |
| Routes | `/`, `/about`, `/admin`, `/offline` all HTTP 200 |
| Design tokens in prod CSS | all verified present |

Note: browser binaries cannot be downloaded in this sandbox, so responsive
verification was done against rendered HTML, the compiled CSS breakpoints and
the live preview rather than automated screenshots.
