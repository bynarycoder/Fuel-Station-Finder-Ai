# FuelFinder AI — design system

One page, one source of truth. Every screen composes the tokens below; no
component hard-codes a colour, radius or shadow.

Where things live:

| Concern | File |
| --- | --- |
| Colour, in both themes | `frontend/src/app/globals.css` (`:root` / `.dark`) |
| Tailwind bindings (type, radius, elevation, motion, z-index) | `frontend/tailwind.config.ts` |
| Theme switching (light / dark / system, anti-flash) | `frontend/src/components/theme/ThemeProvider.tsx` |
| Contract tests | `frontend/src/app/design-tokens.test.ts` |

The colour tokens are **space-separated RGB channels** (`--brand-500: 22 167 101`)
so Tailwind can keep applying opacity modifiers (`bg-ink-900/45`) while the
*value* is swapped at runtime by the theme.

---

## 1. Colour

### Light

| Role | Token | Value |
| --- | --- | --- |
| Primary green | `brand-500` / `action` | `#16A765` |
| Dark green | `brand-900` / `slab` | `#075E3D` |
| Action orange | `accent-400` | `#F7931E` |
| Background | `canvas` | `#F5F7F8` |
| Surface | `surface` | `#FFFFFF` |
| Primary text | `ink-900` | `#15212B` |
| Muted text | `ink-500` | `#687680` |
| Border | `hairline` / `ink-200` | `#DCE4E8` |
| Success | `success` | `#16A765` |
| Error | `danger` | `#E53935` |

### Dark

Dark mode is **designed, not inverted**: deep navy surfaces, subtle borders
instead of heavy shadows, and the same recognisable green.

| Role | Token | Value |
| --- | --- | --- |
| Background | `canvas` | `#081522` |
| Surface | `surface` | `#0F1D28` |
| Secondary surface | `elevated` | `#132331` |
| Primary text | `ink-900` | `#F4F8FA` |
| Muted text | `ink-500` | `#A9B5BD` |
| Border | `hairline` / `ink-200` | `#253847` |
| Primary green | `brand-500` / `action` | `#16A765` |
| Dark green | `slab` | `#075E3D` |
| Orange | `accent-400` | `#F7931E` |

Two ramps deliberately **invert** in dark mode so that existing usages keep
their *meaning* rather than their *value*:

* `ink-*` — `ink-900` is always "highest-contrast text", `ink-50` always "the
  quietest fill". `text-ink-900` therefore themes itself.
* `brand-*` — `brand-500` stays `#16A765` in both themes, but the steps around
  it flip, so `text-brand-700` is a deep green on white and a light mint on
  navy.

Two roles are **pinned** and never invert:

* `action` / `action-fg` — the solid primary fill and its label.
* `slab` / `slab-fg` / `slab-muted` — the always-dark green surface used by the
  account header, the AI header and the "Browse all" action.

### Accessibility note

The specified primary green (`#16A765`) with white labels is a **3.1:1** pair.
That clears WCAG AA for UI components and large text, and it is what the design
calls for, so it is what ships — every label on it is ≥14 px semibold, and the
hover state deepens to `#0F8B54`. Anything smaller (e.g. the 9 px count badge
on the Map tab) uses the always-dark `slab` green instead, which is ~8:1.

---

## 2. Typography

| Style | Size / weight | Used for |
| --- | --- | --- |
| `text-display` | 28 / 700 | the one hero figure (a price) |
| `text-h1` | 24 / 700 | screen titles |
| `text-h2` | 20 / 700 | section titles |
| `text-h3` | 18 / 700 | station names, card titles |
| `text-body` | 16 / 400 | body copy, prices in cards |
| `text-body-sm` | 14 / 400 | dense rows, button labels |
| `text-caption` | 12 / 500 | distances, timestamps, supporting labels |
| `text-label` | 11 / 600 uppercase | eyebrow labels |

Weight, colour and spacing carry the hierarchy — not bolding everything.
Muted (`text-ink-500`) is the default for distances, freshness and secondary
station facts.

## 3. Spacing

An 8 px rhythm (`gap-2`, `p-3`/`p-4`, `space-y-2`…). Compact surfaces (the
mobile control stack, the bottom sheet header) step down to 12 px so the map
keeps the vertical space.

## 4. Radius

| Token | Value | Used for |
| --- | --- | --- |
| `rounded-sm` | 8 px | tiny chips, inline tags |
| `rounded-md` | 12 px | buttons, map controls, inner controls |
| `rounded-lg` | 16 px | inputs, cards, list rows |
| `rounded-xl` | 20 px | secondary panels |
| `rounded-2xl` | 24 px | major panels: bottom sheet, modals, AI panel |
| `rounded-pill` | ∞ | filter chips, badges, avatars |

## 5. Elevation

| Token | Value |
| --- | --- |
| `shadow-e1` | `0 2px 8px rgb(0 0 0 / 0.05)` |
| `shadow-e2` | `0 4px 12px rgb(0 0 0 / 0.08)` |
| `shadow-e3` | `0 8px 24px rgb(0 0 0 / 0.12)` |

Dark mode leans on `border-hairline` + surface steps rather than deeper
shadows.

## 6. Visual hierarchy

| Intent | Treatment | Example |
| --- | --- | --- |
| Primary | green fill (`Button variant="primary"`) | Get Directions, Submit Report, selected filter |
| Secondary | dark green (`variant="deep"`) | Browse all |
| Attention / proximity | orange (`variant="accent"`) | Near me, Allow location |
| Neutral | bordered surface (`variant="secondary"`) | Filters, Report a Price |
| Destructive | red | Sign out, errors |

## 7. Home layout contract

```
Header (56 px)
Search (48 px field)
Fuel filters (scrollable pill rail — All · Petrol · Diesel · LPG · CNG)
Compact actions (Near me · Browse all · locate · favourites · Filters)
MAP  ← owns the remaining viewport
  └── station bottom sheet, snapped at 42 % / 68 % / 92 % of the map
Bottom navigation (64 px + safe area)
```

Snap heights live in `SHEET_SNAP_PERCENT` (`components/ui/Sheet.tsx`); the map's
floating controls are lifted by the same percentages so zoom/locate is never
buried. `page.map-first.test.tsx` locks the order, the overlay relationship and
the offsets.

## 8. Rules

1. No raw hex in components. The exceptions are surfaces rendered outside React
   (Leaflet marker SVG strings in `components/map/icons.ts`, the sparkline
   stroke) and the fixed near-black label on the orange button.
2. No second filtering system: fuel chips, the filter sheet and the nearby
   query all read/write `useMapStore().filters`.
3. Never invent station data. Sections such as Services and Opening hours are
   rendered only when the API actually returns them.
4. Nothing may make the page scroll horizontally; rails scroll, the page does
   not.
