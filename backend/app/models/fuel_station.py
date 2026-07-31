"""
``FuelStation`` model — the spatial core of the application.

Each station is stored with its geographic coordinates as a PostGIS
``geography(POINT, 4326)`` column. Using the ``geography`` type (rather than
``geometry``) means all distance/st_dwithin calculations are performed on the
sphere in metres, which is exactly what "stations within X metres of me" needs,
with no manual projection math.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import Boolean, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:  # pragma: no cover - import guard for type checkers only
    from app.models.fuel_station_fuel_type import FuelStationFuelType


class FuelStation(TimestampMixin, Base):
    """A physical filling station in Nigeria."""

    __tablename__ = "fuel_stations"
    __table_args__ = (
        # Prevent duplicate seed/import rows for the same station name within a
        # city. (name, city) is the natural business key we de-dupe on.
        UniqueConstraint("name", "city", name="uq_fuel_stations_name_city"),
        Index("ix_fuel_stations_state", "state"),
        Index("ix_fuel_stations_brand", "brand"),
        Index("ix_fuel_stations_city", "city"),
        Index("ix_fuel_stations_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # The operating brand e.g. "NNPC", "TotalEnergies", "Mobil", "Conoil".
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # PostGIS geography point — SRID 4326 (WGS 84, standard GPS coordinates).
    location: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="POINT", srid=4326),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # Association objects describing which fuel products this station offers.
    fuel_type_links: Mapped[list["FuelStationFuelType"]] = relationship(
        back_populates="station",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"<FuelStation name={self.name!r} brand={self.brand!r} "
            f"city={self.city!r}>"
        )
