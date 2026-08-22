"""
``FuelType`` reference model.

A fuel type is a small, stable catalogue of the petroleum products retailed at
Nigerian filling stations. We model it as a reference table whose primary key
is the canonical product *code* (e.g. ``PMS``) rather than a surrogate id:

* The codes are the vocabulary used everywhere in the domain (API consumers,
  seed data, reports), so using them as the natural key keeps the data readable
  and removes a join for the overwhelmingly common lookup-by-code path.
* The catalogue changes very rarely, so the usual downsides of a mutable
  natural key do not apply.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:  # pragma: no cover - import guard for type checkers only
    from app.models.fuel_station_fuel_type import FuelStationFuelType


class FuelTypeCode(str, enum.Enum):
    """Canonical petroleum product codes used across the Nigerian downstream
    petroleum sector."""

    PMS = "PMS"  # Premium Motor Spirit (Petrol)
    AGO = "AGO"  # Automotive Gas Oil (Diesel)
    DPK = "DPK"  # Dual Purpose Kerosene (Household Kerosene)
    LPG = "LPG"  # Liquefied Petroleum Gas (Cooking Gas)
    CNG = "CNG"  # Compressed Natural Gas (autogas)

    @classmethod
    def codes(cls) -> set[str]:
        """Return the set of valid codes for cheap membership checks."""
        return {member.value for member in cls}


class FuelType(TimestampMixin, Base):
    """A petroleum product that can be sold at one or more stations."""

    __tablename__ = "fuel_types"
    __table_args__ = (
        # Defensive DB-level guard so only the canonical codes can ever land in
        # the table, even via a stray raw insert. The canonical list is also
        # enumerated in code (``FuelTypeCode``).
        CheckConstraint(
            "code IN ('PMS', 'AGO', 'DPK', 'LPG', 'CNG')",
            name="ck_fuel_types_code_domain",
        ),
    )

    code: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # Association objects -> ``FuelStationFuelType`` rows linking this product
    # to the stations that retail it.
    station_links: Mapped[list["FuelStationFuelType"]] = relationship(
        back_populates="fuel_type",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<FuelType code={self.code!r} name={self.name!r}>"
