"""
Fuel report data-access and business logic (Phase 6 + 7).

Pure query *builders* (testable via SQL compilation without a DB) plus async
executors. **Reads are public** (community feed): they always exclude rejected
reports, which are only surfaced to admins via the admin dashboard (Phase 9).
Report *submission* still requires an authenticated user.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FuelReport,
    FuelStation,
    FuelType,
    QueueLength,
    ReportStatus,
    User,
)

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class StationNotFound(Exception):
    """Raised when a report references a station that does not exist."""


@dataclass(frozen=True)
class ReportFilters:
    station_id: uuid.UUID | None = None
    fuel_type_code: str | None = None
    status: ReportStatus | None = None


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #
def report_to_public(report: FuelReport) -> dict[str, Any]:
    """Map a report ORM object to a response dict (pure)."""
    return {
        "id": report.id,
        "station": {
            "id": report.station.id,
            "name": report.station.name,
            "brand": report.station.brand,
        },
        "reported_by": {
            "id": report.reported_by.id,
            "full_name": report.reported_by.full_name,
        },
        "fuel_type": {
            "code": report.fuel_type.code,
            "name": report.fuel_type.name,
        },
        "price_per_litre": (
            float(report.price_per_litre)
            if report.price_per_litre is not None
            else None
        ),
        "queue_length": report.queue_length,
        "photo_url": report.photo_url,
        "notes": report.notes,
        "status": report.status,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
    }


# --------------------------------------------------------------------------- #
# Query builders (pure)
# --------------------------------------------------------------------------- #
_REPORT_EAGER = (
    joinedload(FuelReport.station),
    joinedload(FuelReport.reported_by),
    joinedload(FuelReport.fuel_type),
)


def _apply_filters(stmt: Select, filters: ReportFilters) -> Select:
    if filters.station_id is not None:
        stmt = stmt.where(FuelReport.station_id == filters.station_id)
    if filters.fuel_type_code is not None:
        stmt = stmt.where(FuelReport.fuel_type_code == filters.fuel_type_code)
    if filters.status is not None:
        stmt = stmt.where(FuelReport.status == filters.status)
    return stmt


def _exclude_rejected(stmt: Select) -> Select:
    """The public feed never exposes rejected reports."""
    return stmt.where(FuelReport.status != ReportStatus.REJECTED)


def build_list_query(
    filters: ReportFilters, offset: int, limit: int
) -> Select:
    stmt = (
        select(FuelReport)
        .options(*_REPORT_EAGER)
        .order_by(desc(FuelReport.created_at), desc(FuelReport.id))
        .offset(offset)
        .limit(limit)
    )
    stmt = _apply_filters(stmt, filters)
    return _exclude_rejected(stmt)


def build_count_query(filters: ReportFilters) -> Select:
    stmt = _apply_filters(select(func.count(FuelReport.id)), filters)
    return _exclude_rejected(stmt)


def build_get_query(report_id: Any) -> Select:
    return select(FuelReport).options(*_REPORT_EAGER).where(FuelReport.id == report_id)


# --------------------------------------------------------------------------- #
# Async executors
# --------------------------------------------------------------------------- #
async def list_reports(
    db: AsyncSession,
    filters: ReportFilters,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    rows = (
        await db.execute(build_list_query(filters, offset, page_size))
    ).scalars().all()
    items = [report_to_public(report) for report in rows]
    total = (await db.execute(build_count_query(filters))).scalar_one()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def get_report(db: AsyncSession, report_id: Any) -> dict[str, Any] | None:
    report = (
        await db.execute(build_get_query(report_id))
    ).scalar_one_or_none()
    if report is None:
        return None
    # Hide rejected reports from the public feed (rendered as a 404).
    if report.status == ReportStatus.REJECTED:
        return None
    return report_to_public(report)


async def create_report(
    db: AsyncSession,
    user: User,
    *,
    station_id: uuid.UUID,
    fuel_type_code: str,
    price_per_litre: Decimal | None,
    queue_length: QueueLength | None,
    notes: str | None,
    photo_url: str | None,
) -> dict[str, Any]:
    """Validate and persist a new report (status defaults to PENDING)."""
    station = await db.get(FuelStation, station_id)
    if station is None:
        raise StationNotFound(f"Station {station_id} not found")

    fuel_type = await db.get(FuelType, fuel_type_code)
    if fuel_type is None:
        raise ValueError(f"Unknown fuel type code: {fuel_type_code}")

    if price_per_litre is None and queue_length is None and not photo_url:
        raise ValueError(
            "A report must include at least a price, a queue length, or a photo."
        )

    report = FuelReport(
        station_id=station_id,
        user_id=user.id,
        fuel_type_code=fuel_type_code,
        price_per_litre=price_per_litre,
        queue_length=queue_length,
        photo_url=photo_url,
        notes=notes,
        status=ReportStatus.PENDING,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report_to_public(report)
