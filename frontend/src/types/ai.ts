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

/**
 * Which Groq responsibility answered the message:
 * - "recommendation": a station search ran (intent -> nearby -> ranking).
 * - "conversation":   a general question Groq answered directly; no station
 *   data and no location involved.
 */
export type AIAnswerMode = "recommendation" | "conversation";

/** Who produced a part of the answer. "not_applicable" = the step didn't run. */
export type AISource = "groq" | "fallback" | "not_applicable";

export interface AIRecommendResponse {
  query: string;
  /** Optional for backwards compatibility with an older backend build. */
  mode?: AIAnswerMode;
  intent: FuelSearchIntent | null;
  intent_source: AISource;
  answer_source: AISource;
  needs_location: boolean;
  recommendations: AIRecommendation[];
  answer: string;
}

export interface AIRecommendRequest {
  query: string;
  /** Omitted for a conversational question — the app never invents a position. */
  latitude?: number;
  longitude?: number;
}

/** Response of `POST /api/v1/ai/chat` (conversational Groq). */
export interface AIChatResponse {
  message: string;
  answer: string;
  answer_source: AISource;
  mode: "conversation" | "search";
  model: string;
}
