/**
 * The client-side AI routing pre-check must agree with the backend router
 * (`app/services/ai/chat.py`): station searches need a location, general
 * questions do not.
 */

import { describe, expect, it } from "vitest";

import { looksLikeStationSearch } from "@/lib/aiRouting";

describe("looksLikeStationSearch", () => {
  it.each([
    "Find the cheapest petrol near me",
    "Find the closest CNG station",
    "I need diesel under ₦1000",
    "Which nearby station is most reliable?",
    "cheapest petrol",
    "only verified petrol stations",
    "Where can I find cheap petrol?",
    "Find me a nearby station with cheap petrol.",
  ])("treats %j as a station search (location required)", (query) => {
    expect(looksLikeStationSearch(query)).toBe(true);
  });

  it.each([
    "Hello, what can you help me with?",
    "What can you help me with?",
    "Why should I verify a fuel station before relying on its reported price?",
    "Why did you recommend this station?",
    "What fuel types can I report?",
    "How does report verification work?",
    "thanks!",
    "",
  ])("treats %j as a conversation (no location needed)", (query) => {
    expect(looksLikeStationSearch(query)).toBe(false);
  });
});
