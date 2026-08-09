"""
Favorites data-access and business logic.

Ownership model: favorites are always scoped to the authenticated user from
the request context — there is no way to read or write another user's rows
through this service. Uniqueness is enforced by the ``(user_id, station_id)``
unique constraint (and mirrored by Supabase RLS for direct client access).

Station existence is enforced by the ``fuel_stations`` foreign key: an insert
for an unknown station raises ``IntegrityError`` on Postgres, which we map to
``StationNotFound``. This keeps the service independent of the PostGIS column
(so it stays testable on SQLite) while remaining production-safe.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Favorite, User


class StationNotFound(Exception):
    """Raised when a favorite references a station that does not exist."""


def favorite_to_public(favorite: Favorite) -> dict[str, Any]:
    """Map a favorite ORM object to a response dict (pure)."""
    return {
        "id": favorite.id,
        "user_id": favorite.user_id,
        "station_id": favorite.station_id,
        "created_at": favorite.created_at,
    }


async def list_favorites(db: AsyncSession, user: User) -> list[dict[str, Any]]:
    """All of the current user's favorites, newest first."""
    rows = (
        await db.execute(
            select(Favorite)
            .where(Favorite.user_id == user.id)
            .order_by(Favorite.created_at.desc(), Favorite.id.desc())
        )
    ).scalars().all()
    return [favorite_to_public(f) for f in rows]


async def add_favorite(
    db: AsyncSession, user: User, station_id: uuid.UUID
) -> dict[str, Any]:
    """Add a station to the user's favorites. Idempotent: adding an existing
    favorite returns the existing row. Raises ``StationNotFound`` when the
    station does not exist."""
    favorite = Favorite(user_id=user.id, station_id=station_id)
    db.add(favorite)
    try:
        await db.commit()
    except IntegrityError:
        # Either the station does not exist (FK) or the favorite already
        # exists (unique constraint). Distinguish the two.
        await db.rollback()
        existing = (
            await db.execute(
                select(Favorite).where(
                    Favorite.user_id == user.id,
                    Favorite.station_id == station_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return favorite_to_public(existing)
        raise StationNotFound(f"Station {station_id} not found") from None
    await db.refresh(favorite)
    return favorite_to_public(favorite)


async def remove_favorite(
    db: AsyncSession, user: User, station_id: uuid.UUID
) -> bool:
    """Remove a favorite. Returns True when a row was deleted, False when the
    user had no such favorite (idempotent)."""
    result = await db.execute(
        delete(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.station_id == station_id,
        )
    )
    await db.commit()
    return result.rowcount > 0
