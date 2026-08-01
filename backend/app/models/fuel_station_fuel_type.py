"""
``FuelStationFuelType`` — the many-to-many association between stations and the
fuel products they retail.

We use the explicit *association object* pattern (a real table + a real model)
rather than a bare ``secondary=`` table so the link can be queried and managed
directly and can later gain its own columns (e.g. cached pump price) without a
schema redesign.

Scope note (phase discipline): for Phase 2 this link captures only the
structural catalog fact "station X sells product Y". Time-series metrics such as
*price*, *queue length* and *live availability* arrive with the Fuel Reports
engine in a later phase and are intentionally not modelled here yet.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:  # pragma: no cover - import guard for type checkers only
    from app.models.fuel_station import FuelStation
    from app.models.fuel_type import FuelType


class FuelStationFuelType(TimestampMixin, Base):
    """Catalog entry stating that a given station offers a given fuel product."""

    __tablename__ = "fuel_station_fuel_types"
    __table_args__ = (
        # Composite primary key: a station offers a product at most once.
        PrimaryKeyConstraint("station_id", "fuel_type_code"),
    )

    station_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fuel_stations.id", ondelete="CASCADE"),
        nullable=False,
    )
    fuel_type_code: Mapped[str] = mapped_column(
        ForeignKey("fuel_types.code", ondelete="CASCADE"),
        nullable=False,
    )

    station: Mapped["FuelStation"] = relationship(
        back_populates="fuel_type_links"
    )
    fuel_type: Mapped["FuelType"] = relationship(
        back_populates="station_links"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"<FuelStationFuelType station_id={self.station_id!s} "
            f"fuel_type_code={self.fuel_type_code!r}>"
        )
