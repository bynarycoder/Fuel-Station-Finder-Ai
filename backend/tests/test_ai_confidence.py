"""
Unit tests for AI-confidence persistence (Phase 9/10).

The Gemini score must survive the verification flow: ``mark_report_verified``
stores it, and ``report_to_public`` exposes it — without re-running the model.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import lazyload
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models import FuelReport, QueueLength, ReportStatus
from app.services.reports import mark_report_verified, report_to_public


def test_mark_report_verified_persists_confidence_score() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    asyncio.run(_run_roundtrip(engine))


async def _run_roundtrip(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.tables["fuel_reports"].create(sync_conn)
        )

    factory = async_sessionmaker(engine, expire_on_commit=False)
    report_id = uuid.uuid4()

    async with factory() as session:
        session.add(
            FuelReport(
                id=report_id,
                station_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                fuel_type_code="PMS",
                price_per_litre=Decimal("650.00"),
                status=ReportStatus.PENDING,
            )
        )
        await session.commit()

    async with factory() as session:
        # lazyload("*") suppresses the model's eager (selectin) relationships,
        # which would need the PostGIS fuel_stations table unavailable on SQLite.
        loaded = (
            await session.execute(
                select(FuelReport)
                .options(lazyload("*"))
                .where(FuelReport.id == report_id)
            )
        ).scalar_one()
        # Simulate the verify endpoint promoting the report with a Gemini score.
        await mark_report_verified(session, loaded, ai_confidence_score=0.87)

    # Read back scalar columns only — the model's eager `station` relationship
    # would require the PostGIS table, which SQLite does not have.
    async with factory() as session:
        row = (
            await session.execute(
                select(
                    FuelReport.status,
                    FuelReport.verified_at,
                    FuelReport.ai_confidence_score,
                ).where(FuelReport.id == report_id)
            )
        ).one()
        assert row.status == ReportStatus.VERIFIED
        assert row.verified_at is not None
        assert float(row.ai_confidence_score) == 0.87  # type: ignore[arg-type]
    await engine.dispose()


def test_report_to_public_includes_ai_confidence_score() -> None:
    report = FuelReport(
        id=uuid.uuid4(),
        station_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        fuel_type_code="PMS",
        price_per_litre=Decimal("650.00"),
        queue_length=QueueLength.SHORT,
        status=ReportStatus.VERIFIED,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        ai_confidence_score=Decimal("0.93"),
    )
    # Populate the eager-loaded relationships with lightweight stand-ins.
    report.station = SimpleNamespace(id=uuid.uuid4(), name="Test Station", brand="NNPC")
    report.reported_by = SimpleNamespace(id=uuid.uuid4(), full_name="Ada")
    report.fuel_type = SimpleNamespace(code="PMS", name="Premium Motor Spirit")

    public = report_to_public(report)
    assert public["ai_confidence_score"] == 0.93

    # Null when no AI verification has run.
    report.ai_confidence_score = None
    assert report_to_public(report)["ai_confidence_score"] is None
