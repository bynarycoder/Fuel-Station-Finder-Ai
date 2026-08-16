"""
Pydantic v2 schemas for the AI features (Phase 8): Gemini verification results
and Groq natural-language search.
"""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field

from app.models.fuel_report import QueueLength, ReportStatus
from app.schemas.fuel_station import FuelStationWithDistance


class VerificationResultPublic(BaseModel):
    """The outcome of Gemini analysing a report photo."""

    score: float = Field(ge=0.0, le=1.0)
    is_plausible: bool
    summary: str
    detected_attributes: list[str] = Field(default_factory=list)
    report_status: ReportStatus
    # Safe (non-secret) error category when Gemini could not be reached or
    # returned an unusable response; None when the call succeeded.
    error: str | None = None


class ParsedQueryPublic(BaseModel):
    """The structured filters Groq extracted from a natural-language query."""

    fuel_type: str | None = None
    queue_length: QueueLength | None = None
    brand: str | None = None
    city: str | None = None
    state: str | None = None


class NaturalLanguageSearchResult(BaseModel):
    """Result of a natural-language station search."""

    query: str
    parsed: ParsedQueryPublic
    items: list[dict] = Field(default_factory=list)
    total: int = Field(ge=0)


# --------------------------------------------------------------------------- #
# Fuel Intelligence — AI station recommendations
# --------------------------------------------------------------------------- #
class FuelSearchIntentPublic(BaseModel):
    """The structured search parameters extracted from the user's query.

    Only explicitly stated facts are populated — unstated fields stay None /
    False. ``radius_meters`` always carries the effective (clamped) radius the
    search actually used.
    """

    fuel_type: str | None = None
    max_price: float | None = None
    min_price: float | None = None
    sort_preference: str | None = None
    require_verified: bool = False
    radius_meters: float | None = None


class AIRecommendRequest(BaseModel):
    """Request body for ``POST /api/v1/ai/recommend``.

    Coordinates are optional: without them a *station search* responds with a
    "needs your location" answer rather than inventing a position, while a
    conversational question is answered without any location at all.
    """

    query: str = Field(min_length=1, max_length=300)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)


class ScoreBreakdown(BaseModel):
    """The deterministic score components behind a recommendation."""

    distance: float = Field(ge=0.0, le=1.0)
    price: float = Field(ge=0.0, le=1.0)
    verification: float = Field(ge=0.0, le=1.0)
    freshness: float = Field(ge=0.0, le=1.0)
    availability: float = Field(ge=0.0, le=1.0)


class AIRecommendation(BaseModel):
    """One ranked station recommendation.

    ``station`` is the untouched public station object plus the PostGIS
    ``distance_meters`` from the nearby query (provenance included); price
    fields are the latest *reported* facts (None when absent — never
    fabricated).
    """

    station: FuelStationWithDistance
    score: float = Field(ge=0.0, le=1.0)
    reason: str
    latest_price: float | None = None
    latest_price_fuel_type: str | None = None
    latest_price_reported_at: datetime.datetime | None = None
    breakdown: ScoreBreakdown


class AIRecommendResponse(BaseModel):
    """Response of ``POST /api/v1/ai/recommend``.

    ``mode`` says which Groq responsibility answered the message:

    * ``"recommendation"`` — a station search ran (intent extraction → nearby
      query → deterministic ranking → factual explanation);
    * ``"conversation"`` — the user asked a general question and Groq answered
      it directly; ``recommendations`` is empty and no location is required.

    ``intent_source`` / ``answer_source`` say whether Groq actually produced
    that part (``"groq"``), the deterministic fallback did (``"fallback"``),
    or the step does not apply (``"not_applicable"``, conversation mode) — so
    clients never mistake a template answer for an LLM one.
    """

    query: str
    mode: str = "recommendation"
    intent: FuelSearchIntentPublic | None = None
    intent_source: str = "fallback"
    answer_source: str = "fallback"
    needs_location: bool = False
    recommendations: list[AIRecommendation] = Field(default_factory=list)
    answer: str


# --------------------------------------------------------------------------- #
# Conversational assistant (Groq)
# --------------------------------------------------------------------------- #
class AIChatRequest(BaseModel):
    """Request body for ``POST /api/v1/ai/chat`` (general Groq Q&A)."""

    message: str = Field(min_length=1, max_length=1000)


class AIChatResponse(BaseModel):
    """Response of ``POST /api/v1/ai/chat``.

    ``answer_source`` is ``"groq"`` only when the model actually produced the
    text; a deterministic safety answer is always labelled ``"fallback"``.
    ``mode`` echoes the router's decision so a client can hand a station search
    to ``/ai/recommend`` instead of getting a chatty non-answer.
    """

    message: str
    answer: str
    answer_source: str = "fallback"
    mode: str = "conversation"
    model: str
