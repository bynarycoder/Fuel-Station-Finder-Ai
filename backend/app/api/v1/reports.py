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
from starlette.concurrency import run_in_threadpool

from app.api.deps import CurrentUser, require_roles
from app.core.database import get_db
from app.models import QueueLength, ReportStatus, UserRole
from app.schemas import FuelReportPublic, PaginatedReports, VerificationResultPublic
from app.services import reports as report_service
from app.services.ai import AINotConfiguredError
from app.services.ai.gemini import (
    VERIFICATION_THRESHOLD,
    GeminiVerificationError,
    analyze_queue_image,
)
from app.services.storage import (
    ImageStorage,
    StorageUnavailableError,
    get_image_storage,
)

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
    # fails, the orphan file is cleaned up. Storage I/O (local disk or a Supabase
    # HTTP round-trip) is offloaded to a worker thread so the event loop never
    # blocks on it.
    photo_url = (
        await run_in_threadpool(storage.save, photo) if photo is not None else None
    )

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
            await run_in_threadpool(storage.delete, photo_url)
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ValueError as exc:
        if photo_url:
            await run_in_threadpool(storage.delete, photo_url)
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
    "/mine",
    response_model=PaginatedReports,
    summary="My reports (every status, incl. rejected + rejection reason)",
)
async def list_my_reports(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=report_service.MAX_PAGE_SIZE)
    ] = report_service.DEFAULT_PAGE_SIZE,
) -> PaginatedReports:
    """The authenticated user's own reports.

    Unlike the public feed — which hides rejected reports — this endpoint
    returns every status so the submitter can track ``pending`` →
    ``under_review`` → ``verified``/``rejected`` and read the reviewer's
    ``rejection_reason`` when applicable. Only the caller's own rows are ever
    returned (filtered server-side by ``user_id``).
    """
    return await report_service.list_my_reports(
        db, current_user.id, page=page, page_size=page_size
    )


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


@router.post(
    "/{report_id}/verify",
    response_model=VerificationResultPublic,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    summary="Verify a report's photo with Gemini (AI validation score)",
)
async def verify_report(
    report_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[ImageStorage, Depends(get_image_storage)],
) -> VerificationResultPublic:
    """Run Gemini image verification on the report's photo and return a score.

    High-confidence photos (score >= threshold) auto-promote the report to
    ``verified``; lower scores leave the status unchanged for manual review.
    """
    report = await report_service.get_report_for_verification(db, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fuel report not found")

    if not report.photo_url:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This report has no photo to verify.",
        )

    try:
        # Offload the blocking read (local disk or Supabase HTTP) to a worker
        # thread so it never blocks the async event loop.
        image_bytes, mime_type = await run_in_threadpool(
            storage.read_image, report.photo_url
        )
    except FileNotFoundError as exc:
        # A genuinely missing image (e.g. a legacy photo whose local file was
        # wiped) is still a 404.
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except StorageUnavailableError as exc:
        # A storage OUTAGE must never be mistaken for a lost image — surface a
        # clean 503 so the UI knows verification did not run.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Photo storage is temporarily unavailable. Please try again.",
        ) from exc

    try:
        result = analyze_queue_image(image_bytes, mime_type)
    except AINotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except GeminiVerificationError as exc:  # defensive; service normally returns error result
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Gemini verification is temporarily unavailable.",
        ) from exc

    if result.error:
        # Provider failed / returned unusable data. Persist nothing and
        # surface a clean 503 so the UI knows verification did not run.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"Gemini verification unavailable ({result.error}). Please try again shortly.",
        )

    # Persist the numeric AI confidence so it can be surfaced anywhere the
    # report appears (station detail, admin, feeds) without re-running the model.
    if result.score >= VERIFICATION_THRESHOLD:
        await report_service.mark_report_verified(db, report, result.score)
    else:
        # Score below threshold: keep the report pending but still store the
        # measured confidence for audit/UI purposes.
        report.ai_confidence_score = result.score
        await db.commit()

    return VerificationResultPublic(
        score=result.score,
        is_plausible=result.is_plausible,
        summary=result.summary,
        detected_attributes=result.detected_attributes,
        report_status=report.status,
        error=None,
    )
