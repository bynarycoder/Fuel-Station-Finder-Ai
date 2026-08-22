"""
``Favorite`` model — a user's saved station (Phase: Favorites).

A favorite is a thin, authenticated join between a ``User`` and a
``FuelStation``. Ownership is enforced at every layer:

* the API resolves the current user from the Supabase JWT and only ever
  reads/writes rows for that user;
* the database enforces uniqueness per (user, station) so duplicates are
  impossible;
* Supabase/Postgres RLS (``supabase/rls_favorites.sql``) mirrors the same rule
  for any direct client access to the table.

Favorites are keyed by the station UUID; station metadata is joined at read
time by the frontend from the already-loaded station catalogue, so this table
stays minimal.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class Favorite(TimestampMixin, Base):
    """A single user↔station favorite link."""

    __tablename__ = "favorites"
    __table_args__ = (
        # One favorite per (user, station) — duplicates are rejected at the DB.
        UniqueConstraint("user_id", "station_id", name="uq_favorites_user_station"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    station_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fuel_stations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"<Favorite id={self.id!s} user_id={self.user_id!s} "
            f"station_id={self.station_id!s}>"
        )
