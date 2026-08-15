/**
 * Frontend types for the Fuel Intelligence AI recommendation API
 * (mirrors the backend Pydantic schemas in ``backend/app/schemas/ai.py``).
 *
 * Honesty contract, mirrored from the backend:
 * - ``station`` is the untouched public station object (provenance included);
 *   the AI never modifies it.
 * - ``latest_price`` is the latest *reported* price fact, or ``null`` when no
 *   report exists — the UI must say so rather than inventing a price.
 * - ``intent_source`` / ``answer_source`` say whether Groq actually produced
 *   that part ("groq") or the deterministic fallback did ("fallback").
 */

import type { StationWithDistance } from "@/types/station";

/** Structured search parameters extracted from the user's query. */
export interface FuelSearchIntent {
  fuel_type: string | null;
  max_price: number | null;
  min_price: number | null;
  sort_preference: "distance" | "price" | "best_overall" | "reliability" | null;
  require_verified: boolean;
  radius_meters: number | null;
}

/** Deterministic score components behind a recommendation (0..1 each). */
export interface ScoreBreakdown {
  distance: number;
  price: number;
  verification: number;
  freshness: number;
  availability: number;
}

export interface AIRecommendation {
  station: StationWithDistance;
  score: number;
  reason: string;
  latest_price: number | null;
  latest_price_fuel_type: string | null;
  latest_price_reported_at: string | null;
  breakdown: ScoreBreakdown;
}

export interface AIRecommendResponse {
  query: string;
  intent: FuelSearchIntent | null;
  intent_source: "groq" | "fallback";
  answer_source: "groq" | "fallback";
  needs_location: boolean;
  recommendations: AIRecommendation[];
  answer: string;
}

export interface AIRecommendRequest {
  query: string;
  latitude: number;
  longitude: number;
}
