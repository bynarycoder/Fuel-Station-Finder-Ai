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
       * Type scale — mobile-first. Sizes stay modest so a heading never eats a
       * 360 px screen; hierarchy comes from weight + colour + spacing.
       */
      fontSize: {
        display: ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        h1: ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em", fontWeight: "700" }],
        h2: ["1.125rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em", fontWeight: "650" }],
        h3: ["1rem", { lineHeight: "1.375rem", letterSpacing: "-0.005em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.4375rem" }],
        "body-sm": ["0.875rem", { lineHeight: "1.3125rem" }],
        caption: ["0.8125rem", { lineHeight: "1.125rem" }],
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em", fontWeight: "600" }],
      },
      spacing: {
        /** Named steps on a 4 px grid, for layout rhythm. */
        gutter: "1rem",
        "gutter-lg": "1.5rem",
        touch: "2.75rem", // 44 px minimum touch target
        sheet: "4.5rem", // mobile bottom-nav height (safe-area added in CSS)
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1.125rem",
        "2xl": "1.5rem",
        pill: "9999px",
      },
      /** Restrained three-level elevation — premium UI is not glowy. */
      boxShadow: {
        e1: "0 1px 2px 0 rgb(20 27 33 / 0.05), 0 1px 3px 0 rgb(20 27 33 / 0.06)",
        e2: "0 2px 4px -1px rgb(20 27 33 / 0.06), 0 6px 16px -4px rgb(20 27 33 / 0.10)",
        e3: "0 8px 24px -6px rgb(20 27 33 / 0.14), 0 18px 48px -12px rgb(20 27 33 / 0.18)",
        focus: "0 0 0 3px rgb(5 150 105 / 0.32)",
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
