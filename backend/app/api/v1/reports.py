"""
Fuel Reports API (Phase 6) — submit and browse crowd-sourced reports.

* `POST /reports` accepts multipart/form-data: the report fields plus an optional
  `photo` image upload. Any authenticated user may submit.
* `GET /reports` and `GET /reports/{id}` list/fetch reports; rejected reports are
  hidden from non-admins.

Report *verification* (status transitions, AI scoring) is a later phase — here we
only capture submissions (status defaults to PENDING).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.models import QueueLength, ReportStatus
from app.schemas import FuelReportPublic, PaginatedReports
from app.services import reports as report_service
from app.services.storage import ImageStorage, get_image_storage

router = APIRouter(prefix="/reports", tags=["Fuel Reports"])


@router.post(
    "",
    response_model=FuelReportPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a fuel report (optionally with a photo)",
)
async def create_report(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[ImageStorage, Depends(get_image_storage)],
    station_id: Annotated[uuid.UUID, Form(description="The station being reported")],
    fuel_type_code: Annotated[str, Form(max_length=8, description="PMS/AGO/DPK/LPG")],
    price_per_litre: Annotated[Optional[Decimal], Form(description="Naira per litre")] = None,
    queue_length: Annotated[Optional[QueueLength], Form()] = None,
    notes: Annotated[Optional[str], Form(max_length=1000)] = None,
    photo: Annotated[Optional[UploadFile], File(description="Station/queue photo (JPEG/PNG/WebP)")] = None,
) -> FuelReportPublic:
    # Persist the upload first so its URL can be stored; if report creation then
    # fails, the orphan file is cleaned up.
    photo_url = storage.save(photo) if photo is not None else None

    try:
        return await report_service.create_report(
            db,
            current_user,
            station_id=station_id,
            fuel_type_code=fuel_type_code,
            price_per_litre=price_per_litre,
            queue_length=queue_length,
            notes=notes,
            photo_url=photo_url,
        )
    except report_service.StationNotFound as exc:
        if photo_url:
            storage.delete(photo_url)
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ValueError as exc:
        if photo_url:
            storage.delete(photo_url)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.get("", response_model=PaginatedReports, summary="List reports (public feed)")
async def list_reports(
    db: Annotated[AsyncSession, Depends(get_db)],
    station_id: Annotated[Optional[uuid.UUID], Query()] = None,
    fuel_type_code: Annotated[Optional[str], Query(max_length=8)] = None,
    report_status: Annotated[Optional[ReportStatus], Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=report_service.MAX_PAGE_SIZE)
    ] = report_service.DEFAULT_PAGE_SIZE,
) -> PaginatedReports:
    filters = report_service.ReportFilters(
        station_id=station_id,
        fuel_type_code=fuel_type_code,
        status=report_status,
    )
    return await report_service.list_reports(db, filters, page, page_size)


@router.get(
    "/{report_id}",
    response_model=FuelReportPublic,
    summary="Get a single report",
)
async def get_report(
    report_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FuelReportPublic:
    report = await report_service.get_report(db, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fuel report not found")
    return report
