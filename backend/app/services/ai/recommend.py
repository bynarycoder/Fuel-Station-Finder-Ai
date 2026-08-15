"""
Fuel Intelligence — data-driven station recommendations (Groq + DB).

Pipeline (the AI never touches the database directly):

    natural-language query
        -> LLM intent extraction            (Groq; deterministic fallback)
        -> structured ``FuelSearchIntent``
        -> existing station/nearby API      (``station_service.find_nearby``)
        -> crowd-sourced price facts        (``report_service.latest_prices_by_station``)
        -> deterministic ranking            (pure, unit-tested, no LLM)
        -> AI explanation                   (Groq, facts-only; deterministic fallback)

Honesty rules that this module enforces mechanically:

* The LLM never chooses "the best station" — ``rank_recommendations`` does.
* Explanations are generated from a *facts-only* prompt; the response parser
  and the deterministic fallback both refuse to invent a price.
* Station provenance (``data_source`` / ``verification_status``) is passed
  through untouched from the station API. An AI recommendation never changes
  it, and the prompts forbid presenting an unverified row as verified.
* If no AI key is configured (or the provider times out / returns garbage),
  the feature degrades to the deterministic intent parser + template answers
  instead of failing — and the response says so via ``intent_source`` /
  ``answer_source``.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.models import FuelTypeCode
from app.services.ai.base import AINotConfiguredError, extract_json_object

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Constants / policy
# --------------------------------------------------------------------------- #
SORT_PREFERENCES = ("distance", "price", "best_overall", "reliability")

# Radius sanity bounds (metres). The LLM's number is clamped into this window;
# the nearby API's own ceiling (MAX_RADIUS_M) is respected by the caller too.
MIN_INTENT_RADIUS_M = 200.0
MAX_INTENT_RADIUS_M = 100_000.0

# How many nearby candidates the ranking considers (server-side, so the
# browser never filters an enormous dataset).
MAX_CANDIDATES = 50
# How many recommendations are returned to the client.
MAX_RECOMMENDATIONS = 3

# A sane ceiling for prices the model may extract (Naira per litre).
MAX_PRICE = 100_000.0

# Linear freshness decay: a data point this many days old scores 0.
FRESHNESS_DECAY_DAYS = 90.0

# Trust score for the station *record* verification state. ``rejected`` rows
# are not surfaced by normal flows; they score 0 if they ever appear.
VERIFICATION_SCORES = {
    "verified": 1.0,
    "pending": 0.7,
    "unverified": 0.25,
    "rejected": 0.0,
}

# Neutral score when a component cannot be measured (e.g. no price reported).
NEUTRAL_SCORE = 0.5

# Intent-driven weights (each tuple sums to 1.0).
#   distance      -> heavily prioritise closeness
#   price         -> heavily prioritise cheapness
#   reliability   -> heavily prioritise verification/freshness
#   best_overall  -> balanced
SCORE_WEIGHTS: dict[str, dict[str, float]] = {
    "distance": {
        "distance": 0.55,
        "price": 0.05,
        "verification": 0.15,
        "freshness": 0.05,
        "availability": 0.20,
    },
    "price": {
        "distance": 0.10,
        "price": 0.55,
        "verification": 0.15,
        "freshness": 0.05,
        "availability": 0.15,
    },
    "best_overall": {
        "distance": 0.25,
        "price": 0.25,
        "verification": 0.20,
        "freshness": 0.10,
        "availability": 0.20,
    },
    "reliability": {
        "distance": 0.15,
        "price": 0.05,
        "verification": 0.40,
        "freshness": 0.20,
        "availability": 0.20,
    },
}

# Candidates within this score gap of the top are "equally strong" and the
# answer says so instead of crowning one option.
STRONG_OPTION_DELTA = 0.05

# In-memory recommendation cache: (query, rounded lat, rounded lon) -> result.
# Rounded to ~100 m so small GPS jitter reuses the same computed answer, while
# the AI is only ever run on an explicit user ask (never continuously while
# the user moves).
_CACHE_TTL_SECONDS = settings.AI_RECOMMEND_CACHE_TTL_SECONDS
_recommend_cache: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}
_recommend_cache_lock = threading.Lock()


def clear_recommend_cache() -> None:
    """Drop all cached recommendations (used by tests)."""
    with _recommend_cache_lock:
        _recommend_cache.clear()


# --------------------------------------------------------------------------- #
# Intent model
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class FuelSearchIntent:
    """Structured search parameters extracted from a natural-language query.

    Mirrors backend conventions: fuel codes come from ``FuelTypeCode``, and
    only facts the user actually stated (or strongly implied) are populated —
    every field defaults to "unspecified".
    """

    fuel_type: str | None = None
    max_price: float | None = None
    min_price: float | None = None
    sort_preference: str | None = None  # distance | price | best_overall | reliability
    require_verified: bool = False
    radius_meters: float | None = None
    raw: str = ""


_VALID_FUEL_CODES = FuelTypeCode.codes()

_SORT_ALIASES = {
    "closest": "distance",
    "nearest": "distance",
    "near": "distance",
    "close": "distance",
    "cheapest": "price",
    "cheap": "price",
    "lowest_price": "price",
    "lowest": "price",
    "affordable": "price",
    "best_overall": "best_overall",
    "overall": "best_overall",
    "balanced": "best_overall",
    "best": "best_overall",
    "reliability": "reliability",
    "reliable": "reliability",
    "trusted": "reliability",
    "verified": "reliability",
    "reputable": "reliability",
}

_INTENT_PROMPT = """\
You extract structured search parameters from natural-language requests about \
Nigerian fuel stations. Respond with STRICT JSON only (no markdown, no prose) \
using exactly these keys:
{
  "fuel_type": "PMS" | "AGO" | "DPK" | "LPG" | "CNG" | null,
  "max_price": <number or null; highest acceptable Naira price per litre>,
  "min_price": <number or null; lowest acceptable Naira price per litre>,
  "sort_preference": "distance" | "price" | "best_overall" | "reliability" | null,
  "require_verified": <true only when the user explicitly asks for verified stations>,
  "radius_meters": <number or null; e.g. "within 2 km" -> 2000>
}
Rules:
- Populate a field ONLY when the user clearly stated or strongly implied it.
  Leave everything else null/false. Never guess.
- "petrol"->PMS, "diesel"->AGO, "kerosene"->DPK, "cooking gas"/"gas"->LPG, "CNG"->CNG.
- "cheapest"/"cheap"/"lowest price" -> sort_preference "price".
- "closest"/"nearest"/"near me" -> sort_preference "distance".
- "reliable"/"trusted"/"verified" -> sort_preference "reliability".
- "best station"/"best combination of price and distance" -> sort_preference "best_overall".
- "under ₦900"/"below 1000" -> max_price with the number only.
- If the query is not about fuel stations, return all null/false values.
"""


def build_intent_prompt() -> str:
    """The instruction prompt sent to Groq for intent extraction."""
    return _INTENT_PROMPT


# --------------------------------------------------------------------------- #
# Intent normalisation (pure)
# --------------------------------------------------------------------------- #
def _clean_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not (0 < number <= MAX_PRICE):
        return None
    return number


def to_fuel_intent(data: dict[str, Any], raw: str = "") -> FuelSearchIntent:
    """Validate/normalise LLM (or fallback-parser) JSON into a ``FuelSearchIntent``.

    Unknown fuel codes, bogus sort preferences and out-of-range numbers are
    dropped rather than trusted — the model can only *narrow* the search, and
    a malformed field degrades to "unspecified".
    """
    fuel_raw = data.get("fuel_type")
    fuel_type: str | None = None
    if isinstance(fuel_raw, str):
        fuel = fuel_raw.strip().upper()
        if fuel in _VALID_FUEL_CODES:
            fuel_type = fuel

    max_price = _clean_float(data.get("max_price"))
    min_price = _clean_float(data.get("min_price"))
    if max_price is not None and min_price is not None and min_price > max_price:
        max_price, min_price = min_price, max_price  # contradictory -> swap

    sort_preference: str | None = None
    sort_raw = data.get("sort_preference")
    if isinstance(sort_raw, str):
        key = sort_raw.strip().lower().replace(" ", "_")
        sort_preference = _SORT_ALIASES.get(key, key)
        if sort_preference not in SORT_PREFERENCES:
            sort_preference = None

    require_verified = bool(data.get("require_verified"))

    radius_meters: float | None = None
    radius_raw = data.get("radius_meters")
    try:
        radius_number = float(radius_raw) if radius_raw is not None else None
    except (TypeError, ValueError):
        radius_number = None
    if radius_number is not None and radius_number > 0:
        radius_meters = max(
            MIN_INTENT_RADIUS_M,
            min(MAX_INTENT_RADIUS_M, radius_number),
        )

    return FuelSearchIntent(
        fuel_type=fuel_type,
        max_price=max_price,
        min_price=min_price,
        sort_preference=sort_preference,
        require_verified=require_verified,
        radius_meters=radius_meters,
        raw=raw,
    )


# --------------------------------------------------------------------------- #
# Deterministic fallback intent parser (no LLM)
# --------------------------------------------------------------------------- #
_FUEL_KEYWORDS: list[tuple[str, str]] = [
    ("cng", "CNG"),
    ("compressed natural gas", "CNG"),
    ("cooking gas", "LPG"),
    ("lpg", "LPG"),
    ("gas", "LPG"),
    ("kerosene", "DPK"),
    ("dpk", "DPK"),
    ("diesel", "AGO"),
    ("ago", "AGO"),
    ("petrol", "PMS"),
    ("pms", "PMS"),
]

_MAX_PRICE_PATTERNS = [
    re.compile(r"\b(?:under|below|less than|at most|not more than|max(?:imum)?(?: of)?|<=|≤)\s*₦?\s*([0-9][0-9,]*)", re.IGNORECASE),
    re.compile(r"₦\s*([0-9][0-9,]*)\s*/\s*l\b", re.IGNORECASE),
]
_RADIUS_RE = re.compile(r"\b(?:within|around|about)\s+([0-9]+(?:\.[0-9]+)?)\s*(km|kilomet(?:er|re)s?|m(?:eters?)?)\b", re.IGNORECASE)


def parse_intent_fallback(text: str) -> FuelSearchIntent:
    """Deterministic keyword extraction — used when Groq is unavailable or fails.

    Deliberately conservative: it only recognises explicit words/amounts, so it
    can never hallucinate values the user did not write.
    """
    raw = text or ""
    lowered = raw.lower()

    fuel_type: str | None = None
    for keyword, code in _FUEL_KEYWORDS:
        if re.search(rf"\b{re.escape(keyword)}\b", lowered):
            fuel_type = code
            break

    sort_preference: str | None = None
    if re.search(r"\b(cheap(?:est|er)?|lowest|affordable)\b", lowered):
        sort_preference = "price"
    elif re.search(r"\b(reliab\w*|trust\w*|verified|reputable)\b", lowered):
        sort_preference = "reliability"
    elif re.search(r"\bbest\b", lowered):
        sort_preference = "best_overall"
    elif re.search(r"\b(clos(?:est|er)|nearest|near(?:by| me)?)\b", lowered):
        sort_preference = "distance"

    max_price: float | None = None
    for pattern in _MAX_PRICE_PATTERNS:
        match = pattern.search(raw)
        if match:
            max_price = _clean_float(match.group(1).replace(",", ""))
            break

    require_verified = bool(re.search(r"\bverified\b", lowered))

    radius_meters: float | None = None
    radius_match = _RADIUS_RE.search(raw)
    if radius_match:
        value = float(radius_match.group(1))
        unit = radius_match.group(2).lower()
        radius = value * 1000 if unit.startswith("km") else value
        radius_meters = max(MIN_INTENT_RADIUS_M, min(MAX_INTENT_RADIUS_M, radius))

    return FuelSearchIntent(
        fuel_type=fuel_type,
        max_price=max_price,
        min_price=None,
        sort_preference=sort_preference,
        require_verified=require_verified,
        radius_meters=radius_meters,
        raw=raw,
    )


# --------------------------------------------------------------------------- #
# Groq intent extraction
# --------------------------------------------------------------------------- #
def parse_recommend_intent(text: str) -> FuelSearchIntent:
    """Call Groq (the project's existing NL provider) to parse ``text``.

    Raises ``AINotConfiguredError`` when ``GROQ_API_KEY`` is not set.
    """
    if not settings.GROQ_API_KEY:
        raise AINotConfiguredError(
            "Fuel Intelligence is not configured (GROQ_API_KEY is missing)."
        )

    # Imported lazily so this module never requires the SDK at import time.
    from groq import Groq

    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        response_format={"type": "json_object"},
        timeout=settings.AI_TIMEOUT_SECONDS,
        max_retries=0,
        messages=[
            {"role": "system", "content": build_intent_prompt()},
            {"role": "user", "content": text},
        ],
    )
    content = response.choices[0].message.content or ""
    return to_fuel_intent(extract_json_object(content), text)


def extract_intent(text: str) -> tuple[FuelSearchIntent, str]:
    """Intent extraction with graceful degradation.

    Returns ``(intent, source)`` where source is ``"groq"`` or ``"fallback"``.
    Never raises: provider misconfiguration, timeouts and malformed responses
    all degrade to the deterministic parser so the feature keeps working.
    """
    try:
        return parse_recommend_intent(text), "groq"
    except Exception as exc:  # noqa: BLE001 - any AI failure degrades safely
        logger.warning("[AI RECOMMEND] intent extraction failed: %s", exc)
        return parse_intent_fallback(text), "fallback"


# --------------------------------------------------------------------------- #
# Deterministic scoring & ranking (pure — no LLM involved)
# --------------------------------------------------------------------------- #
@dataclass
class ScoredCandidate:
    station: dict[str, Any]
    score: float
    breakdown: dict[str, float]
    comparable_price: float | None
    comparable_price_fuel: str | None
    comparable_price_reported_at: datetime | None = None
    comparable_price_status: str | None = None


def _station_fuel_codes(station: dict[str, Any]) -> set[str]:
    return {entry.get("code") for entry in station.get("fuel_types", []) if entry.get("code")}


def _verification_value(station: dict[str, Any]) -> str:
    value = station.get("verification_status")
    if hasattr(value, "value"):  # SQLAlchemy enum
        return str(value.value)
    return str(value or "unverified")


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def latest_price_for(
    station_id: str,
    price_map: dict[str, list[dict[str, Any]]],
    fuel_type: str | None,
) -> dict[str, Any] | None:
    """The latest reported price fact for a station, preferring the requested
    fuel; falls back to the station's cheapest known price when no fuel was
    requested (price facts are only ever *reported* data)."""
    entries = price_map.get(station_id) or []
    if not entries:
        return None
    if fuel_type:
        for entry in entries:  # already newest-first
            if entry.get("fuel_type_code") == fuel_type:
                return entry
        return None
    priced = [entry for entry in entries if entry.get("price_per_litre") is not None]
    if not priced:
        return None
    return min(priced, key=lambda entry: float(entry["price_per_litre"]))


def _price_constraint_ok(price: float | None, intent: FuelSearchIntent) -> bool:
    """True unless a *known* price violates the user's stated bounds.

    Stations with no reported price are kept (ranked neutrally) rather than
    silently dropped — hiding them could discard the very station the user
    needs just because nobody reported its price yet.
    """
    if price is None:
        return True
    return not (
        (intent.max_price is not None and price > intent.max_price)
        or (intent.min_price is not None and price < intent.min_price)
    )


def _normalize_lower_is_better(values: list[float | None]) -> list[float]:
    """Map values to [0,1] where the smallest value scores 1. ``None`` values
    (unmeasured) score neutral (0.5) — never treated as best or worst."""
    indexes = list(range(len(values)))
    known = [values[i] for i in indexes if values[i] is not None]
    if not known:
        return [NEUTRAL_SCORE] * len(values)
    lo, hi = min(known), max(known)
    result: list[float] = []
    for value in values:
        if value is None:
            result.append(NEUTRAL_SCORE)
        elif hi <= lo:
            result.append(1.0)
        else:
            result.append(round((hi - value) / (hi - lo), 4))
    return result


def _freshness_score(station: dict[str, Any], price_entry: dict[str, Any] | None, now: datetime) -> float:
    """Recency of the best signal we hold for this station (verification stamp,
    catalogue update, or latest price report). Linear decay over
    ``FRESHNESS_DECAY_DAYS``; missing timestamps score 0 (cannot prove fresh)."""
    timestamps = [
        _as_datetime(station.get("last_verified_at")),
        _as_datetime(station.get("verified_at")),
        _as_datetime(station.get("updated_at")),
    ]
    if price_entry:
        timestamps.append(_as_datetime(price_entry.get("created_at")))
    valid = [ts for ts in timestamps if ts is not None]
    if not valid:
        return 0.0
    newest = max(valid)
    if newest.tzinfo is None:
        newest = newest.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - newest).total_seconds() / 86400.0)
    return round(max(0.0, 1.0 - age_days / FRESHNESS_DECAY_DAYS), 4)


def score_candidates(
    candidates: list[dict[str, Any]],
    intent: FuelSearchIntent,
    price_map: dict[str, list[dict[str, Any]]],
    now: datetime | None = None,
) -> list[ScoredCandidate]:
    """Deterministic scoring of nearby candidates. Pure — no network, no LLM.

    Hard exclusions (mechanical, never opinionated):
    * the station does not offer the requested fuel
    * ``require_verified`` and the row is not ``verified``
    * a *known* reported price violates ``max_price`` / ``min_price``
    """
    now = now or datetime.now(timezone.utc)
    weights = SCORE_WEIGHTS[intent.sort_preference or "best_overall"]

    filtered: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    for station in candidates:
        station_id = str(station.get("id", ""))
        codes = _station_fuel_codes(station)
        if intent.fuel_type and intent.fuel_type not in codes:
            continue  # unavailable fuel -> excluded
        if intent.require_verified and _verification_value(station) != "verified":
            continue
        price_entry = latest_price_for(station_id, price_map, intent.fuel_type)
        price = (
            float(price_entry["price_per_litre"])
            if price_entry and price_entry.get("price_per_litre") is not None
            else None
        )
        if not _price_constraint_ok(price, intent):
            continue
        filtered.append((station, price_entry))

    if not filtered:
        return []

    distances = [
        float(s.get("distance_meters")) if s.get("distance_meters") is not None else None
        for s, _ in filtered
    ]
    distance_scores = _normalize_lower_is_better(distances)
    prices = [
        float(entry["price_per_litre"]) if entry and entry.get("price_per_litre") is not None else None
        for _, entry in filtered
    ]
    price_scores = _normalize_lower_is_better(prices)

    scored: list[ScoredCandidate] = []
    for index, (station, price_entry) in enumerate(filtered):
        verification = VERIFICATION_SCORES.get(_verification_value(station), NEUTRAL_SCORE)
        freshness = _freshness_score(station, price_entry, now)
        availability = 1.0 if (not intent.fuel_type or intent.fuel_type in _station_fuel_codes(station)) else 0.0
        breakdown = {
            "distance": distance_scores[index],
            "price": price_scores[index],
            "verification": verification,
            "freshness": freshness,
            "availability": availability,
        }
        total = round(
            sum(weights[key] * breakdown[key] for key in weights),
            4,
        )
        price_value = prices[index]
        scored.append(
            ScoredCandidate(
                station=station,
                score=total,
                breakdown=breakdown,
                comparable_price=price_value,
                comparable_price_fuel=(
                    str(price_entry["fuel_type_code"]) if price_entry else intent.fuel_type
                ),
                comparable_price_reported_at=_as_datetime(price_entry.get("created_at")) if price_entry else None,
                comparable_price_status=str(price_entry.get("status")) if price_entry else None,
            )
        )
    return scored


def rank_recommendations(
    candidates: list[dict[str, Any]],
    intent: FuelSearchIntent,
    price_map: dict[str, list[dict[str, Any]]],
    now: datetime | None = None,
) -> list[ScoredCandidate]:
    """Score and sort candidates deterministically.

    Tie-breaking is fully deterministic: score desc, then distance asc, then
    name, then id — the LLM never gets to pick a winner.
    """
    scored = score_candidates(candidates, intent, price_map, now)
    scored.sort(
        key=lambda item: (
            -item.score,
            (
                float(item.station["distance_meters"])
                if item.station.get("distance_meters") is not None
                else float("inf")
            ),
            str(item.station.get("name") or "").lower(),
            str(item.station.get("id") or ""),
        )
    )
    return scored


# --------------------------------------------------------------------------- #
# Deterministic reasons & fallback answers (facts already ranked)
# --------------------------------------------------------------------------- #
def _fuel_label(code: str | None) -> str:
    labels = {"PMS": "petrol", "AGO": "diesel", "DPK": "kerosene", "LPG": "cooking gas", "CNG": "CNG"}
    return labels.get(code or "", "fuel")


def _format_price_naira(price: float | None) -> str:
    if price is None:
        return "Price information is currently unavailable."
    return f"₦{price:,.0f} per litre"


def build_station_reason(intent: FuelSearchIntent, scored: ScoredCandidate, ranked: list[ScoredCandidate]) -> str:
    """A deterministic, fact-based reason for recommending this station.

    Only statements provable from the candidate's own data are emitted; in
    particular a station is described as verified ONLY when its actual
    ``verification_status`` is ``verified``.
    """
    station = scored.station
    preference = intent.sort_preference or "best_overall"
    fuel = _fuel_label(intent.fuel_type)
    distance = station.get("distance_meters")

    if preference == "price":
        if scored.comparable_price is not None:
            known_prices = [c.comparable_price for c in ranked if c.comparable_price is not None]
            if known_prices and scored.comparable_price == min(known_prices):
                return f"Lowest recent {fuel} price among nearby stations ({_format_price_naira(scored.comparable_price)})."
        return "Best nearby balance of price and distance with the data available."

    if preference == "distance":
        if distance is not None:
            km = float(distance) / 1000
            return f"Closest {fuel} station to you ({km:.1f} km)."
        return f"Nearest {fuel} option nearby."

    if preference == "reliability":
        if _verification_value(station) == "verified":
            return "This station's listing has been independently verified."
        if scored.breakdown["freshness"] > NEUTRAL_SCORE:
            return "The most recently updated data among nearby candidates."
        return "Best available trust signal nearby (no station is verified here)."

    # best_overall / default: explain the balance honestly
    parts: list[str] = []
    if scored.comparable_price is not None:
        parts.append(f"a recent {fuel} price of {_format_price_naira(scored.comparable_price)}")
    if distance is not None:
        parts.append(f"{float(distance) / 1000:.1f} km from you")
    if _verification_value(station) == "verified":
        parts.append("an independently verified listing")
    if parts:
        return "Strong overall match: " + ", ".join(parts) + "."
    return "Best overall match among nearby stations with the data available."


def build_deterministic_answer(
    intent: FuelSearchIntent,
    ranked: list[ScoredCandidate],
    total_candidates: int,
) -> str:
    """Honest, template-based answer built exclusively from ranked facts."""
    if not ranked:
        return "I couldn't find a nearby station matching your request."

    top = ranked[0]
    station = top.station
    name = str(station.get("name") or "This station")
    fuel = _fuel_label(intent.fuel_type)
    distance = station.get("distance_meters")

    clauses = [f"{name} looks like the best match for you."]
    if distance is not None:
        clauses.append(f"It is {float(distance) / 1000:.1f} km away")
    if intent.fuel_type:
        clauses.append(f"and offers {fuel}")
    if top.comparable_price is not None:
        clauses.append(f"with a recent reported price of {_format_price_naira(top.comparable_price)}")
    elif intent.sort_preference == "price" or intent.fuel_type:
        clauses.append("but price information is currently unavailable for it")
    if _verification_value(station) == "verified":
        clauses.append("Its listing has been independently verified")
    answer = " ".join(clauses) + "."

    strong = [c for c in ranked if top.score - c.score <= STRONG_OPTION_DELTA]
    if len(strong) > 1:
        answer += (
            f" I found {len(strong)} strong options; here are the closest and "
            "lowest-priced choices."
        )
    elif total_candidates > len(ranked):
        answer += " Some nearby stations were filtered out by your request."
    return answer


def build_facts_payload(intent: FuelSearchIntent, top: list[ScoredCandidate]) -> list[dict[str, Any]]:
    """The exact facts the LLM explanation is allowed to use — nothing else."""
    facts: list[dict[str, Any]] = []
    for candidate in top:
        station = candidate.station
        facts.append(
            {
                "name": station.get("name"),
                "brand": station.get("brand"),
                "city": station.get("city"),
                "distance_km": (
                    round(float(station["distance_meters"]) / 1000, 2)
                    if station.get("distance_meters") is not None
                    else None
                ),
                "fuel_types": sorted(_station_fuel_codes(station)),
                "data_source": _verification_value_safe(station.get("data_source")),
                "verification_status": _verification_value(station),
                "latest_reported_price_naira": candidate.comparable_price,
                "latest_price_fuel_type": candidate.comparable_price_fuel,
                "score": candidate.score,
                "reason": build_station_reason(intent, candidate, top),
            }
        )
    return facts


def _verification_value_safe(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value or "")


# --------------------------------------------------------------------------- #
# Groq explanation (facts-only)
# --------------------------------------------------------------------------- #
_EXPLANATION_PROMPT = """\
You explain fuel-station recommendations for a Nigerian drivers' app. \
You are given the ranked stations and the exact facts we know about them. \
Explain to the user, in 2-3 short friendly sentences, why the top station was \
recommended. STRICT JSON only: {"answer": "<your explanation>"}.

Hard rules — violating any of them is worse than saying less:
- Use ONLY the supplied facts. Never invent names, prices, distances, fuels or
  verification claims.
- A station is verified ONLY when its verification_status is exactly
  "verified". Otherwise never call it verified; use "unverified" or
  "awaiting verification" as given.
- If latest_reported_price_naira is null, never state a price. Say:
  "Price information is currently unavailable."
- If there are no stations, say you couldn't find a nearby station matching
  the request. Never make one up.
"""


def build_explanation_prompt(intent: FuelSearchIntent, top: list[ScoredCandidate]) -> str:
    """The facts-only prompt for the explanation call."""
    facts = build_facts_payload(intent, top)
    return (
        _EXPLANATION_PROMPT
        + "\n\nUser request: "
        + (intent.raw or "")
        + "\nRequested fuel: "
        + (intent.fuel_type or "none")
        + "\nRanked station facts (do not add to them):\n"
        + json.dumps(facts, ensure_ascii=False, default=str)
    )


def parse_explanation_response(text: str | None, max_chars: int = 1000) -> str:
    """Extract the answer string from the LLM response (pure)."""
    data = extract_json_object(text)
    answer = data.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return ""
    return answer.strip()[:max_chars]


def generate_explanation(intent: FuelSearchIntent, top: list[ScoredCandidate]) -> str:
    """Ask Groq to explain the ranked recommendation using supplied facts only.

    Raises ``AINotConfiguredError`` when Groq is not configured.
    """
    if not settings.GROQ_API_KEY:
        raise AINotConfiguredError(
            "Fuel Intelligence is not configured (GROQ_API_KEY is missing)."
        )

    from groq import Groq

    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        response_format={"type": "json_object"},
        timeout=settings.AI_TIMEOUT_SECONDS,
        max_retries=0,
        messages=[
            {"role": "system", "content": build_explanation_prompt(intent, top)},
            {"role": "user", "content": "Explain the recommendation using only the supplied facts."},
        ],
    )
    content = response.choices[0].message.content or ""
    answer = parse_explanation_response(content)
    if not answer:
        return build_deterministic_answer(intent, top, len(top))
    return answer


# --------------------------------------------------------------------------- #
# Orchestration (async — talks to the DB only through the service layer)
# --------------------------------------------------------------------------- #
async def recommend_stations(
    db: Any,
    query: str,
    latitude: float | None,
    longitude: float | None,
    *,
    use_cache: bool = True,
) -> dict[str, Any]:
    """Run the full pipeline and return the API response dict.

    Location handling: ``(None, None)`` coordinates produce a
    ``needs_location`` response — the assistant explains itself rather than
    falling back to invented coordinates.
    """
    from app.services import reports as report_service
    from app.services import stations as station_service

    needs_location = latitude is None or longitude is None
    base = {
        "query": query,
        "needs_location": needs_location,
    }
    if needs_location:
        return {
            **base,
            "intent": None,
            "intent_source": "fallback",
            "answer_source": "fallback",
            "recommendations": [],
            "answer": "I need your location to find stations near you. "
            "Please allow location access (use \"Near me\") and ask again.",
        }

    cache_key = (query.strip(), round(float(latitude), 3), round(float(longitude), 3))
    if use_cache:
        with _recommend_cache_lock:
            cached = _recommend_cache.get(cache_key)
        if cached is not None:
            created_at, result = cached
            if time.monotonic() - created_at < _CACHE_TTL_SECONDS:
                return result
            with _recommend_cache_lock:
                _recommend_cache.pop(cache_key, None)

    intent, intent_source = extract_intent(query)

    radius = intent.radius_meters or station_service.DEFAULT_RADIUS_M
    radius = max(0.0, min(float(radius), station_service.MAX_RADIUS_M))

    nearby = await station_service.find_nearby(
        db,
        float(latitude),
        float(longitude),
        radius_meters=radius,
        limit=MAX_CANDIDATES,
        fuel_type=intent.fuel_type,
        verification_status="verified" if intent.require_verified else None,
    )
    candidates: list[dict[str, Any]] = nearby["items"]

    station_ids = [str(item["id"]) for item in candidates]
    price_map = await report_service.latest_prices_by_station(
        db, station_ids, fuel_type_code=intent.fuel_type
    )

    ranked = rank_recommendations(candidates, intent, price_map)
    top = ranked[:MAX_RECOMMENDATIONS]

    answer: str
    answer_source: str
    try:
        if top:
            answer = generate_explanation(intent, top)
            answer_source = "groq"
        else:
            answer = build_deterministic_answer(intent, ranked, len(candidates))
            answer_source = "fallback"
    except Exception as exc:  # noqa: BLE001 - explanation failure degrades safely
        logger.warning("[AI RECOMMEND] explanation failed: %s", exc)
        answer = build_deterministic_answer(intent, ranked, len(candidates))
        answer_source = "fallback"

    recommendations: list[dict[str, Any]] = []
    for candidate in top:
        recommendations.append(
            {
                "station": candidate.station,
                "score": candidate.score,
                "reason": build_station_reason(intent, candidate, ranked),
                "latest_price": candidate.comparable_price,
                "latest_price_fuel_type": candidate.comparable_price_fuel,
                "latest_price_reported_at": candidate.comparable_price_reported_at,
                "breakdown": candidate.breakdown,
            }
        )

    result = {
        **base,
        "intent": {
            "fuel_type": intent.fuel_type,
            "max_price": intent.max_price,
            "min_price": intent.min_price,
            "sort_preference": intent.sort_preference,
            "require_verified": intent.require_verified,
            "radius_meters": radius,
        },
        "intent_source": intent_source,
        "answer_source": answer_source,
        "recommendations": recommendations,
        "answer": answer,
    }

    if use_cache:
        with _recommend_cache_lock:
            _recommend_cache[cache_key] = (time.monotonic(), result)
    return result
