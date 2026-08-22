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

/**
 * Map a 0..1 score to design-system badge classes.
 *
 * Tokens only — the same success/warning/danger tones the rest of the product
 * uses for status, so an AI confidence pill reads consistently everywhere.
 */
export function confidenceColor(score: number | null | undefined): string {
  const label = confidenceLabel(score);
  if (label === "High") return "bg-success-soft text-success-strong";
  if (label === "Medium") return "bg-warning-soft text-warning-strong";
  return "bg-danger-soft text-danger-strong";
}

/** Format a 0..1 score as a percentage for display, e.g. 0.87 → "87%". */
export function formatConfidencePercent(score: number | null | undefined): string | null {
  if (score == null || Number.isNaN(score)) return null;
  return `${Math.round(score * 100)}%`;
}
