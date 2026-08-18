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
| Primary green | `brand-500` | `#16A765` |
| Solid action fill | `action` | `#0D7C4A` (brand-700) |
| Dark green | `brand-900` / `slab` | `#075E3D` |
| Action orange | `accent-400` | `#F7931E` |
| Background | `canvas` | `#F5F7F8` |
| Surface | `surface` | `#FFFFFF` |
| Primary text | `ink-900` | `#15212B` |
| Muted text | `ink-500` | `#626F79` |
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
| On-primary label | `action-fg` | `#052014` |
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

### Accessibility rules

`#16A765` is the brand green and stays exactly that — `brand-500`, used by map
pins, icons, borders, tints and focus rings, all roles whose bar is 3:1. It is
**not** used behind white text: that pair is only 3.11:1.

| Job | Token | Ratio |
| --- | --- | --- |
| Filled control + white label (light) | `action` `#0D7C4A` | 5.25:1 |
| Filled control + dark label (dark) | `action` `#16A765` on `action-fg` `#052014` | 5.52:1 |
| Green TEXT (prices, links) | `brand-700` | 5.25:1 light · 9.08:1 dark |
| Muted text | `ink-500` `#626F79` | ≥4.5:1 on canvas, surface and `ink-50` |
| Error TEXT | `danger-strong` | 5.84:1 (the `#E53935` `danger` token is a fill/border colour) |
| Placeholders | `ink-500` | 5.40:1 — never `ink-400` |

Every rule above is enforced twice: `src/app/design-tokens.test.ts` computes
the ratios from the tokens in CI, and `scripts/ui-audit.mjs` walks every
rendered text node in a real browser, in both themes.

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
Header (48 px on mobile / 56 px on ≥sm)
MAP  ← owns the remaining viewport (~65–75 %+); search/chips overlay it
  ├── overlay: compact search (48 px) + fuel chips (≤60 px)
  ├── floating left:  Near me / Browse all   (left: 16px, bottom: 120px)
  ├── floating right: + / − / Locate me      (right: 16px, bottom: 120px)
  └── station bottom sheet, collapsed 80–120 px
      (half / full still 52 % / 92 % — only when the user drags)
Bottom navigation (64 px + safe area) — Map · Stations · AI · Report · Account
```

Peek height lives in `SHEET_PEEK_PX` (`components/ui/Sheet.tsx`); half/full
snaps stay in `SHEET_SNAP_PERCENT`. The map's floating controls are lifted by
the matching offset so zoom/locate/Near me are never buried.
`page.map-first.test.tsx` locks the order, the overlay relationship and the
offsets. Browse all / See all open the stations screen instead of expanding
the sheet.

## 8. Tooling trap: `cn()` and the custom type scale

`tailwind-merge` only recognises Tailwind's own font-size names; anything else
after `text-` is assumed to be a colour. Because this project ships a custom
scale (`text-h3`, `text-body-sm`, …), `cn("text-slab-fg", "text-body-sm")` used
to drop the colour entirely and every sized button rendered with inherited ink.
`src/lib/utils.ts` therefore extends tailwind-merge with the scale. If you add
a font-size token, add it there too — and to `src/lib/utils.test.ts`.

## 9. Rules

1. No raw hex in components. The exceptions are surfaces rendered outside React
   (Leaflet marker SVG strings in `components/map/icons.ts`, the sparkline
   stroke) and the fixed near-black label on the orange button.
2. No second filtering system: fuel chips, the filter sheet and the nearby
   query all read/write `useMapStore().filters`.
3. Never invent station data. Sections such as Services and Opening hours are
   rendered only when the API actually returns them.
4. Nothing may make the page scroll horizontally; rails scroll, the page does
   not. Beware `sr-only` inside a scroll rail: it is absolutely positioned
   against the page and silently widens the document — use `aria-label`.
5. Text colour is a token decision, not a per-component one. Run
   `node scripts/ui-audit.mjs` (see `docs/UI_QA_AUDIT.md`) before changing any
   colour that carries text.
