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
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf6",
          100: "#d1fae9",
          200: "#a6f4d5",
          300: "#6ee7bd",
          400: "#34d3a0",
          500: "#12b886",
          600: "#059669",
          700: "#04795a",
          800: "#065f49",
          900: "#0a4d3c",
          950: "#022c22",
        },
        accent: {
          50: "#fffaeb",
          100: "#fef0c7",
          200: "#fedf89",
          300: "#fec84b",
          400: "#fdb022",
          500: "#f79009",
          600: "#dc6803",
          700: "#b54708",
          800: "#93370d",
          900: "#7a2e0e",
        },
        ink: {
          50: "#f8fafb",
          100: "#f1f4f6",
          200: "#e4e9ed",
          300: "#cfd7dd",
          // 400/500 are darkened past the naive "grey" values so muted body
          // copy and placeholders still clear WCAG AA (4.5:1) on BOTH the
          // canvas (#f6f8f9) and surface (#ffffff) backgrounds.
          400: "#7c8994",
          500: "#606e78",
          600: "#4d5b66",
          700: "#37434d",
          800: "#232d35",
          900: "#141b21",
        },
        success: {
          soft: "#ecfdf3",
          border: "#a6f4c5",
          DEFAULT: "#039855",
          strong: "#027a48",
        },
        warning: {
          soft: "#fffaeb",
          border: "#fedf89",
          DEFAULT: "#dc6803",
          strong: "#b54708",
        },
        danger: {
          soft: "#fef3f2",
          border: "#fecdca",
          DEFAULT: "#d92d20",
          strong: "#b42318",
        },
        info: {
          soft: "#eff8ff",
          border: "#b2ddff",
          DEFAULT: "#175cd3",
          strong: "#1849a9",
        },
        /** Semantic surfaces (light product; no dark mode in scope). */
        canvas: "#f6f8f9",
        surface: "#ffffff",
        elevated: "#ffffff",
        hairline: "#e4e9ed",
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
        "brand-sheen":
          "linear-gradient(135deg, #04795a 0%, #065f49 45%, #0a4d3c 100%)",
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
