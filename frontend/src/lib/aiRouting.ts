/**
 * Does this message look like a station SEARCH, or a question for the
 * conversational assistant?
 *
 * This is a UX pre-check only: it decides whether Fuel Intelligence must hold
 * the question until the user shares a location (a station search needs real
 * coordinates — the app never invents them) or can send it straight to the
 * backend (a general question needs no location at all).
 *
 * The BACKEND is authoritative: `app/services/ai/chat.py` runs the same routing
 * rules server-side and decides which pipeline actually runs. Keep the two in
 * sync when the vocabulary changes.
 */

/** Phrases that can only mean "find stations near a place". */
const STRONG_FINDER =
  /\bnear me\b|\bnear by\b|\bnearby\b|\bnearest\b|\bclosest\b|\baround me\b|\baround here\b|\bclose to me\b|\bwithin\s+\d+(\.\d+)?\s*(km|kilomet|m\b|metre|meter)|\bwhere can i\b|\bwhere do i\b|\bwhere to\b/i;

/** Fuel / station vocabulary. */
const DOMAIN =
  /\bstations?\b|\bpetrol\b|\bfuel\b|\bdiesel\b|\bkerosene\b|\bpms\b|\bago\b|\bdpk\b|\blpg\b|\bcng\b|\bcooking gas\b|\bpumps?\b|\bfilling\b|\bnnpc\b|\bmobil\b|\btotal(energies)?\b|\boando\b|\bconoil\b|\bardova\b/i;

/** Explanatory / conversational questions and greetings. */
const EXPLAINER =
  /^\s*(hi|hello|hey|yo|good (morning|afternoon|evening))\b|\bwhat can you\b|\bwhat do you\b|\bwho are you\b|\bwhat are you\b|\bwhat is\b|\bwhat's\b|\bwhat does\b|\bwhat happens\b|\bhow (do|does|can|is|are|long|often|accurate|reliable)\b|\bwhy\b|\bwhen (do|does|is|are|will|should)\b|\bcan i\b|\bcan you (explain|tell)\b|\bdo you\b|\bshould i\b|\bis it (safe|true|possible|accurate)\b|\bexplain\b|\btell me about\b|\bhelp\b|\bthank/i;

/**
 * True when the message should run a real station search (and therefore needs
 * the user's location); false when it is a question the assistant can answer
 * without any location.
 */
export function looksLikeStationSearch(text: string): boolean {
  const query = (text ?? "").trim();
  if (!query) return false;

  const hasDomain = DOMAIN.test(query);
  if (hasDomain && STRONG_FINDER.test(query)) return true;
  if (EXPLAINER.test(query)) return false;
  return hasDomain;
}
