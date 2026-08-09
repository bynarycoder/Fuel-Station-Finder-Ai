"""
Pydantic v2 schemas for user favorites.
"""

from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel, Field


class FavoritePublic(BaseModel):
    """A single favorite. Station metadata is joined client-side from the
    already-loaded station catalogue, so the payload stays minimal."""

    id: uuid.UUID
    user_id: uuid.UUID
    station_id: uuid.UUID
    created_at: datetime.datetime


class FavoriteList(BaseModel):
    """The current user's favorites."""

    items: list[FavoritePublic]
    total: int = Field(ge=0)
