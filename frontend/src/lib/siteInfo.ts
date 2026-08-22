/**
 * Single source of truth for the product's "about the maker" facts.
 *
 * The footer and the About page both present the creator, the portfolio and
 * the stack. Keeping the data here means the two surfaces can never drift
 * apart, and a contact detail is corrected in exactly one place.
 */

export const CREATOR = {
  name: "Abdulwahab Abdulyekeen",
  role: "Product engineer · Full-stack developer",
  email: "bynarytech1@gmail.com",
  phone: "09044115526",
  /** Stored without the scheme so it can be shown as a clean label. */
  linkedinLabel: "linkedin.com/in/abdulwahab-abdulyekeen-8370363a8",
  linkedinUrl: "https://www.linkedin.com/in/abdulwahab-abdulyekeen-8370363a8",
} as const;

/** `tel:` needs the international form; the label stays local and familiar. */
export const CREATOR_TEL_HREF = "tel:+2349044115526";

export interface PortfolioProject {
  name: string;
  tagline: string;
  description: string;
  /**
   * What the project is being cited FOR. JobLiberty appears strictly as a
   * UI/UX craft reference — it is not affiliated with, and must not be
   * branded into, FuelFinder AI.
   */
  note: string;
}

export const PORTFOLIO: readonly PortfolioProject[] = [
  {
    name: "JobLiberty",
    tagline: "Product design & UI/UX reference",
    description:
      "A jobs platform whose interface work informed the design language here: clear hierarchy, restrained colour and interfaces that stay legible on low-end phones.",
    note: "Referenced for UI/UX craft only — a separate product, not part of FuelFinder AI.",
  },
  {
    name: "MammoGuard",
    tagline: "Breast cancer prediction application",
    description:
      "A machine-learning application that supports earlier breast cancer risk assessment, pairing a predictive model with an interface clinicians and patients can actually read.",
    note: "Applied ML with an emphasis on explaining a prediction rather than just returning one.",
  },
] as const;

export interface TechItem {
  name: string;
  role: string;
}

/** The stack, grouped the way an engineer would actually explain it. */
export const TECH_STACK: readonly { group: string; items: readonly TechItem[] }[] = [
  {
    group: "Frontend",
    items: [
      { name: "Next.js 15", role: "App Router, React 19" },
      { name: "TypeScript", role: "End-to-end typing" },
      { name: "Tailwind CSS", role: "Design tokens" },
      { name: "Leaflet", role: "Interactive mapping" },
    ],
  },
  {
    group: "Backend",
    items: [
      { name: "FastAPI", role: "Python API layer" },
      { name: "PostgreSQL + PostGIS", role: "Geospatial queries" },
      { name: "Supabase", role: "Auth, storage, realtime" },
      { name: "SQLAlchemy", role: "Data access & migrations" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { name: "GPT-OSS 20B", role: "Natural-language reasoning" },
      { name: "Deterministic ranking", role: "Prices stay factual" },
      { name: "AI report scoring", role: "Fraud & anomaly checks" },
    ],
  },
] as const;

/**
 * Footer navigation.
 *
 * Every href here resolves to a real destination: the finder, or a section
 * that actually exists on the About page. No decorative links that look
 * clickable and then do nothing.
 */
export const FOOTER_NAV: readonly {
  group: string;
  links: readonly { label: string; href: string }[];
}[] = [
  {
    group: "Product",
    links: [
      { label: "Find fuel near me", href: "/" },
      { label: "How it works", href: "/about#how-it-works" },
      { label: "Fuel Intelligence", href: "/about#fuel-intelligence" },
      { label: "Community reports", href: "/about#data-trust" },
    ],
  },
  {
    group: "Project",
    links: [
      { label: "About", href: "/about" },
      { label: "Data & trust", href: "/about#data-trust" },
      { label: "Built for Nigeria", href: "/about#built-for-nigeria" },
      { label: "Technology", href: "/about#technology" },
    ],
  },
] as const;
