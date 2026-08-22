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
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import Select

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
    """Map a report ORM object to a response dict (pure, public-safe)."""
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
        "ai_confidence_score": (
            float(report.ai_confidence_score)
            if report.ai_confidence_score is not None
            else None
        ),
        "reviewed_at": report.reviewed_at,
        "rejection_reason": report.rejection_reason,
    }


def report_to_admin(report: FuelReport) -> dict[str, Any]:
    """Map a report ORM object for the moderation dashboard.

    Extends the public view with the reviewer's identity and moderation-only
    notes; never used by public endpoints.
    """
    data = report_to_public(report)
    reviewer = report.reviewer
    data["reviewed_by"] = (
        {"id": reviewer.id, "full_name": reviewer.full_name}
        if reviewer is not None
        else None
    )
    data["reviewer_notes"] = report.reviewer_notes
    return data


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
    # Hide rejected reports from the public feed (rendered as 404).
    if report.status == ReportStatus.REJECTED:
        return None
    return report_to_public(report)


async def list_my_reports(
    db: AsyncSession, user_id: uuid.UUID, page: int = 1, page_size: int = 50
) -> dict[str, Any]:
    """The current user's own reports — **every** status, including rejected.

    This is the submitter's window into the verification workflow: pending
    reports show "awaiting verification", rejected reports include the
    reviewer's ``rejection_reason``. Never returns another user's reports.
    """
    base = select(FuelReport).options(*_REPORT_EAGER).where(
        FuelReport.user_id == user_id
    )
    total = (
        await db.execute(select(func.count(FuelReport.id)).where(FuelReport.user_id == user_id))
    ).scalar_one()
    rows = (
        await db.execute(
            base.order_by(desc(FuelReport.created_at), desc(FuelReport.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    items = [report_to_public(report) for report in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def latest_prices_by_station(
    db: AsyncSession,
    station_ids: list[str],
    fuel_type_code: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Latest non-rejected price reports per (station, fuel type).

    Powers the AI recommendation ranking: prices are always *reported* facts,
    never invented. Returns ``{station_id: [entries newest-first]}`` where each
    entry carries ``fuel_type_code``, ``price_per_litre``, ``status`` and
    ``created_at``. Stations without price reports are simply absent.
    """
    if not station_ids:
        return {}

    # Station ids arrive as strings from the service layer; bind as UUIDs so
    # the comparison works against the real UUID column on Postgres while
    # the portable test schema (String) still accepts them via str().
    ids = [uuid.UUID(str(station_id)) for station_id in station_ids]

    stmt = (
        select(FuelReport)
        .options(joinedload(FuelReport.fuel_type))
        .where(FuelReport.station_id.in_(ids))
        .where(FuelReport.price_per_litre.is_not(None))
        .order_by(desc(FuelReport.created_at), desc(FuelReport.id))
    )
    stmt = _exclude_rejected(stmt)
    if fuel_type_code:
        stmt = stmt.where(FuelReport.fuel_type_code == fuel_type_code)

    rows = (await db.execute(stmt)).scalars().all()

    price_map: dict[str, list[dict[str, Any]]] = {}
    seen: set[tuple[str, str]] = set()
    for report in rows:
        key = (str(report.station_id), report.fuel_type_code)
        if key in seen:
            continue  # rows are newest-first: first per (station, fuel) wins
        seen.add(key)
        price_map.setdefault(str(report.station_id), []).append(
            {
                "fuel_type_code": report.fuel_type_code,
                "price_per_litre": float(report.price_per_litre),
                "status": str(report.status.value),
                "created_at": report.created_at,
            }
        )
    return price_map


async def get_report_for_verification(
    db: AsyncSession, report_id: Any
) -> FuelReport | None:
    """Fetch the raw ORM report (for AI verification), without hiding rules."""
    return await db.get(FuelReport, report_id)


async def claim_pending_report_for_auto_verify(
    db: AsyncSession, report_id: Any
) -> FuelReport | None:
    """Atomically claim a PENDING, unscored report for background Gemini.

    ``UPDATE ... WHERE status=pending AND ai_confidence_score IS NULL`` so a
    concurrent admin verify / second worker cannot both start Gemini. Returns
    the claimed row, or ``None`` if another path already took it.
    """
    result = await db.execute(
        update(FuelReport)
        .where(FuelReport.id == report_id)
        .where(FuelReport.status == ReportStatus.PENDING)
        .where(FuelReport.ai_confidence_score.is_(None))
        .where(FuelReport.photo_url.is_not(None))
        .values(status=ReportStatus.UNDER_REVIEW)
    )
    if result.rowcount != 1:
        await db.rollback()
        return None
    await db.commit()
    return await db.get(FuelReport, report_id)


async def release_auto_verify_claim(db: AsyncSession, report: FuelReport) -> None:
    """Return a failed auto-verify claim to PENDING so admin retry still works."""
    if report.status == ReportStatus.UNDER_REVIEW and report.ai_confidence_score is None:
        report.status = ReportStatus.PENDING
        await db.commit()


async def mark_report_verified(
    db: AsyncSession, report: FuelReport, ai_confidence_score: float | None = None
) -> None:
    """Promote a report to verified and stamp the verification time.

    ``ai_confidence_score`` (0..1, from Gemini) is persisted alongside so the
    UI can surface the numeric AI confidence for the report.
    """
    report.status = ReportStatus.VERIFIED
    report.verified_at = datetime.now(timezone.utc)
    if ai_confidence_score is not None:
        report.ai_confidence_score = ai_confidence_score
    await db.commit()


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
