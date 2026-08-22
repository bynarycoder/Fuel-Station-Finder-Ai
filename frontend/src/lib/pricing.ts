/**
 * Pure price-validation helper for the report form (Naira per litre).
 * Centralised so the rules are explicit and easily testable.
 */

export const MAX_PRICE_NAIRA = 100_000;

export type PriceValidation =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validate a user-entered price string.
 * Accepts whole or 2-decimal Naira amounts (e.g. `650`, `650.5`, `650.50`).
 * Rejects empty, non-numeric, negative, zero, and out-of-range values.
 */
export function validatePrice(raw: string): PriceValidation {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Price is required." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: "Enter a valid amount in Naira (e.g. 650 or 650.50).",
    };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Price must be greater than zero." };
  }
  if (value > MAX_PRICE_NAIRA) {
    return {
      ok: false,
      error: `Price must be at most ₦${MAX_PRICE_NAIRA.toLocaleString()}/L.`,
    };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}
