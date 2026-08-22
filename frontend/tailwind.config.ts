import plugin from "tailwindcss/plugin";
import type { Config } from "tailwindcss";

/**
 * Fuel Station Finder — design tokens.
 *
 * ONE source of truth for colour, type, spacing, radius, elevation and motion.
 * Screens must compose these tokens instead of reaching for raw palette values
 * (`emerald-700`, `gray-300`, …), which is what previously made every surface
 * look like a different product.
 *
 * Identity: Fuel + Navigation + Trust + Intelligence.
 * - `brand`  — deep petrol green. Nigerian, confident, reads as "go / fuel".
 * - `accent` — warm harmattan amber. Energy and mobility; used sparingly for
 *   the single most important action on a surface.
 * - `ink`    — slightly warm neutral ramp for text, borders and surfaces.
 * - status   — success / warning / danger / info, each with a tint + a solid.
 */
/**
 * Every colour below resolves through a CSS custom property holding SPACE-
 * SEPARATED RGB CHANNELS (e.g. `--brand-700: 4 121 90`). That form is what
 * lets Tailwind keep composing opacity modifiers (`bg-ink-900/45`,
 * `ring-brand-500/20`) while the *value* is swapped at runtime by the theme.
 *
 * Consequence: `.dark` in globals.css re-points these variables and the ~130
 * existing token usages across the product become dark-mode aware without a
 * single `dark:` class being added to them. The `ink` ramp deliberately
 * INVERTS in dark mode (ink-900 becomes near-white), so `text-ink-900` keeps
 * meaning "highest-contrast body text" in both themes.
 */
const channel = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  /** Theme is driven by a `.dark` class on <html> (set by ThemeProvider). */
  darkMode: "class",
  theme: {
    extend: {
      /**
       * `shorty:` — a HEIGHT breakpoint, not a width one.
       *
       * On a 320x640 phone the chrome (header + overlay search/chips/actions)
       * plus a collapsed sheet used to leave the map with less room than its
       * own controls. Rather than shrink touch targets below the accessible
       * minimum, short viewports get a smaller collapsed sheet and tighter
       * overlay spacing so the map stays dominant.
       */
      screens: {
        shorty: { raw: "(max-height: 700px)" },
      },
      colors: {
        brand: {
          50: channel("brand-50"),
          100: channel("brand-100"),
          200: channel("brand-200"),
          300: channel("brand-300"),
          400: channel("brand-400"),
          500: channel("brand-500"),
          600: channel("brand-600"),
          700: channel("brand-700"),
          800: channel("brand-800"),
          900: channel("brand-900"),
          950: channel("brand-950"),
        },
        accent: {
          50: channel("accent-50"),
          100: channel("accent-100"),
          200: channel("accent-200"),
          300: channel("accent-300"),
          400: channel("accent-400"),
          500: channel("accent-500"),
          600: channel("accent-600"),
          700: channel("accent-700"),
          800: channel("accent-800"),
          900: channel("accent-900"),
        },
        ink: {
          50: channel("ink-50"),
          100: channel("ink-100"),
          200: channel("ink-200"),
          300: channel("ink-300"),
          400: channel("ink-400"),
          500: channel("ink-500"),
          600: channel("ink-600"),
          700: channel("ink-700"),
          800: channel("ink-800"),
          900: channel("ink-900"),
        },
        success: {
          soft: channel("success-soft"),
          border: channel("success-border"),
          DEFAULT: channel("success"),
          strong: channel("success-strong"),
        },
        warning: {
          soft: channel("warning-soft"),
          border: channel("warning-border"),
          DEFAULT: channel("warning"),
          strong: channel("warning-strong"),
        },
        danger: {
          soft: channel("danger-soft"),
          border: channel("danger-border"),
          DEFAULT: channel("danger"),
          strong: channel("danger-strong"),
        },
        info: {
          soft: channel("info-soft"),
          border: channel("info-border"),
          DEFAULT: channel("info"),
          strong: channel("info-strong"),
        },
        /**
         * ROLE TOKENS — these exist because a single ramp cannot serve two
         * opposite jobs in dark mode.
         *
         * `text-brand-700` must become LIGHT on a dark surface, while
         * `bg-brand-700 + white text` must stay DARK. Inverting the ramp fixes
         * the first and breaks the second. So the two roles are split:
         *
         *  - `action` / `action-fg`  a SOLID brand fill and the text on it.
         *    Follows the Material-style primary/on-primary swap: a deep green
         *    with white text in light mode, a vivid mint with near-black green
         *    text in dark mode. Both clear AA.
         *  - `slab` / `slab-fg` / `slab-muted`  a deliberately ALWAYS-DARK
         *    brand surface (account header, footer, marketing hero). It is
         *    dark green in both themes by design, so its foregrounds are
         *    fixed too and never invert out from under it.
         */
        action: {
          DEFAULT: channel("action"),
          hover: channel("action-hover"),
          fg: channel("action-fg"),
        },
        slab: {
          DEFAULT: channel("slab"),
          fg: channel("slab-fg"),
          muted: channel("slab-muted"),
        },
        /** Semantic surfaces — themed. */
        canvas: channel("canvas"),
        surface: channel("surface"),
        elevated: channel("elevated"),
        hairline: channel("hairline"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      /**
       * Type scale — the spec's ladder, mobile-first:
       *   H1 24/700 · H2 20/700 · H3 18/700 · Body 16/400 · Body-sm 14/400
       *   Caption 12/500
       * Hierarchy comes from weight + colour + spacing, never from making
       * everything bold.
       */
      fontSize: {
        display: ["1.75rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        h1: ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.015em", fontWeight: "700" }],
        h2: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em", fontWeight: "700" }],
        h3: ["1.125rem", { lineHeight: "1.5rem", letterSpacing: "-0.005em", fontWeight: "700" }],
        body: ["1rem", { lineHeight: "1.5rem", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }],
        caption: ["0.75rem", { lineHeight: "1rem", fontWeight: "500" }],
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em", fontWeight: "600" }],
      },
      spacing: {
        /** Named steps on a 4 px grid, for layout rhythm. */
        gutter: "1rem",
        "gutter-lg": "1.5rem",
        touch: "2.75rem", // 44 px minimum touch target
        sheet: "4rem", // mobile bottom-nav height (safe-area added in CSS)
      },
      /** Radius scale — 8 / 12 / 16 / 20 / 24 px, plus a pill for chips. */
      borderRadius: {
        sm: "0.5rem",   /*  8px */
        md: "0.75rem",  /* 12px — inputs, small controls */
        lg: "1rem",     /* 16px — cards, inputs */
        xl: "1.25rem",  /* 20px — panels */
        "2xl": "1.5rem", /* 24px — major panels, bottom sheet */
        pill: "9999px",
      },
      /** Restrained three-level elevation — premium UI is not glowy. */
      boxShadow: {
        /* Spec elevation: small / medium / large. Deliberately soft — dark
           mode leans on surface + border separation instead of black glow. */
        e1: "0 2px 8px rgb(0 0 0 / 0.05)",
        e2: "0 4px 12px rgb(0 0 0 / 0.08)",
        e3: "0 8px 24px rgb(0 0 0 / 0.12)",
        focus: "0 0 0 3px rgb(22 167 101 / 0.32)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        slow: "280ms",
      },
      transitionTimingFunction: {
        entrance: "cubic-bezier(0.16, 1, 0.3, 1)",
        exit: "cubic-bezier(0.4, 0, 1, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "sheet-in": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "panel-in": {
          from: { transform: "translateX(24px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "thinking": {
          "0%, 80%, 100%": { transform: "scaleY(0.5)", opacity: "0.5" },
          "40%": { transform: "scaleY(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-up": "slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "sheet-in": "sheet-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "panel-in": "panel-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        thinking: "thinking 1.2s ease-in-out infinite",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        /* Themed: the account header + AI banner follow the brand ramp, so
           they re-tone in dark mode instead of staying a light-mode slab. */
        /* Pinned to the always-dark `slab` role so it never inverts into a
           pale gradient with white text on top of it. */
        "brand-sheen":
          "linear-gradient(135deg, rgb(var(--action)) 0%, rgb(var(--slab)) 65%, rgb(var(--slab)) 100%)",
      },
      zIndex: {
        header: "60",
        map: "10",
        mapctl: "400",
        nav: "900",
        sheet: "1000",
        overlay: "2000",
        modal: "2100",
      },
    },
  },
  plugins: [
    /**
     * `pointer-coarse:` — styles that apply only on touch input.
     *
     * Lets a control keep a compact VISUAL box on a desktop rail while
     * guaranteeing a 44 px hit area on phones, instead of shipping one
     * oversized size everywhere or one too-small size everywhere.
     */
    plugin(({ addVariant }) => {
      addVariant("pointer-coarse", "@media (pointer: coarse)");
      addVariant("pointer-fine", "@media (pointer: fine)");
    }),
  ],
};
export default config;
