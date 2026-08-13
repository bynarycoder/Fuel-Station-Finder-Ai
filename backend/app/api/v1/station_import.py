"""
Station import API — the sanctioned endpoint for ingesting genuine station
data (staff only: Admin & Station Manager).

``POST /api/v1/stations/import`` accepts a JSON list of validated station
records and performs an **idempotent upsert** against the catalogue: records
whose ``source_id`` (or ``(name, city)`` business key) already exist update the
existing row; new records are inserted. Invalid records are reported
per-index and never block the valid ones.

Authorization is enforced server-side (``require_roles``); a frontend
``isAdmin`` flag can never bypass it.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models import UserRole
from app.schemas.station_import import (
    StationImportRequest,
    StationImportResponse,
)
from app.services.station_import import import_stations, parse_records

router = APIRouter(prefix="/stations", tags=["Station Import"])

_STAFF_ONLY = require_roles(UserRole.ADMIN, UserRole.STATION_MANAGER)


@router.post(
    "/import",
    response_model=StationImportResponse,
    dependencies=[Depends(_STAFF_ONLY)],
    summary="Import station records (idempotent upsert, staff only)",
)
async def import_stations_endpoint(
    payload: StationImportRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StationImportResponse:
    records, per_index_errors = parse_records(payload.records)
    if not records and per_index_errors:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "No valid station records were provided.",
                "errors": per_index_errors,
            },
        )

    summary = await import_stations(db, records)
    # Per-index validation errors are surfaced alongside the upsert summary so
    # a caller can fix and resubmit only the rejected records.
    summary.errors.extend(per_index_errors)
    return StationImportResponse(**summary.to_dict())
