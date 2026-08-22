"""
Favorites API — authenticated user's saved stations.

* `GET    /favorites`            — list my favorites
* `PUT    /favorites/{station}`  — add a favorite (idempotent)
* `DELETE /favorites/{station}`  — remove a favorite (idempotent)

Every route requires a valid Supabase JWT; the user is always resolved from
the token, so users can only ever see/manage their OWN favorites.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.schemas import FavoriteList, FavoritePublic
from app.services import favorites as favorite_service

router = APIRouter(prefix="/favorites", tags=["Favorites"])


@router.get(
    "",
    response_model=FavoriteList,
    summary="List the current user's favorite stations",
)
async def list_favorites(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FavoriteList:
    items = await favorite_service.list_favorites(db, current_user)
    return FavoriteList(items=items, total=len(items))


@router.put(
    "/{station_id}",
    response_model=FavoritePublic,
    summary="Add a station to favorites (idempotent)",
)
async def add_favorite(
    station_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FavoritePublic:
    try:
        return await favorite_service.add_favorite(db, current_user, station_id)
    except favorite_service.StationNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.delete(
    "/{station_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a station from favorites (idempotent)",
)
async def remove_favorite(
    station_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await favorite_service.remove_favorite(db, current_user, station_id)
