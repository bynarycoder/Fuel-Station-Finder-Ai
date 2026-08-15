"""
Fuel Intelligence API — data-driven AI station recommendations.

``POST /ai/recommend`` runs the full pipeline server-side:

    natural-language query
        -> AI intent extraction (Groq, deterministic fallback)
        -> existing nearby station API (PostGIS)
        -> crowd-sourced price facts (fuel reports)
        -> deterministic ranking (never the LLM)
        -> AI explanation (Groq, facts-only; deterministic fallback)

Safety properties:
* No AI secret ever leaves the server; the frontend only sees results.
* The LLM never queries the database and never picks the winner.
* A missing/invalid user location yields an honest "needs your location"
  answer — no invented coordinates, no city-centroid fallbacks.
* AI provider failures degrade to the deterministic path (the feature keeps
  working); database failures return 503 without touching the normal station
  finder.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import AIRecommendRequest, AIRecommendResponse
from app.services.ai import recommend as recommend_service

router = APIRouter(prefix="/ai", tags=["Fuel Intelligence"])


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
        )
    except HTTPException:
        raise
    except Exception as exc:  # surface as a clean 503, never a crash
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The station database is temporarily unavailable. Please try again shortly.",
        ) from exc

    return AIRecommendResponse(**result)
