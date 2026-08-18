"""
Fuel Intelligence API — Groq's two responsibilities.

``POST /ai/chat`` — CONVERSATIONAL Groq:

    general question -> Groq (grounded in the app's real capabilities)
                     -> natural-language answer (deterministic fallback)

``POST /ai/recommend`` — STATION SEARCH (runs the full pipeline server-side):

    natural-language query
        -> deterministic router (search vs. conversation)
        -> AI intent extraction (Groq, deterministic fallback)
        -> existing nearby station API (PostGIS)
        -> crowd-sourced price facts (fuel reports)
        -> deterministic ranking (never the LLM)
        -> AI explanation (Groq, facts-only; deterministic fallback)

    A message that is not a station search is answered conversationally by the
    same endpoint (``mode="conversation"``) so the single "Ask Fuel AI" input
    in the UI handles both without a second round-trip.

Safety properties:
* No AI secret ever leaves the server; the frontend only sees results.
* The LLM never queries the database and never picks the winner.
* A missing/invalid user location yields an honest "needs your location"
  answer for searches — no invented coordinates, no city-centroid fallbacks.
* AI provider failures degrade to the deterministic path (the feature keeps
  working) and are always labelled ``answer_source="fallback"``; database
  failures return 503 without touching the normal station finder.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.schemas import (
    AIChatRequest,
    AIChatResponse,
    AIRecommendRequest,
    AIRecommendResponse,
)
from app.services.ai import chat as chat_service
from app.services.ai import recommend as recommend_service

router = APIRouter(prefix="/ai", tags=["Fuel Intelligence"])


@router.post(
    "/chat",
    response_model=AIChatResponse,
    summary="Conversational answer from Groq (general questions about the app)",
)
async def chat(payload: AIChatRequest, response: Response) -> AIChatResponse:
    """Answer a general question with Groq — no station lookup, no location.

    This is the conversational half of the Groq responsibility. Station
    searches belong to ``POST /ai/recommend``; when the router detects one it
    is reported via ``mode="search"`` so the caller can send it there instead
    of receiving a chatty non-answer.

    ``answer_source`` is ``"groq"`` only when the model really answered; the
    deterministic safety answer is always labelled ``"fallback"``.
    """
    response.headers["Cache-Control"] = "no-store"

    mode = chat_service.classify_query(payload.message)
    answer, source = chat_service.answer_question(
        payload.message, locale=payload.locale
    )
    return AIChatResponse(
        message=payload.message,
        answer=answer,
        answer_source=source,
        mode=mode,
        model=settings.GROQ_MODEL,
    )


@router.post(
    "/recommend",
    response_model=AIRecommendResponse,
    summary="AI station recommendation from a natural-language request",
)
async def recommend(
    payload: AIRecommendRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIRecommendResponse:
    """Rank nearby stations for the user's request and explain the choice.

    The backend (nearby API + reports) remains the source of truth; the AI is
    only the intelligence layer. Groq unavailability degrades to the
    deterministic intent parser / template answers rather than failing.
    """
    # Location-specific result: never cache another city's answer on CDNs.
    response.headers["Cache-Control"] = "no-store"

    try:
        result = await recommend_service.recommend_stations(
            db,
            query=payload.query,
            latitude=payload.latitude,
            longitude=payload.longitude,
            locale=payload.locale,
        )
    except HTTPException:
        raise
    except Exception as exc:  # surface as a clean 503, never a crash
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The station database is temporarily unavailable. Please try again shortly.",
        ) from exc

    return AIRecommendResponse(**result)
