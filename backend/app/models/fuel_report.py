"""
``FuelReport`` model — crowd-sourced station reports (Phase 6).

A report is a single user-submitted observation about a station: the product
(``fuel_type_code``), an optional price, an optional queue length, an optional
photo, and free-text notes. Reports start ``PENDING`` and are later verified or
rejected (the AI/admin verification flow arrives in Phases 8 & 9); the
``status`` column is introduced now so the submission lifecycle is captured from
day one.

Design notes:
* Both ``price_per_litre`` and ``queue_length`` are optional — a report might be
  price-only, queue-only, or include a photo. The API enforces "at least one
  meaningful field".
* Enums use ``native_enum=False`` (portable VARCHAR + CHECK) so the schema works
  on the test-suite's SQLite as well as Postgres, mirroring ``UserRole``.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:  # pragma: no cover - type-checker import guard
    from app.models.fuel_station import FuelStation
    from app.models.fuel_type import FuelType
    from app.models.user import User


class ReportStatus(str, enum.Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    REJECTED = "rejected"


class QueueLength(str, enum.Enum):
    NONE = "none"      # No queue / no wait
    SHORT = "short"    # Short queue (~ a few minutes)
    MEDIUM = "medium"  # Moderate queue
    LONG = "long"      # Long queue


def _portable_enum(enum_class: type[enum.Enum], name: str, length: int = 20):
    """A portable (non-native) enum column stored as VARCHAR + CHECK, keyed by
    the lowercase enum *values*."""
    return SAEnum(
        enum_class,
        native_enum=False,
        length=length,
        create_constraint=True,
        name=name,
        values_callable=lambda role_enum: [member.value for member in role_enum],
    )


class FuelReport(TimestampMixin, Base):
    """A crowd-sourced report about fuel at a station."""

    __tablename__ = "fuel_reports"
    __table_args__ = (
        Index("ix_fuel_reports_station_id", "station_id"),
        Index("ix_fuel_reports_user_id", "user_id"),
        Index("ix_fuel_reports_status", "status"),
        Index("ix_fuel_reports_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    station_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fuel_stations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    fuel_type_code: Mapped[str] = mapped_column(
        String(8),
        ForeignKey("fuel_types.code", ondelete="CASCADE"),
        nullable=False,
    )

    price_per_litre: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    queue_length: Mapped[QueueLength | None] = mapped_column(
        _portable_enum(QueueLength, "ck_fuel_reports_queue_length", length=12),
        nullable=True,
    )
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ReportStatus] = mapped_column(
        _portable_enum(ReportStatus, "ck_fuel_reports_status"),
        nullable=False,
        default=ReportStatus.PENDING,
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Gemini verification score (0..1) from the AI verify endpoint, persisted so
    # the UI can show "AI confidence" without re-running the model. NULL until
    # an AI verification has been performed on the report's photo.
    ai_confidence_score: Mapped[float | None] = mapped_column(
        Numeric(4, 3), nullable=True
    )

    # Reviewer workflow (added in migration 0010): who decided, when, and why.
    # ``rejection_reason`` is intentionally public-safe (shown to the submitter
    # so they understand why the report was not accepted); ``reviewer_notes``
    # is for the moderation team and is only exposed through admin endpoints.
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    station: Mapped["FuelStation"] = relationship(lazy="selectin")
    reported_by: Mapped["User"] = relationship(
        lazy="selectin", foreign_keys=[user_id]
    )
    reviewer: Mapped["User | None"] = relationship(
        lazy="selectin", foreign_keys=[reviewed_by]
    )
    fuel_type: Mapped["FuelType"] = relationship(lazy="selectin")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"<FuelReport id={self.id!s} station_id={self.station_id!s} "
            f"fuel_type_code={self.fuel_type_code!r} status={self.status!r}>"
        )
