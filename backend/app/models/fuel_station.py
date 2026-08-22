"""
``FuelStation`` model — the spatial core of the application.

Each station is stored with its geographic coordinates as a PostGIS
``geography(POINT, 4326)`` column. Using the ``geography`` type (rather than
``geometry``) means all distance/st_dwithin calculations are performed on the
sphere in metres, which is exactly what "stations within X metres of me" needs,
with no manual projection math.

**Provenance.** Every row carries a ``data_source`` (where the record came
from) and a ``verification_status`` (whether the record has been independently
verified). Seed/demo rows are ``seed`` + ``unverified`` — the application never
presents them as a verified live registry. ``source_id`` holds an optional
external identifier (e.g. a regulator or partner dataset primary key) so
imports can be deduplicated against the source of truth.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:  # pragma: no cover - import guard for type checkers only
    from app.models.fuel_station_fuel_type import FuelStationFuelType


class StationDataSource(str, enum.Enum):
    """Where a station record came from.

    ``seed`` rows are the built-in demo catalogue (labelled ``(Demo)`` in the
    nationwide seed data) and must never be presented as verified real-world
    data. ``official``/``government``/``partner``/``imported`` rows are records
    captured from (or imported from) authoritative or partner sources.
    ``community`` rows originate from user submissions.
    """

    SEED = "seed"
    OFFICIAL = "official"
    GOVERNMENT = "government"
    PARTNER = "partner"
    COMMUNITY = "community"
    IMPORTED = "imported"
    OTHER = "other"


class StationVerificationStatus(str, enum.Enum):
    """Independent verification state of a *station record*.

    Distinct from ``FuelReport.status`` (which tracks a user report's
    lifecycle): this describes whether the catalogue row itself has been
    checked. Seed data is ``unverified`` by default.
    """

    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


def _portable_enum(enum_class: type[enum.Enum], name: str, length: int = 20):
    """A portable (non-native) enum column stored as VARCHAR + CHECK, keyed by
    the lowercase enum *values* (mirrors ``fuel_report.py``)."""
    return SAEnum(
        enum_class,
        native_enum=False,
        length=length,
        create_constraint=True,
        name=name,
        values_callable=lambda role_enum: [member.value for member in role_enum],
    )


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
        Index("ix_fuel_stations_data_source", "data_source"),
        Index("ix_fuel_stations_verification_status", "verification_status"),
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

    # ------------------------------------------------------------------ #
    # Provenance (added in migration 0009). Seed rows default to
    # ``seed`` / ``unverified``; nothing in the app treats them as verified.
    # ------------------------------------------------------------------ #
    data_source: Mapped[StationDataSource] = mapped_column(
        _portable_enum(StationDataSource, "ck_fuel_stations_data_source", length=20),
        nullable=False,
        default=StationDataSource.SEED,
        server_default=StationDataSource.SEED.value,
    )
    verification_status: Mapped[StationVerificationStatus] = mapped_column(
        _portable_enum(
            StationVerificationStatus,
            "ck_fuel_stations_verification_status",
            length=20,
        ),
        nullable=False,
        default=StationVerificationStatus.UNVERIFIED,
        server_default=StationVerificationStatus.UNVERIFIED.value,
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Optional external identifier (regulator/partner dataset primary key).
    source_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

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
