"""
Admin dashboard API (Phase 9) — all endpoints require the Admin role.

Provides report moderation (see & transition every status), user management
(role / active flag) and platform analytics.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_roles
from app.core.database import get_db
from app.models import ReportStatus, UserRole
from app.schemas import (
    AnalyticsSummary,
    FuelReportAdmin,
    PaginatedAdminReports,
    PaginatedUsers,
    ReportStatusUpdate,
    UserPublic,
    UserUpdate,
)
from app.services import admin as admin_service

# Every route in this router requires an Admin user.
router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)


# --------------------------------------------------------------------------- #
# Reports moderation
# --------------------------------------------------------------------------- #
@router.get(
    "/reports", response_model=PaginatedAdminReports, summary="List all reports"
)
async def list_reports(
    db: Annotated[AsyncSession, Depends(get_db)],
    station_id: Annotated[Optional[uuid.UUID], Query()] = None,
    fuel_type_code: Annotated[Optional[str], Query(max_length=8)] = None,
    report_status: Annotated[Optional[ReportStatus], Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=admin_service.MAX_PAGE_SIZE)
    ] = admin_service.DEFAULT_PAGE_SIZE,
) -> PaginatedAdminReports:
    filters = admin_service.AdminReportFilters(
        station_id=station_id,
        fuel_type_code=fuel_type_code,
        status=report_status,
    )
    return await admin_service.list_all_reports(db, filters, page, page_size)


@router.patch(
    "/reports/{report_id}/status",
    response_model=FuelReportAdmin,
    summary="Set a report's status (verify / reject)",
)
async def set_report_status(
    report_id: uuid.UUID,
    payload: ReportStatusUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FuelReportAdmin:
    try:
        report = await admin_service.set_report_status(
            db,
            report_id,
            payload.status,
            reviewer=current_user,
            rejection_reason=payload.rejection_reason,
            reviewer_notes=payload.reviewer_notes,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fuel report not found")
    return report


# --------------------------------------------------------------------------- #
# User management
# --------------------------------------------------------------------------- #
@router.get("/users", response_model=PaginatedUsers, summary="List users")
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=admin_service.MAX_PAGE_SIZE)
    ] = admin_service.DEFAULT_PAGE_SIZE,
) -> PaginatedUsers:
    return await admin_service.list_users(db, page, page_size)


@router.patch(
    "/users/{user_id}",
    response_model=UserPublic,
    summary="Update a user's role / active flag",
)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserPublic:
    if payload.role is None and payload.is_active is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Provide a 'role' and/or 'is_active' to update.",
        )
    user = await admin_service.update_user(
        db, user_id, role=payload.role, is_active=payload.is_active
    )
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


# --------------------------------------------------------------------------- #
# Analytics
# --------------------------------------------------------------------------- #
@router.get("/analytics", response_model=AnalyticsSummary, summary="Platform analytics")
async def get_analytics(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnalyticsSummary:
    return await admin_service.get_analytics(db)
