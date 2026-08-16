"""
Groq conversational assistant (general Q&A about the Fuel Station Finder).

Responsibility split — this module is the *conversational* half of the Groq
integration:

* ``app.services.ai.recommend``  -> station SEARCH requests
  ("cheapest petrol near me") : Groq extracts intent, the database ranks.
* ``app.services.ai.chat`` (here) -> everything else the user types
  ("Hello, what can you help me with?", "Why should I verify a price?"):
  Groq answers in natural language, grounded in the application's real
  capabilities, with NO station lookup and NO location requirement.

Grounding rules (mechanically enforced by the prompt + tests):

* The context handed to the model is built from the application's own models
  (``FuelTypeCode``, ``QueueLength``, ``ReportStatus``) and the real ranking
  policy, so it cannot drift from the product.
* The assistant must never invent a station, price, queue or verification
  claim. Live facts only ever come from the database via the recommendation
  pipeline; when the user wants those, the assistant says how to ask for them.
* When Groq is unavailable the caller falls back to a deterministic help text
  which is explicitly labelled ``answer_source="fallback"`` — a fallback is
  never presented as an AI answer.
"""

from __future__ import annotations

import re

from app.models import FuelTypeCode, QueueLength, ReportStatus
from app.scripts.seed_data.fuel_types import FUEL_TYPES
from app.services.ai.provider import groq_chat

# Result of routing a user's message.
MODE_SEARCH = "search"
MODE_CONVERSATION = "conversation"

MAX_ANSWER_CHARS = 1200

# --------------------------------------------------------------------------- #
# Routing: is the user asking us to FIND stations, or asking a question?
# --------------------------------------------------------------------------- #
# Tier 1 — phrases that can only mean "search near a place". They win over
# everything else ("where can I find cheap petrol?" is a search, not a chat).
_STRONG_FINDER_PATTERNS = (
    r"\bnear me\b",
    r"\bnear by\b",
    r"\bnearby\b",
    r"\bnearest\b",
    r"\bclosest\b",
    r"\baround me\b",
    r"\baround here\b",
    r"\bclose to me\b",
    r"\bwithin\s+\d+(?:\.\d+)?\s*(?:km|kilomet|m\b|metre|meter)",
    r"\bwhere can i\b",
    r"\bwhere do i\b",
    r"\bwhere to\b",
)

# Tier 2 — fuel / station vocabulary. Any message about fuel that is not an
# explanatory question is treated as a station search, because that is what the
# product's search box is for ("cheapest petrol", "verified stations", "PMS").
_DOMAIN_PATTERNS = (
    r"\bstation(?:s)?\b",
    r"\bpetrol\b",
    r"\bfuel\b",
    r"\bdiesel\b",
    r"\bkerosene\b",
    r"\bpms\b",
    r"\bago\b",
    r"\bdpk\b",
    r"\blpg\b",
    r"\bcng\b",
    r"\bcooking gas\b",
    r"\bpump(?:s)?\b",
    r"\bfilling\b",
    r"\bnnpc\b",
    r"\bmobil\b",
    r"\btotal(?:energies)?\b",
    r"\boando\b",
    r"\bconoil\b",
    r"\bardova\b",
)

# Tier 3 — explanatory / conversational questions. These stay conversational
# even when they mention fuel ("why should I verify a price?", "what is PMS?"),
# unless a tier-1 phrase already proved the user wants nearby stations.
_EXPLAINER_PATTERNS = (
    r"^\s*(?:hi|hello|hey|yo|good (?:morning|afternoon|evening))\b",
    r"\bwhat can you\b",
    r"\bwhat do you\b",
    r"\bwho are you\b",
    r"\bwhat are you\b",
    r"\bwhat is\b",
    r"\bwhat's\b",
    r"\bwhat does\b",
    r"\bwhat happens\b",
    r"\bhow (?:do|does|can|is|are|long|often|accurate|reliable)\b",
    r"\bwhy\b",
    r"\bwhen (?:do|does|is|are|will|should)\b",
    r"\bcan i\b",
    r"\bcan you (?:explain|tell)\b",
    r"\bdo you\b",
    r"\bshould i\b",
    r"\bis it (?:safe|true|possible|accurate)\b",
    r"\bexplain\b",
    r"\btell me about\b",
    r"\bhelp\b",
    r"\bthank",
)

_STRONG_FINDER_RE = re.compile("|".join(_STRONG_FINDER_PATTERNS), re.IGNORECASE)
_DOMAIN_RE = re.compile("|".join(_DOMAIN_PATTERNS), re.IGNORECASE)
_EXPLAINER_RE = re.compile("|".join(_EXPLAINER_PATTERNS), re.IGNORECASE)


def classify_query(text: str | None) -> str:
    """Route a user message to ``"search"`` or ``"conversation"`` (pure).

    Deterministic on purpose: routing must not depend on an LLM being up, and
    a provider outage must never silently change which feature the user gets.

    Order of precedence:

    1. "near me"/"nearest"/"where can I ..." + fuel vocabulary -> SEARCH.
    2. An explanatory question or greeting -> CONVERSATION, even when it
       mentions fuel ("why should I verify a reported price?").
    3. Any remaining message that mentions fuel/stations -> SEARCH (this is
       what the product's search box is for: "cheapest petrol", "PMS").
    4. Everything else -> CONVERSATION.
    """
    query = (text or "").strip()
    if not query:
        return MODE_CONVERSATION

    has_domain = bool(_DOMAIN_RE.search(query))

    if has_domain and _STRONG_FINDER_RE.search(query):
        return MODE_SEARCH
    if _EXPLAINER_RE.search(query):
        return MODE_CONVERSATION
    if has_domain:
        return MODE_SEARCH
    return MODE_CONVERSATION


# --------------------------------------------------------------------------- #
# Prompt (built from the application's real models/policy — never hardcoded
# product claims that could drift).
# --------------------------------------------------------------------------- #
_CAPABILITY_TEMPLATE = """\
You are "Fuel Intelligence", the assistant inside the Fuel Station Finder AI app \
for drivers in Nigeria. Answer the user's message in plain, friendly English.

What the application can actually do:
- Find fuel stations near the user's real GPS position (or a location they pick \
manually) and rank them.
- Rank stations deterministically in the backend using: distance, latest \
crowd-reported price, verification status, data freshness and fuel availability. \
The AI never picks the winner; the database does.
- Show the latest crowd-reported price per litre when drivers have reported one. \
Prices are crowd-sourced and can be out of date; the app shows when it has none.
- Let a signed-in driver submit a fuel report (fuel type, price per litre, \
optional queue length, notes and an optional photo).
- Verify report photos with a separate image-analysis model, and let admins \
approve or reject reports. Station listings show their data source and \
verification status.
- Fuel types the app supports: {fuel_types}.
- Queue lengths a report can record: {queues}.
- Report statuses: {statuses}.

Hard rules (breaking one is worse than a short answer):
- NEVER invent a station name, address, price, queue length, distance or \
verification status. You have no live station data in this conversation.
- If the user wants actual stations or prices, tell them to ask for it directly \
(for example: "cheapest petrol near me" or "closest CNG station") and to share \
their location, because that runs a real database search.
- If a question is outside fuel, driving or this application, say briefly that \
you focus on fuel stations, then offer what you can help with.
- Keep it to 2-4 short sentences. No markdown headings, no bullet lists longer \
than three items, no emoji spam.
"""


def build_chat_system_prompt() -> str:
    """The system prompt for conversational answers (pure, no I/O)."""
    # Names come from the canonical seed reference rows so the assistant's
    # vocabulary cannot drift from the database's own fuel catalogue.
    names = {str(entry["code"]): str(entry["name"]) for entry in FUEL_TYPES}
    fuel_types = ", ".join(
        f"{member.value} ({names[member.value]})"
        if member.value in names
        else member.value
        for member in FuelTypeCode
    )
    queues = ", ".join(member.value for member in QueueLength)
    statuses = ", ".join(member.value for member in ReportStatus)
    return _CAPABILITY_TEMPLATE.format(
        fuel_types=fuel_types, queues=queues, statuses=statuses
    )


# --------------------------------------------------------------------------- #
# Deterministic fallback (safety net — always labelled as such to the client)
# --------------------------------------------------------------------------- #
_FALLBACK_ANSWER = (
    "I can help you find fuel stations near you, compare the latest prices "
    "drivers have reported, and explain how a station was chosen. Try asking "
    "\"cheapest petrol near me\" or \"closest CNG station\" (share your "
    "location so I can search the real station database). You can also report "
    "a price you paid from any station's page."
)


def fallback_answer(_text: str | None = None) -> str:
    """Deterministic help text used when Groq is unavailable.

    Deliberately generic and never presented as an AI answer: the API marks it
    ``answer_source="fallback"`` so the UI can label it honestly.
    """
    return _FALLBACK_ANSWER


# --------------------------------------------------------------------------- #
# Groq call
# --------------------------------------------------------------------------- #
def generate_chat_answer(text: str) -> str:
    """Ask Groq to answer a general question about the app.

    Raises ``AINotConfiguredError`` when no key is configured and
    ``AIProviderError`` for provider failures (timeout, rate limit, auth,
    empty response) — callers degrade to ``fallback_answer`` and say so.
    """
    content = groq_chat(
        [
            {"role": "system", "content": build_chat_system_prompt()},
            {"role": "user", "content": text.strip()},
        ],
        feature="chat",
        temperature=0.3,
        max_completion_tokens=400,
    )
    return content.strip()[:MAX_ANSWER_CHARS]


def answer_question(text: str | None) -> tuple[str, str]:
    """Answer ``text`` conversationally, returning ``(answer, source)``.

    ``source`` is ``"groq"`` when the model actually produced the answer and
    ``"fallback"`` when the deterministic help text was used, so a provider
    outage can never be reported as a working AI.
    """
    query = (text or "").strip()
    if not query:
        # Empty/whitespace input: never spend a provider call on nothing.
        return (
            "Ask me anything about finding fuel — for example \"cheapest "
            "petrol near me\" or \"how does report verification work?\".",
            "fallback",
        )

    try:
        return generate_chat_answer(query), "groq"
    except Exception:  # noqa: BLE001 - already logged + classified by provider
        return fallback_answer(query), "fallback"
