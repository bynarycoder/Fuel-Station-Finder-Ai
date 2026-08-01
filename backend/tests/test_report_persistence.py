"""
Persistence round-trip test for the fuel price report (the audit's headline
objective: "a fuel-finder with price reports").

The ``fuel_reports`` table has no PostGIS column, so it can be created directly
on SQLite and the ``price_per_litre`` value round-tripped — proving the price a
user submits is genuinely persisted (not mocked). Uses a column-level SELECT to
avoid triggering the model's eager (selectin) relationships, which would require
the geography-backed ``fuel_stations`` table.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models import FuelReport, QueueLength, ReportStatus


def test_price_report_is_persisted_and_roundtrips() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.tables["fuel_reports"].create(engine)

    report_id = uuid.uuid4()
    station_id = uuid.uuid4()
    user_id = uuid.uuid4()

    with Session(engine) as session:
        session.add(
            FuelReport(
                id=report_id,
                station_id=station_id,
                user_id=user_id,
                fuel_type_code="PMS",
                price_per_litre=Decimal("650.50"),
                queue_length=QueueLength.SHORT,
                notes="PMS available",
                status=ReportStatus.PENDING,
            )
        )
        session.commit()

    # Read back only scalar columns (no relationship loading).
    with Session(engine) as session:
        row = session.execute(
            select(
                FuelReport.price_per_litre,
                FuelReport.queue_length,
                FuelReport.status,
                FuelReport.fuel_type_code,
                FuelReport.station_id,
                FuelReport.user_id,
            ).where(FuelReport.id == report_id)
        ).one()

    assert row.price_per_litre == Decimal("650.50")
    assert row.queue_length == QueueLength.SHORT
    assert row.status == ReportStatus.PENDING
    assert row.fuel_type_code == "PMS"
    assert row.station_id == station_id
    assert row.user_id == user_id


def test_price_optional_when_other_fields_present() -> None:
    """A report with no price (queue-only) still persists — matches the
    backend's "at least one of price/queue/photo" rule."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.tables["fuel_reports"].create(engine)

    report_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            FuelReport(
                id=report_id,
                station_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                fuel_type_code="AGO",
                price_per_litre=None,
                queue_length=QueueLength.LONG,
                status=ReportStatus.PENDING,
            )
        )
        session.commit()

    with Session(engine) as session:
        price = session.execute(
            select(FuelReport.price_per_litre).where(FuelReport.id == report_id)
        ).scalar_one()
    assert price is None
