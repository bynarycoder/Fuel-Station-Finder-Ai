/**
 * AI confidence score presentation helpers (Phase 10).
 *
 * Uses the ACTUAL backend score (0..1 from the Gemini verification endpoint);
 * never fabricated. Labels:
 *   0.90–1.00 → High
 *   0.70–0.89 → Medium
 *   below 0.70 → Low
 */

export type ConfidenceLabel = "High" | "Medium" | "Low";

export const CONFIDENCE_HIGH_THRESHOLD = 0.9;
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.7;

/** Map a 0..1 score to its display label. */
export function confidenceLabel(score: number | null | undefined): ConfidenceLabel | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= CONFIDENCE_HIGH_THRESHOLD) return "High";
  if (score >= CONFIDENCE_MEDIUM_THRESHOLD) return "Medium";
  return "Low";
}

/** Map a 0..1 score to a Tailwind badge colour class. */
export function confidenceColor(score: number | null | undefined): string {
  const label = confidenceLabel(score);
  if (label === "High") return "bg-emerald-100 text-emerald-700";
  if (label === "Medium") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

/** Format a 0..1 score as a percentage for display, e.g. 0.87 → "87%". */
export function formatConfidencePercent(score: number | null | undefined): string | null {
  if (score == null || Number.isNaN(score)) return null;
  return `${Math.round(score * 100)}%`;
}
