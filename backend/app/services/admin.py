"""
Admin operations (Phase 9): report moderation, user management and analytics.

All executors are intended to sit behind an Admin-only router. Unlike the public
reports feed, the admin report list shows **every** status (including rejected).
The query *builders* are pure so they can be validated via SQL compilation
without a live database; the users operations work on the geography-free
``users`` table and are therefore executable in the SQLite test suite.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FuelReport,
    FuelStation,
    QueueLength,
    ReportStatus,
    User,
    UserRole,
)
from app.services.reports import report_to_admin

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


@dataclass(frozen=True)
class AdminReportFilters:
    station_id: uuid.UUID | None = None
    fuel_type_code: str | None = None
    status: ReportStatus | None = None


# --------------------------------------------------------------------------- #
# Report moderation
# --------------------------------------------------------------------------- #
_REPORT_EAGER = (
    joinedload(FuelReport.station),
    joinedload(FuelReport.reported_by),
    joinedload(FuelReport.fuel_type),
)


def _apply_report_filters(stmt: Select, filters: AdminReportFilters) -> Select:
    if filters.station_id is not None:
        stmt = stmt.where(FuelReport.station_id == filters.station_id)
    if filters.fuel_type_code is not None:
        stmt = stmt.where(FuelReport.fuel_type_code == filters.fuel_type_code)
    if filters.status is not None:
        stmt = stmt.where(FuelReport.status == filters.status)
    return stmt


def build_admin_report_list_query(
    filters: AdminReportFilters, offset: int, limit: int
) -> Select:
    """All reports (every status), newest-first — for the moderation panel."""
    stmt = (
        select(FuelReport)
        .options(*_REPORT_EAGER)
        .order_by(desc(FuelReport.created_at), desc(FuelReport.id))
        .offset(offset)
        .limit(limit)
    )
    return _apply_report_filters(stmt, filters)


def build_admin_report_count_query(filters: AdminReportFilters) -> Select:
    return _apply_report_filters(select(func.count(FuelReport.id)), filters)


def build_admin_report_get_query(report_id: Any) -> Select:
    return select(FuelReport).options(*_REPORT_EAGER).where(FuelReport.id == report_id)


async def list_all_reports(
    db: AsyncSession,
    filters: AdminReportFilters,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    rows = (
        await db.execute(build_admin_report_list_query(filters, offset, page_size))
    ).scalars().all()
    items = [report_to_admin(report) for report in rows]
    total = (await db.execute(build_admin_report_count_query(filters))).scalar_one()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def set_report_status(
    db: AsyncSession,
    report_id: Any,
    status: ReportStatus,
    *,
    reviewer: User,
    rejection_reason: str | None = None,
    reviewer_notes: str | None = None,
) -> dict[str, Any] | None:
    """Transition a report's status and stamp the reviewer + decision time.

    Rules:
    * ``rejected`` **requires** ``rejection_reason`` so the submitter always
      learns why the report was not accepted (ValueError otherwise).
    * Any decision sets ``reviewed_by``/``reviewed_at``; ``verified`` also
      stamps ``verified_at``; moving back to ``pending``/``under_review``
      clears the decision stamps.
    * The report row is never deleted and its submission fields are never
      modified — reports are immutable evidence; current state is derived.

    Returns the updated report (admin-mapped) or None if it does not exist.
    """
    if status == ReportStatus.REJECTED and not (rejection_reason or "").strip():
        raise ValueError(
            "A rejection reason is required when rejecting a report."
        )

    report = await db.get(FuelReport, report_id)
    if report is None:
        return None

    report.status = status
    report.reviewed_by = reviewer.id
    report.reviewed_at = datetime.now(timezone.utc)
    if rejection_reason is not None:
        report.rejection_reason = rejection_reason.strip() or None
    if reviewer_notes is not None:
        report.reviewer_notes = reviewer_notes.strip() or None

    if status == ReportStatus.VERIFIED:
        report.verified_at = datetime.now(timezone.utc)
    elif status == ReportStatus.REJECTED:
        report.verified_at = None
    else:
        # Back to pending/under_review: the decision is no longer final.
        report.verified_at = None
        report.rejection_reason = None

    await db.commit()

    # The session identity map may still hold the pre-update instance (the app
    # session uses expire_on_commit=False), including a stale ``reviewer``
    # relationship loaded while ``reviewed_by`` was NULL. Refresh so the
    # response reflects the freshly stamped decision.
    await db.refresh(report)

    refreshed = (
        await db.execute(build_admin_report_get_query(report_id))
    ).scalar_one()
    return report_to_admin(refreshed)


# --------------------------------------------------------------------------- #
# User management
# --------------------------------------------------------------------------- #
def user_to_public(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


async def list_users(
    db: AsyncSession, page: int, page_size: int
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            select(User)
            .order_by(User.created_at.desc(), User.email)
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()
    items = [user_to_public(user) for user in rows]
    total = (await db.execute(select(func.count(User.id)))).scalar_one()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def update_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    role: UserRole | None = None,
    is_active: bool | None = None,
) -> dict[str, Any] | None:
    user = await db.get(User, user_id)
    if user is None:
        return None
    if role is not None:
        user.role = role
    if is_active is not None:
        user.is_active = is_active
    await db.commit()
    await db.refresh(user)
    return user_to_public(user)


# --------------------------------------------------------------------------- #
# Analytics
# --------------------------------------------------------------------------- #
def build_station_counts_query() -> Select:
    return select(
        func.count(FuelStation.id).label("total"),
        func.sum(case((FuelStation.is_active.is_(True), 1), else_=0)).label("active"),
    )


def build_reports_by_status_query() -> Select:
    return (
        select(FuelReport.status, func.count(FuelReport.id))
        .group_by(FuelReport.status)
    )


def build_users_by_role_query() -> Select:
    return select(User.role, func.count(User.id)).group_by(User.role)


def build_total_reports_query() -> Select:
    return select(func.count(FuelReport.id))


async def get_analytics(db: AsyncSession) -> dict[str, Any]:
    stations_total, stations_active = (await db.execute(build_station_counts_query())).one()
    reports_total = (await db.execute(build_total_reports_query())).scalar_one()

    by_status_rows = (await db.execute(build_reports_by_status_query())).all()
    reports_by_status = {row[0].value: row[1] for row in by_status_rows}

    by_role_rows = (await db.execute(build_users_by_role_query())).all()
    users_by_role = {row[0].value: row[1] for row in by_role_rows}

    users_total = sum(users_by_role.values())

    return {
        "stations": {
            "total": int(stations_total or 0),
            "active": int(stations_active or 0),
        },
        "reports": {
            "total": int(reports_total or 0),
            "by_status": {
                "pending": reports_by_status.get(ReportStatus.PENDING.value, 0),
                "verified": reports_by_status.get(ReportStatus.VERIFIED.value, 0),
                "rejected": reports_by_status.get(ReportStatus.REJECTED.value, 0),
            },
        },
        "users": {
            "total": users_total,
            "by_role": {
                "driver": users_by_role.get(UserRole.DRIVER.value, 0),
                "station_manager": users_by_role.get(UserRole.STATION_MANAGER.value, 0),
                "admin": users_by_role.get(UserRole.ADMIN.value, 0),
            },
        },
    }


# Re-export for callers / tests.
__all__ = [
    "AdminReportFilters",
    "DEFAULT_PAGE_SIZE",
    "MAX_PAGE_SIZE",
    "QueueLength",
    "ReportStatus",
    "build_admin_report_count_query",
    "build_admin_report_get_query",
    "build_admin_report_list_query",
    "build_reports_by_status_query",
    "build_station_counts_query",
    "build_total_reports_query",
    "build_users_by_role_query",
    "get_analytics",
    "list_all_reports",
    "list_users",
    "set_report_status",
    "update_user",
    "user_to_public",
]
